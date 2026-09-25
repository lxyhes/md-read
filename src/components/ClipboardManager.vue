<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import AppIcon from './AppIcon.vue'

type ClipboardKind = 'text' | 'image'
type ClipboardFilter = 'all' | ClipboardKind

interface NativeClipboardSnapshot {
  kind: ClipboardKind
  signature?: string
  text?: string | null
  bytes?: number[] | null
  mime?: string | null
}

interface NativeClipboardSignature {
  kind: ClipboardKind | 'system'
  signature: string
}

interface ClipboardRecord {
  id: string
  signature: string
  kind: ClipboardKind
  text?: string
  imageDataUrl?: string
  mime?: string
  createdAt: number
  pinned: boolean
}

const emit = defineEmits<{ (event: 'notify', message: string): void }>()
const STORAGE_KEY = 'moyue:clipboard-history'
const CAPTURE_KEY = 'moyue:clipboard-capture-enabled'
const MAX_ITEMS = 80
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const POLL_INTERVAL = 2000
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function readStoredItems(): ClipboardRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ClipboardRecord[]
    return Array.isArray(value) ? value.filter((item) => item && (item.kind === 'text' || item.kind === 'image')) : []
  } catch {
    return []
  }
}

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16)
}

function browserSignature(snapshot: NativeClipboardSnapshot) {
  if (snapshot.kind === 'text') return `text:${hashText(snapshot.text ?? '')}`
  return `image:${(snapshot.bytes?.length ?? 0)}:${hashText((snapshot.bytes ?? []).slice(0, 512).join(','))}`
}

function bytesToDataUrl(bytes: number[], mime = 'image/png') {
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

function dataUrlToBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return []
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Array<number>(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const items = ref<ClipboardRecord[]>(readStoredItems())
const query = ref('')
const filter = ref<ClipboardFilter>('all')
const captureEnabled = ref(typeof localStorage === 'undefined' || localStorage.getItem(CAPTURE_KEY) !== 'false')
const selectedId = ref<string | null>(items.value[0]?.id ?? null)
const copiedId = ref<string | null>(null)
const isReading = ref(false)
const lastReadAt = ref<number | null>(null)
const errorMessage = ref('')
const statusMessage = ref('')
let pollTimer: number | null = null
let lastClipboardMarker = ''
let lastSignature = items.value[0]?.signature ?? ''
let statusTimer: number | null = null
let persistTimer: number | null = null

const platformLabel = computed(() => {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/Macintosh|Mac OS X/i.test(agent)) return 'macOS'
  if (/Windows/i.test(agent)) return 'Windows'
  return '桌面系统'
})

const filteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return items.value
    .filter((item) => filter.value === 'all' || item.kind === filter.value)
    .filter((item) => !needle || (item.text ?? '').toLowerCase().includes(needle) || (item.kind === 'image' && '图片'.includes(needle)))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.createdAt - left.createdAt)
})

const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
const pinnedCount = computed(() => items.value.filter((item) => item.pinned).length)
const textCount = computed(() => items.value.filter((item) => item.kind === 'text').length)
const imageCount = computed(() => items.value.filter((item) => item.kind === 'image').length)
const captureStatus = computed(() => captureEnabled.value ? '正在监测系统剪贴板' : '监测已暂停')

function persistNow() {
  const ordered = [...items.value].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.createdAt - left.createdAt)
  items.value = ordered.slice(0, MAX_ITEMS)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value)) } catch {
    errorMessage.value = '历史保存空间不足，图片条目可能无法保留'
  }
}

function persist() {
  if (persistTimer !== null) return
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    persistNow()
  }, 160)
}

function flash(message: string) {
  statusMessage.value = message
  emit('notify', message)
  if (statusTimer !== null) window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => { statusMessage.value = '' }, 2400)
}

async function readClipboard(): Promise<NativeClipboardSnapshot | null> {
  if (isTauri()) return await invoke<NativeClipboardSnapshot | null>('read_clipboard_snapshot')
  if (!navigator.clipboard?.readText) return null
  const text = await navigator.clipboard.readText()
  return { kind: 'text', text, signature: `text:${hashText(text)}` }
}

async function readClipboardSignature(): Promise<NativeClipboardSignature | null> {
  if (isTauri()) return await invoke<NativeClipboardSignature | null>('read_clipboard_signature')
  if (!navigator.clipboard?.readText) return null
  const text = await navigator.clipboard.readText()
  return text ? { kind: 'text', signature: `text:${hashText(text)}` } : null
}

async function checkClipboard(manual = false) {
  if ((!captureEnabled.value && !manual) || isReading.value) return
  isReading.value = true
  errorMessage.value = ''
  try {
    const marker = await readClipboardSignature()
    if (!marker || marker.signature === lastClipboardMarker) return
    const snapshot = await readClipboard()
    if (!snapshot || (snapshot.kind === 'text' && !snapshot.text?.length)) {
      lastClipboardMarker = marker.signature
      return
    }
    lastClipboardMarker = marker.signature
    const signature = snapshot.signature || marker.signature || browserSignature(snapshot)
    if (signature === lastSignature) return
    lastSignature = signature
    if (snapshot.kind === 'image' && !snapshot.bytes?.length) return
    if (snapshot.kind === 'image' && (snapshot.bytes?.length ?? 0) > MAX_IMAGE_BYTES) {
      errorMessage.value = '这张图片超过 6 MB，已跳过保存'
      return
    }
    const record: ClipboardRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      signature,
      kind: snapshot.kind,
      text: snapshot.kind === 'text' ? snapshot.text ?? '' : undefined,
      imageDataUrl: snapshot.kind === 'image' && snapshot.bytes ? bytesToDataUrl(snapshot.bytes, snapshot.mime ?? 'image/png') : undefined,
      mime: snapshot.mime ?? undefined,
      createdAt: Date.now(),
      pinned: false,
    }
    items.value = [record, ...items.value.filter((item) => item.signature !== signature)]
    selectedId.value = record.id
    persist()
    lastReadAt.value = Date.now()
    flash(snapshot.kind === 'image' ? '已保存一条图片剪贴板' : '已保存一条文本剪贴板')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取系统剪贴板失败'
  } finally {
    isReading.value = false
  }
}

function stopPolling() {
  if (pollTimer !== null) window.clearInterval(pollTimer)
  pollTimer = null
}

function startPolling() {
  stopPolling()
  if (!captureEnabled.value) return
  void checkClipboard()
  pollTimer = window.setInterval(() => { void checkClipboard() }, POLL_INTERVAL)
}

function toggleCapture() {
  captureEnabled.value = !captureEnabled.value
  localStorage.setItem(CAPTURE_KEY, String(captureEnabled.value))
  if (captureEnabled.value) {
    startPolling()
    flash('已恢复监测系统剪贴板')
  } else {
    stopPolling()
    flash('已暂停监测，现有历史不会删除')
  }
}

async function copyItem(item: ClipboardRecord) {
  try {
    if (isTauri()) {
      await invoke('write_clipboard_snapshot', {
        kind: item.kind,
        text: item.text ?? null,
        bytes: item.kind === 'image' && item.imageDataUrl ? dataUrlToBytes(item.imageDataUrl) : null,
      })
    } else if (item.kind === 'text') {
      await navigator.clipboard.writeText(item.text ?? '')
    } else {
      throw new Error('浏览器预览不支持写入图片剪贴板')
    }
    lastSignature = item.signature
    copiedId.value = item.id
    flash('已复制回系统剪贴板')
    window.setTimeout(() => { if (copiedId.value === item.id) copiedId.value = null }, 1500)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '写入系统剪贴板失败'
  }
}

function togglePin(item: ClipboardRecord) {
  item.pinned = !item.pinned
  persist()
  flash(item.pinned ? '已置顶这条剪贴板' : '已取消置顶')
}

function removeItem(item: ClipboardRecord) {
  items.value = items.value.filter((entry) => entry.id !== item.id)
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null
  persist()
  flash('已删除这条剪贴板')
}

function clearHistory() {
  if (!items.value.length || !window.confirm('清空未置顶的剪贴板历史？置顶内容会保留。')) return
  items.value = items.value.filter((item) => item.pinned)
  selectedId.value = items.value[0]?.id ?? null
  persist()
  flash('未置顶历史已清空')
}

function selectItem(item: ClipboardRecord) {
  selectedId.value = item.id
}

function textPreview(text: string) {
  return text.replace(/\s+/g, ' ').trim() || '空白文本'
}

function textLines(text: string) {
  return text.split(/\r?\n/).length
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

onMounted(() => startPolling())
onUnmounted(() => {
  stopPolling()
  if (statusTimer !== null) window.clearTimeout(statusTimer)
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer)
    persistNow()
  }
})
</script>

<template>
  <section class="clipboard-page">
    <div class="clipboard-hero">
      <div class="clipboard-hero-copy">
        <span class="section-kicker">LOCAL CLIPBOARD / {{ platformLabel }}</span>
        <h1>让复制过的东西，<br /><em>有迹可循。</em></h1>
        <p>在 macOS 或 Windows 上捕捉最近复制的文本与图片。内容只保存在这台设备，随时可以暂停监测。</p>
      </div>
      <div class="clipboard-signal" aria-hidden="true">
        <span class="signal-ring signal-ring-one" />
        <span class="signal-ring signal-ring-two" />
        <span class="signal-core"><AppIcon name="clipboard" :size="30" /></span>
        <i v-for="index in 7" :key="index" :class="`signal-dot signal-dot-${index}`" />
      </div>
    </div>

    <div class="clipboard-toolbar">
      <div class="clipboard-toolbar-status"><span class="status-pulse" :class="{ paused: !captureEnabled }" /><span>{{ captureStatus }}</span><small v-if="lastReadAt">· {{ formatTime(lastReadAt) }} 更新</small></div>
      <div class="clipboard-toolbar-actions">
        <button class="clipboard-quiet-action" type="button" @click="checkClipboard(true)"><AppIcon name="sync" :size="13" />立即读取</button>
        <button class="clipboard-quiet-action" type="button" @click="toggleCapture"><AppIcon :name="captureEnabled ? 'eye' : 'close'" :size="13" />{{ captureEnabled ? '暂停监测' : '恢复监测' }}</button>
        <button class="clipboard-clear-action" type="button" :disabled="!items.length || !items.some((item) => !item.pinned)" @click="clearHistory"><AppIcon name="trash" :size="13" />清空未置顶</button>
      </div>
    </div>

    <div class="clipboard-workspace">
      <div class="clipboard-library">
        <div class="clipboard-library-heading">
          <div><span class="section-kicker">RECENT COPIES</span><h2>最近复制 <b>{{ items.length }}</b></h2></div>
          <div class="clipboard-counts"><span>{{ textCount }} 文本</span><span>{{ imageCount }} 图片</span></div>
        </div>
        <div class="clipboard-filter-row">
          <div class="clipboard-filters" role="tablist" aria-label="剪贴板类型">
            <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部 <b>{{ items.length }}</b></button>
            <button type="button" :class="{ active: filter === 'text' }" @click="filter = 'text'"><AppIcon name="type" :size="12" />文本 <b>{{ textCount }}</b></button>
            <button type="button" :class="{ active: filter === 'image' }" @click="filter = 'image'"><AppIcon name="image" :size="12" />图片 <b>{{ imageCount }}</b></button>
          </div>
          <label class="clipboard-search"><AppIcon name="search" :size="13" /><input v-model="query" type="search" placeholder="搜索历史内容…" aria-label="搜索剪贴板历史" /><button v-if="query" type="button" aria-label="清空搜索" @click="query = ''"><AppIcon name="close" :size="11" /></button></label>
        </div>

        <div v-if="filteredItems.length" class="clipboard-list">
          <article v-for="item in filteredItems" :key="item.id" class="clipboard-item" :class="{ selected: selectedId === item.id, pinned: item.pinned }" tabindex="0" @click="selectItem(item)" @keydown.enter="selectItem(item)">
            <div class="clipboard-item-marker" :class="item.kind"><AppIcon :name="item.kind === 'image' ? 'image' : 'type'" :size="14" /></div>
            <div class="clipboard-item-body">
              <div class="clipboard-item-meta"><span>{{ item.kind === 'image' ? '图片' : '文本' }}</span><time>{{ formatTime(item.createdAt) }}</time><span v-if="item.pinned" class="clipboard-pinned-label"><AppIcon name="star" :size="10" />置顶</span></div>
              <p v-if="item.kind === 'text'">{{ textPreview(item.text ?? '') }}</p>
              <div v-else class="clipboard-image-preview"><img :src="item.imageDataUrl" alt="剪贴板图片" loading="lazy" /></div>
              <small v-if="item.kind === 'text'">{{ textLines(item.text ?? '') }} 行 · {{ (item.text ?? '').length }} 字符</small>
              <small v-else>PNG 图片 · 点击查看详情</small>
            </div>
            <div class="clipboard-item-actions">
              <button type="button" :aria-label="item.pinned ? '取消置顶' : '置顶'" :title="item.pinned ? '取消置顶' : '置顶'" :class="{ active: item.pinned }" @click.stop="togglePin(item)"><AppIcon name="star" :size="14" /></button>
              <button type="button" :aria-label="copiedId === item.id ? '已复制' : '复制回系统剪贴板'" :title="copiedId === item.id ? '已复制' : '复制回系统剪贴板'" @click.stop="copyItem(item)"><AppIcon :name="copiedId === item.id ? 'check' : 'copy'" :size="14" /></button>
              <button type="button" aria-label="删除" title="删除" @click.stop="removeItem(item)"><AppIcon name="trash" :size="14" /></button>
            </div>
          </article>
        </div>
        <div v-else class="clipboard-empty">
          <span class="clipboard-empty-icon"><AppIcon :name="query || filter !== 'all' ? 'search' : 'clipboard'" :size="24" /></span>
          <strong>{{ query || filter !== 'all' ? '没有匹配的剪贴板' : '还没有剪贴板记录' }}</strong>
          <p>{{ query || filter !== 'all' ? '换个关键词或切换筛选条件试试。' : '复制一段文字或一张图片，它会出现在这里。' }}</p>
        </div>
      </div>

      <aside class="clipboard-detail" aria-label="剪贴板详情">
        <div class="clipboard-detail-heading"><span class="section-kicker">INSPECTED ITEM</span><span>{{ pinnedCount }} 条置顶</span></div>
        <div v-if="selectedItem" class="clipboard-detail-card">
          <div class="clipboard-detail-type"><span class="clipboard-detail-type-icon" :class="selectedItem.kind"><AppIcon :name="selectedItem.kind === 'image' ? 'image' : 'type'" :size="16" /></span><span><strong>{{ selectedItem.kind === 'image' ? '图片剪贴板' : '文本剪贴板' }}</strong><small>{{ formatTime(selectedItem.createdAt) }}</small></span></div>
          <div v-if="selectedItem.kind === 'image'" class="clipboard-detail-image"><img :src="selectedItem.imageDataUrl" alt="选中的剪贴板图片" /></div>
          <pre v-else class="clipboard-detail-text">{{ selectedItem.text }}</pre>
          <button class="clipboard-copy-button" type="button" @click="copyItem(selectedItem)"><AppIcon name="copy" :size="14" />复制回系统剪贴板</button>
          <div class="clipboard-detail-note"><AppIcon name="info" :size="13" /><span>历史默认保留最近 {{ MAX_ITEMS }} 条；置顶内容不会被清空。</span></div>
        </div>
        <div v-else class="clipboard-detail-empty"><AppIcon name="clipboard" :size="22" /><span>选中一条记录查看完整内容</span></div>
      </aside>
    </div>

    <p v-if="errorMessage" class="clipboard-message error" role="status"><AppIcon name="info" :size="13" />{{ errorMessage }}</p>
    <p v-else-if="statusMessage" class="clipboard-message" role="status"><AppIcon name="check" :size="13" />{{ statusMessage }}</p>
    <div class="clipboard-privacy-note"><span class="note-line" /><span>本地保存 · 不上传 · 可随时暂停监测</span></div>
  </section>
</template>

<style scoped>
.clipboard-page { flex: 1; overflow: auto; padding: 54px clamp(28px, 6vw, 94px) 44px; scrollbar-width: thin; scrollbar-color: var(--accent-soft) transparent; }
.clipboard-page button, .clipboard-page input { font-family: var(--ui-font); }
.clipboard-hero, .clipboard-toolbar, .clipboard-workspace, .clipboard-privacy-note, .clipboard-message { width: min(1180px, 100%); margin-inline: auto; }
.clipboard-hero { display: flex; min-height: 272px; align-items: center; justify-content: space-between; gap: 40px; }
.clipboard-hero-copy { min-width: 0; }
.clipboard-hero h1 { margin: 16px 0 14px; color: var(--ink); font-size: clamp(39px, 5vw, 66px); font-weight: 400; letter-spacing: -.055em; line-height: .98; }
.clipboard-hero h1 em { color: var(--accent); font-style: italic; }
.clipboard-hero p { max-width: 510px; margin: 0; color: var(--muted); font: 13px/1.75 var(--ui-font); }
.clipboard-signal { position: relative; width: 238px; height: 238px; flex: 0 0 238px; margin-right: 6%; transform: rotate(-12deg); }
.signal-ring { position: absolute; border: 1px solid color-mix(in srgb, var(--accent) 43%, transparent); border-radius: 50%; }
.signal-ring-one { inset: 10px; border-style: dashed; }
.signal-ring-two { inset: 40px; border-color: color-mix(in srgb, var(--accent) 22%, transparent); }
.signal-core { position: absolute; top: 84px; left: 84px; z-index: 2; display: grid; width: 70px; height: 70px; place-items: center; border: 1px solid var(--accent); border-radius: 18px 18px 18px 5px; background: color-mix(in srgb, var(--accent) 18%, var(--surface)); color: var(--accent); box-shadow: 0 0 36px color-mix(in srgb, var(--accent) 20%, transparent); transform: rotate(12deg); }
.signal-dot { position: absolute; display: block; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 55%, transparent); }
.signal-dot-1 { top: 33px; left: 90px; }.signal-dot-2 { top: 77px; right: 19px; opacity: .72; }.signal-dot-3 { right: 52px; bottom: 37px; opacity: .48; }.signal-dot-4 { bottom: 17px; left: 94px; opacity: .75; }.signal-dot-5 { bottom: 64px; left: 18px; opacity: .55; }.signal-dot-6 { top: 48px; left: 37px; opacity: .4; }.signal-dot-7 { top: 120px; right: 7px; opacity: .7; }
.clipboard-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 0 14px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.clipboard-toolbar-status, .clipboard-toolbar-actions, .clipboard-detail-heading, .clipboard-detail-type, .clipboard-item-meta, .clipboard-filter-row, .clipboard-library-heading, .clipboard-counts, .clipboard-privacy-note, .clipboard-message { display: flex; align-items: center; }
.clipboard-toolbar-status { gap: 8px; color: var(--muted); font: 11px var(--ui-font); }.clipboard-toolbar-status small { color: color-mix(in srgb, var(--muted) 72%, transparent); font-size: 9px; }
.status-pulse { width: 7px; height: 7px; border-radius: 50%; background: #65c59a; box-shadow: 0 0 0 4px color-mix(in srgb, #65c59a 14%, transparent); }.status-pulse.paused { background: var(--muted); box-shadow: none; }
.clipboard-toolbar-actions { gap: 8px; }.clipboard-quiet-action, .clipboard-clear-action { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--muted); font-size: 10px; }.clipboard-quiet-action:hover, .clipboard-clear-action:hover { border-color: var(--border); background: var(--surface-raised); color: var(--ink); }.clipboard-clear-action { color: color-mix(in srgb, #df7c7c 75%, var(--muted)); }.clipboard-clear-action:disabled { opacity: .45; cursor: not-allowed; }
.clipboard-workspace { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(260px, .7fr); gap: 20px; margin-top: 27px; }
.clipboard-library { min-width: 0; }.clipboard-library-heading { justify-content: space-between; gap: 20px; }.clipboard-library-heading h2 { margin: 7px 0 0; color: var(--ink); font-size: 24px; font-weight: 400; letter-spacing: -.035em; }.clipboard-library-heading h2 b { margin-left: 5px; color: var(--accent); font: 11px var(--mono); }.clipboard-counts { gap: 10px; color: var(--muted); font: 9px var(--ui-font); }.clipboard-counts span + span { padding-left: 10px; border-left: 1px solid var(--border); }
.clipboard-filter-row { justify-content: space-between; gap: 14px; margin: 20px 0 10px; }.clipboard-filters { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid var(--border); border-radius: 8px; background: color-mix(in srgb, var(--surface) 75%, transparent); }.clipboard-filters button { display: inline-flex; align-items: center; gap: 5px; padding: 7px 9px; border-radius: 5px; background: transparent; color: var(--muted); font-size: 10px; }.clipboard-filters button:hover, .clipboard-filters button.active { background: color-mix(in srgb, var(--accent) 17%, var(--surface)); color: var(--ink); }.clipboard-filters b { color: var(--accent); font: 9px var(--mono); }
.clipboard-search { display: flex; min-width: 180px; align-items: center; gap: 7px; padding: 8px 9px; border: 1px solid var(--border); border-radius: 7px; background: color-mix(in srgb, var(--surface) 74%, transparent); color: var(--muted); }.clipboard-search:focus-within { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); }.clipboard-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 10px; }.clipboard-search input::placeholder { color: var(--muted); }.clipboard-search button { display: grid; place-items: center; padding: 2px; background: transparent; color: var(--muted); }
.clipboard-list { display: grid; gap: 7px; }.clipboard-item { position: relative; display: flex; min-width: 0; gap: 11px; padding: 12px 12px 12px 11px; border: 1px solid var(--border); border-radius: 10px; background: color-mix(in srgb, var(--surface-raised) 60%, transparent); outline: none; transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease; }.clipboard-item:hover, .clipboard-item:focus-visible, .clipboard-item.selected { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: color-mix(in srgb, var(--accent) 7%, var(--surface-raised)); box-shadow: 0 10px 25px color-mix(in srgb, var(--app-bg) 18%, transparent); }.clipboard-item.selected { transform: translateX(3px); }.clipboard-item.pinned { border-left: 2px solid var(--accent); }.clipboard-item-marker { display: grid; width: 29px; height: 29px; flex: 0 0 29px; place-items: center; margin-top: 1px; border-radius: 7px; background: color-mix(in srgb, var(--accent) 13%, var(--surface)); color: var(--accent); }.clipboard-item-marker.image { color: color-mix(in srgb, #d88cbd 78%, var(--accent)); background: color-mix(in srgb, #d88cbd 12%, var(--surface)); }.clipboard-item-body { min-width: 0; flex: 1; }.clipboard-item-meta { gap: 8px; color: var(--muted); font: 9px var(--ui-font); }.clipboard-item-meta time { margin-left: auto; color: color-mix(in srgb, var(--muted) 76%, transparent); }.clipboard-pinned-label { display: inline-flex; align-items: center; gap: 3px; color: var(--accent); }.clipboard-item-body p { display: -webkit-box; max-width: 100%; margin: 7px 0 5px; overflow: hidden; color: var(--ink); font: 12px/1.55 var(--ui-font); -webkit-box-orient: vertical; -webkit-line-clamp: 3; }.clipboard-item-body > small { color: var(--muted); font: 9px var(--mono); }.clipboard-image-preview { height: 116px; margin: 8px 0 6px; overflow: hidden; border-radius: 7px; background: color-mix(in srgb, var(--app-bg) 36%, var(--surface)); }.clipboard-image-preview img { display: block; width: 100%; height: 100%; object-fit: contain; }.clipboard-item-actions { display: flex; align-self: center; gap: 2px; opacity: 0; transition: opacity .18s ease; }.clipboard-item:hover .clipboard-item-actions, .clipboard-item:focus-within .clipboard-item-actions, .clipboard-item.selected .clipboard-item-actions { opacity: 1; }.clipboard-item-actions button { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 6px; background: transparent; color: var(--muted); }.clipboard-item-actions button:hover, .clipboard-item-actions button.active { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.clipboard-empty { display: grid; min-height: 320px; place-content: center; justify-items: center; gap: 9px; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); text-align: center; }.clipboard-empty-icon { display: grid; width: 48px; height: 48px; place-items: center; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border)); border-radius: 14px 14px 14px 5px; background: color-mix(in srgb, var(--accent) 9%, transparent); color: var(--accent); }.clipboard-empty strong { color: var(--ink); font: 600 12px var(--ui-font); }.clipboard-empty p { margin: 0; font: 10px var(--ui-font); }
.clipboard-detail { min-width: 0; padding-left: 20px; border-left: 1px solid var(--border); }.clipboard-detail-heading { justify-content: space-between; gap: 12px; }.clipboard-detail-heading > span:last-child { color: var(--muted); font: 9px var(--ui-font); }.clipboard-detail-card { margin-top: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: linear-gradient(150deg, color-mix(in srgb, var(--surface-raised) 82%, transparent), color-mix(in srgb, var(--surface) 90%, transparent)); }.clipboard-detail-type { gap: 9px; }.clipboard-detail-type-icon { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 8px; background: color-mix(in srgb, var(--accent) 15%, var(--surface)); color: var(--accent); }.clipboard-detail-type-icon.image { color: #d88cbd; background: color-mix(in srgb, #d88cbd 13%, var(--surface)); }.clipboard-detail-type strong, .clipboard-detail-type small { display: block; }.clipboard-detail-type strong { color: var(--ink); font: 600 11px var(--ui-font); }.clipboard-detail-type small { margin-top: 3px; color: var(--muted); font: 9px var(--mono); }.clipboard-detail-text { max-height: 270px; margin: 18px 0 12px; padding: 12px; overflow: auto; border: 1px solid var(--border); border-radius: 7px; background: color-mix(in srgb, var(--app-bg) 35%, transparent); color: var(--ink); white-space: pre-wrap; word-break: break-word; font: 11px/1.65 var(--mono); }.clipboard-detail-image { display: grid; min-height: 170px; max-height: 300px; margin: 18px 0 12px; place-items: center; overflow: hidden; border: 1px solid var(--border); border-radius: 7px; background: color-mix(in srgb, var(--app-bg) 35%, transparent); }.clipboard-detail-image img { display: block; width: 100%; height: 100%; max-height: 300px; object-fit: contain; }.clipboard-copy-button { display: flex; width: 100%; align-items: center; justify-content: center; gap: 6px; padding: 9px; border-radius: 7px; background: var(--accent); color: var(--app-bg); font-size: 10px; font-weight: 700; }.clipboard-copy-button:hover { filter: brightness(1.08); transform: translateY(-1px); }.clipboard-detail-note { display: flex; gap: 7px; margin-top: 13px; color: var(--muted); font: 9px/1.55 var(--ui-font); }.clipboard-detail-note .app-icon { flex: 0 0 auto; margin-top: 1px; color: var(--accent); }.clipboard-detail-empty { display: grid; min-height: 190px; place-content: center; justify-items: center; gap: 9px; color: var(--muted); text-align: center; font: 10px var(--ui-font); }.clipboard-detail-empty .app-icon { color: var(--accent); }.clipboard-message { gap: 7px; margin-top: 18px; color: #72cbb0; font: 10px var(--ui-font); }.clipboard-message.error { color: #e98b8b; }.clipboard-message .app-icon { flex: 0 0 auto; }.clipboard-privacy-note { justify-content: center; gap: 9px; margin-top: 27px; color: var(--muted); font: 9px var(--ui-font); }.note-line { width: 32px; height: 1px; background: var(--accent); }
@media (max-width: 920px) { .clipboard-hero { min-height: 230px; }.clipboard-signal { width: 174px; height: 174px; flex-basis: 174px; margin-right: 0; }.signal-core { top: 61px; left: 61px; }.clipboard-workspace { grid-template-columns: minmax(0, 1fr); }.clipboard-detail { padding: 18px 0 0; border-top: 1px solid var(--border); border-left: 0; } }
@media (max-width: 680px) { .clipboard-page { padding: 30px 18px; }.clipboard-hero { align-items: start; }.clipboard-signal { display: none; }.clipboard-toolbar, .clipboard-filter-row { align-items: start; flex-direction: column; }.clipboard-toolbar-actions { flex-wrap: wrap; }.clipboard-search { width: 100%; }.clipboard-item-actions { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .clipboard-item, .clipboard-item-actions, .clipboard-copy-button { transition: none; } }
</style>
