<script lang="ts">
// Serialize native operations across close/reopen so an old panel cannot close the new one.
let queue = Promise.resolve()
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ url: string; session: string; name?: string; layoutKey?: string; compact?: boolean }>()
const emit = defineEmits<{ close: []; external: [url: string]; navigate: [url: string] }>()
const native = isTauri()
const surface = ref<HTMLElement | null>(null)
const frame = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref(props.url)
const title = ref('网页预览')
const loading = ref(true)
const error = ref('')
const delayed = ref(false)
const host = computed(() => { try { return new URL(currentUrl.value).host } catch { return '' } })
let alive = true
let ready = false
let resizeQueued = false
let observer: ResizeObserver | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let unlisten: UnlistenFn[] = []

function bounds() {
  const rect = surface.value?.getBoundingClientRect()
  return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
}
function command(action: string, url: string | null = null) {
  queue = queue.then(() => {
    if (action === 'resize') resizeQueued = false
    if (!alive && action !== 'close') return
    const rect = action === 'open' || action === 'resume' || action === 'resize' ? bounds() : null
    if (action === 'resize' && (error.value || !rect)) return
    return invoke<void>('web_preview', { action, session: props.session, url, bounds: rect })
  })
    .catch(async (cause) => {
      if (alive) { error.value = String(cause); loading.value = false }
      if (action !== 'close') await invoke('web_preview', { action: 'close', session: props.session, url: null, bounds: null }).catch(() => {})
    })
  return queue
}
function finished() { loading.value = false; delayed.value = false; clearTimeout(timer) }
function startLoading() {
  loading.value = true; delayed.value = false; error.value = ''; clearTimeout(timer)
  timer = setTimeout(() => { if (alive && loading.value) delayed.value = true }, 15000)
}
async function open(action: 'open' | 'resume') {
  currentUrl.value = props.url; title.value = '网页预览'; startLoading()
  await nextTick()
  if (alive && native) await command(action, props.url)
}
function back() {
  if (native) void command('back')
  else { try { frame.value?.contentWindow?.history.back() } catch { error.value = '浏览器版无法控制跨站网页，请使用桌面端或系统浏览器。' } }
}
function reload() {
  startLoading()
  if (native) void command('reload')
  else if (frame.value) frame.value.src = currentUrl.value
}
function scheduleResize() {
  if (!native || !alive || !ready || error.value || resizeQueued) return
  resizeQueued = true
  void command('resize')
}
watch(() => props.layoutKey, scheduleResize, { flush: 'post' })
watch(() => props.url, () => { if (ready) void open('open') })

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
      <div class="web-preview-heading"><AppIcon name="external" :size="16" /><strong :title="title">{{ name ?? title }}</strong><button type="button" :aria-label="`关闭${name ?? '网页预览'}`" title="关闭" @click="emit('close')"><AppIcon name="close" :size="17" /></button></div>
      <div class="web-preview-toolbar">
        <button type="button" aria-label="返回上一网页" title="返回上一网页" @click="back">←</button>
        <button type="button" aria-label="重新加载网页" title="重新加载网页" @click="reload"><AppIcon name="sync" :size="15" /></button>
        <span class="web-preview-address" :title="currentUrl">{{ host }}</span>
        <button type="button" class="web-preview-external" title="用系统浏览器打开" @click="emit('external', currentUrl)"><AppIcon name="external" :size="14" /><span>浏览器打开</span></button>
      </div>
      <div v-if="loading" class="web-preview-loading" role="status">正在加载网页…</div>
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
.web-preview-address { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 5px 8px; border: 1px solid var(--border); border-radius: 5px; color: var(--muted); font-size: 12px; }
.web-preview-external { white-space: nowrap; }
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
