<script lang="ts">
// Serialize native operations across close/reopen so an old panel cannot close the new one.
let queue = Promise.resolve(true)

export function hideNativeWebPreviews() {
  if (!isTauri()) return
  queue = queue.then(async () => {
    await invoke('web_preview', { action: 'hide-all', session: '' })
    return true
  }).catch((cause) => {
    console.warn('收起网页预览失败', cause)
    return false
  })
}
</script>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import AppIcon from './AppIcon.vue'
import { parseWebPreviewAddress } from '../webPreviewAddress'

const props = defineProps<{ url: string; session: string; name?: string; layoutKey?: string; compact?: boolean; draft?: { text: string; copied: Promise<boolean> } }>()
const emit = defineEmits<{ close: []; external: [url: string]; navigate: [url: string]; 'open-web': [url: string]; 'draft-done': [] }>()
const native = isTauri()
const surface = ref<HTMLElement | null>(null)
const frame = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref(props.url)
const address = ref(props.url)
const addressFocused = ref(false)
const title = ref('网页预览')
const loading = ref(true)
const error = ref('')
const delayed = ref(false)
const feedback = ref('')
const draftFeedback = ref('')
const zoomKey = `moyue:web-preview-zoom:${props.session || 'web'}`
const savedZoom = Number(localStorage.getItem(zoomKey) ?? 100)
const zoomPercent = ref(Number.isInteger(savedZoom) && savedZoom >= 60 && savedZoom <= 150 ? savedZoom : 100)
const zoomBusy = ref(false)
let alive = true
let ready = false
const draftReady = ref(false)
let resizeQueued = false
let observer: ResizeObserver | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let unlisten: UnlistenFn[] = []

function bounds() {
  const rect = surface.value?.getBoundingClientRect()
  return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
}
function command(action: string, url: string | null = null, zoom: number | null = null) {
  queue = queue.then(async () => {
    if (action === 'resize') resizeQueued = false
    if (!alive && action !== 'close') return false
    const rect = action === 'open' || action === 'resume' || action === 'resize' ? bounds() : null
    if (action === 'resize' && (error.value || !rect)) return false
    await invoke<string | null>('web_preview', { action, session: props.session, url, bounds: rect, zoom })
    return true
  })
    .catch(async (cause) => {
      if (action === 'zoom' || action === 'forward' || action === 'back') {
        if (alive) feedback.value = String(cause)
        return false
      }
      if (action === 'close') console.warn('收起网页预览失败', cause)
      else if (alive) { error.value = String(cause); finished() }
      if (action !== 'close') await invoke('web_preview', { action: 'close', session: props.session, url: null, bounds: null }).catch(() => {})
      return false
    })
  return queue
}
function finished() { loading.value = false; delayed.value = false; clearTimeout(timer) }
function startLoading() {
  loading.value = true; delayed.value = false; error.value = ''; feedback.value = ''; clearTimeout(timer)
  timer = setTimeout(() => { if (alive && loading.value) delayed.value = true }, 15000)
}
async function open(action: 'open' | 'resume', url = props.url) {
  currentUrl.value = url; title.value = '网页预览'; startLoading()
  await nextTick()
  if (alive && native && await command(action, url) && zoomPercent.value !== 100) {
    await command('zoom', null, zoomPercent.value / 100)
  }
}
function goHistory(direction: 'back' | 'forward') {
  feedback.value = ''
  if (native) void command(direction)
  else {
    try { frame.value?.contentWindow?.history[direction]() }
    catch { feedback.value = '浏览器版无法控制跨站网页的历史记录' }
  }
}
function reload() {
  if (error.value) {
    void open('open', currentUrl.value)
    return
  }
  startLoading()
  if (native) void command('reload')
  else if (frame.value) frame.value.src = currentUrl.value
}
async function changeZoom(percent: number) {
  percent = Math.min(150, Math.max(60, percent))
  if (zoomBusy.value || percent === zoomPercent.value) return
  zoomBusy.value = true
  feedback.value = ''
  try {
    if (await command('zoom', null, percent / 100)) {
      zoomPercent.value = percent
      localStorage.setItem(zoomKey, String(percent))
    }
  } finally { zoomBusy.value = false }
}
async function readAddress() {
  if (native && !error.value) {
    const url = await invoke<string | null>('web_preview', { action: 'address', session: props.session })
      .catch(() => null)
    if (url) currentUrl.value = url
  }
  return currentUrl.value
}
async function copyAddress() {
  try {
    await navigator.clipboard.writeText(await readAddress())
    feedback.value = '已复制网址'
  } catch { feedback.value = '无法访问剪贴板，请手动复制网址' }
}
async function openInBrowser() {
  // Keep window.open in the click handler for browsers with popup blocking.
  emit('external', native ? await readAddress() : currentUrl.value)
}
function submitAddress() {
  const url = parseWebPreviewAddress(address.value)
  if (!url) { feedback.value = '请输入有效的 HTTP 或 HTTPS 网址'; return }
  address.value = url
  feedback.value = ''
  if (url === currentUrl.value && !error.value) return
  if (props.session) emit('open-web', url)
  else if (url === props.url) void open('open', url)
  else emit('navigate', url)
}
function scheduleResize() {
  if (!native || !alive || !ready || error.value || resizeQueued) return
  resizeQueued = true
  void command('resize')
}
watch(() => props.layoutKey, scheduleResize, { flush: 'post' })
watch(() => props.url, () => { if (ready) void open('open') })
watch(currentUrl, (url) => { if (!addressFocused.value) address.value = url })

watch([draftReady, () => props.draft], ([canFill, draft], _, onCleanup) => {
  if (!canFill || !draft) return
  const { text, copied } = draft
  draftFeedback.value = ''
  let pending = true
  let retry: ReturnType<typeof setTimeout> | undefined
  const deadline = setTimeout(() => void finish('unsupported'), 10000)
  function stop() {
    pending = false
    clearTimeout(deadline)
    clearTimeout(retry)
  }
  async function finish(result: string) {
    if (!alive || !pending || props.draft !== draft) return
    stop()
    if (result === 'filled') draftFeedback.value = '已填入 AI 输入框'
    else {
      const canPaste = await copied
      if (!alive || props.draft !== draft) return
      const reason = result === 'occupied' ? '输入框已有内容' : '暂时无法自动填入'
      draftFeedback.value = canPaste ? `${reason}，可按 Ctrl+V 或 ⌘V 粘贴选中文字` : `${reason}，请手动复制选中文字`
    }
    emit('draft-done')
  }
  async function attempt() {
    const result = await invoke<string | null>('web_preview', { action: 'fill-draft', session: props.session, draft: text })
      .catch(() => null)
    if (!alive || !pending || props.draft !== draft) return
    if (result === 'waiting') retry = setTimeout(attempt, 300)
    else await finish(result ?? 'unsupported')
  }
  onCleanup(stop)
  void attempt()
})

onMounted(async () => {
  if (native) {
    const subscriptions = await Promise.all([
      listen<{ session: string; title?: string; url?: string; loading?: boolean }>('web-preview-update', ({ payload }) => {
        if (!alive || payload.session !== props.session) return
        if (payload.title) title.value = payload.title
        if (payload.url) currentUrl.value = payload.url
        if (payload.loading === false) finished()
        else if (payload.loading === true) startLoading()
      }),
      listen<{ session: string; url: string }>('web-preview-popup', ({ payload }) => {
        if (alive && payload.session === props.session) emit('navigate', payload.url)
      }),
    ]).catch(() => [] as UnlistenFn[])
    if (!alive) { subscriptions.forEach((stop) => stop()); return }
    unlisten = subscriptions
    observer = new ResizeObserver(scheduleResize)
    if (surface.value) observer.observe(surface.value)
  }
  if (alive) {
    ready = true
    await open(props.session ? 'resume' : 'open')
    if (alive && native) draftReady.value = true
  }
})
onUnmounted(() => {
  alive = false; clearTimeout(timer); observer?.disconnect(); unlisten.forEach((stop) => stop())
  if (native) void command('close')
})
</script>

<template>
  <section class="web-preview-panel" :class="{ 'is-compact': compact }" :aria-label="name ?? '网页预览'">
    <header class="web-preview-header">
      <div class="web-preview-heading">
        <AppIcon name="external" :size="16" /><strong :title="title">{{ name ?? title }}</strong>
        <div v-if="native" class="web-preview-zoom" role="group" aria-label="网页缩放">
          <button type="button" aria-label="缩小网页" title="缩小网页" :disabled="loading || !!error || zoomBusy || zoomPercent <= 60"
            @keydown.enter.stop @click="changeZoom(zoomPercent - 10)"><AppIcon name="zoom-out" :size="14" /></button>
          <button type="button" title="恢复网页缩放至 100%" :aria-label="`当前缩放 ${zoomPercent}%，恢复默认`"
            :disabled="loading || !!error || zoomBusy || zoomPercent === 100" @keydown.enter.stop @click="changeZoom(100)">{{ zoomPercent }}%</button>
          <button type="button" aria-label="放大网页" title="放大网页" :disabled="loading || !!error || zoomBusy || zoomPercent >= 150"
            @keydown.enter.stop @click="changeZoom(zoomPercent + 10)"><AppIcon name="zoom-in" :size="14" /></button>
        </div>
        <button type="button" :aria-label="`关闭${name ?? '网页预览'}`" title="关闭" @keydown.enter.stop @click="emit('close')"><AppIcon name="close" :size="17" /></button>
      </div>
      <div class="web-preview-toolbar">
        <button type="button" aria-label="返回上一网页" title="返回上一网页" @keydown.enter.stop @click="goHistory('back')"><AppIcon name="chevron-left" :size="15" /></button>
        <button type="button" aria-label="前进到下一网页" title="前进到下一网页" @keydown.enter.stop @click="goHistory('forward')"><AppIcon name="chevron-right" :size="15" /></button>
        <button type="button" aria-label="重新加载网页" title="重新加载网页" @keydown.enter.stop @click="reload"><AppIcon name="sync" :size="15" /></button>
        <form class="web-preview-address" @submit.prevent="submitAddress">
          <input v-model="address" aria-label="网页地址，按回车打开" :title="currentUrl" type="text" inputmode="url" spellcheck="false"
            @focus="addressFocused = true" @blur="addressFocused = false" @keydown.enter.stop
            @keydown.esc.stop.prevent="address = currentUrl" />
        </form>
        <button type="button" aria-label="复制网址" title="复制网址" @keydown.enter.stop @click="copyAddress"><AppIcon name="copy" :size="14" /></button>
        <button type="button" aria-label="用系统浏览器打开" title="用系统浏览器打开" @keydown.enter.stop @click="openInBrowser"><AppIcon name="external" :size="14" /></button>
      </div>
      <div v-if="loading" class="web-preview-loading" role="status">正在加载网页…</div>
      <div v-else-if="feedback" class="web-preview-loading" role="status">{{ feedback }}</div>
      <div v-if="draftFeedback" class="web-preview-loading" role="status">{{ draftFeedback }}</div>
    </header>
    <div ref="surface" class="web-preview-surface">
      <div v-if="error" class="web-preview-error" role="alert"><strong>网页暂时无法预览</strong><p>{{ error }}</p><button type="button" @click="emit('external', currentUrl)">用系统浏览器打开</button></div>
      <iframe v-else-if="!native" ref="frame" :src="url" title="链接网页预览" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer" @load="finished" />
    </div>
    <footer v-if="!compact || delayed" class="web-preview-footer">{{ delayed ? '加载时间较长，可重新加载或用浏览器打开。' : native ? '网页独立加载 · 关闭预览不影响原文' : '浏览器版受网站嵌入限制；若空白，请用系统浏览器打开。' }}</footer>
  </section>
</template>

<style scoped>
.web-preview-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--surface, #fff); color: var(--ink); font: 13px/1.4 var(--ui-font); }
.web-preview-header { flex: none; border-bottom: 1px solid var(--border); }
.web-preview-heading { height: 44px; display: flex; align-items: center; gap: 9px; padding: 0 12px; }
.web-preview-heading > strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.web-preview-panel button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 34px; min-width: 34px; padding: 5px 7px; border-radius: 6px; background: transparent; color: var(--muted); font: 12px var(--ui-font); }
.web-preview-panel button:hover { background: var(--accent-soft); color: var(--ink); }
.web-preview-panel button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.web-preview-toolbar { display: flex; align-items: center; gap: 4px; padding: 0 10px 9px; }
.web-preview-address { min-width: 0; flex: 1; }
.web-preview-address input { width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); color: var(--ink); font: inherit; }
.web-preview-address input:focus-visible { outline: 1px solid var(--accent); }
.web-preview-zoom { display: flex; align-items: center; }
.web-preview-zoom button { min-width: 24px; padding-inline: 4px; }
.web-preview-panel button:disabled { opacity: .6; cursor: default; }
.web-preview-panel button:disabled:hover { background: transparent; color: var(--muted); }
.web-preview-loading { color: var(--accent); padding: 0 14px 7px; font-size: 11px; }
.web-preview-surface { position: relative; flex: 1; min-height: 0; background: #fff; }
.web-preview-surface iframe { width: 100%; height: 100%; border: 0; display: block; }
.web-preview-footer { flex: none; min-height: 27px; padding: 6px 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); }
.web-preview-error { padding: 32px 22px; color: #343b3a; }
.web-preview-error p { overflow-wrap: anywhere; font-size: 12px; }
.web-preview-error button { background: #e8f1ef; color: #23655e; }
.is-compact .web-preview-heading { height: 34px; }
.is-compact .web-preview-toolbar { padding-bottom: 4px; }
.is-compact button { min-height: 28px; min-width: 28px; }
</style>
