<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import type { ReaderDocument, ReaderRegion, ThemeManifest } from '../types'
import { findDocumentHeading } from '../documentLinks'
import RegionBlock from './RegionBlock.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  documents: ReaderDocument[]
  currentDocumentId: string | null
  themeMode?: ThemeManifest['mode']
  themeKey: string
}>()
const emit = defineEmits<{ close: []; activate: [id: string]; notify: [message: string]; 'open-link': [url: string, document: ReaderDocument]; 'open-viewer': [region: ReaderRegion]; 'copy-image': [region: ReaderRegion] }>()
const selectedId = ref(props.documents.find(document => document.id !== props.currentDocumentId)?.id ?? '')
const choices = computed(() => props.documents.filter(document => document.id !== props.currentDocumentId))
const document = computed(() => choices.value.find(document => document.id === selectedId.value) ?? choices.value[0])
function documentLabel(document: ReaderDocument) {
  return document.title.replace(/\.(?:md|markdown|qmd)$/i, '').trim() || document.path.split(/[\\/]/).pop() || '未命名文档'
}
const viewport = ref<HTMLElement | null>(null)
const activeRegionId = ref<string | null>(null)
const scrollPositions = new Map<string, number>()
let paneActive = true

function rememberScroll() {
  if (paneActive && document.value && viewport.value) scrollPositions.set(document.value.id, viewport.value.scrollTop)
}
function restoreScroll() {
  if (viewport.value && document.value) viewport.value.scrollTop = scrollPositions.get(document.value.id) ?? 0
}
onActivated(() => { paneActive = true; void nextTick(restoreScroll) })
onDeactivated(() => { paneActive = false })

watch(() => props.currentDocumentId, (id, previous) => {
  if (document.value?.id === id || selectedId.value === id) selectedId.value = previous ?? ''
})
watch(() => document.value?.id, async (id, previous) => {
  if (previous && viewport.value && paneActive) scrollPositions.set(previous, viewport.value.scrollTop)
  if (id) selectedId.value = id
  activeRegionId.value = null
  await nextTick()
  if (viewport.value) viewport.value.scrollTop = id ? scrollPositions.get(id) ?? 0 : 0
})

function openLink(url: string) {
  if (!document.value) return
  if (!url.startsWith('#')) { emit('open-link', url, document.value); return }
  const heading = findDocumentHeading(document.value, url)
  const target = heading && [...viewport.value?.querySelectorAll<HTMLElement>('[data-region-id]') ?? []].find(element => element.dataset.regionId === heading.regionId)
  if (target) {
    target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    activeRegionId.value = heading.regionId
  } else emit('notify', '未找到对应章节')
}

function onKeydown(event: KeyboardEvent) {
  // Keep reading keys in this pane from changing the left document's focus.
  if (!event.ctrlKey && !event.metaKey && !event.altKey && ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'f', 'F'].includes(event.key)) event.stopPropagation()
}
</script>

<template>
  <section v-if="document" class="second-document-pane" aria-label="第二篇文档（只读）" @keydown="onKeydown">
    <header class="second-document-toolbar">
      <div class="second-document-identity">
        <div class="second-document-caption"><span>对照文档</span><span class="second-document-readonly">只读</span></div>
        <div class="second-document-select">
          <AppIcon name="file" :size="15" />
          <select :value="document.id" :title="document.path" aria-label="选择第二篇 Markdown 文档" @change="selectedId = ($event.target as HTMLSelectElement).value">
            <option v-for="choice in choices" :key="choice.id" :value="choice.id" :title="choice.path">{{ documentLabel(choice) }}{{ choices.filter(item => documentLabel(item) === documentLabel(choice)).length > 1 ? ` · ${choice.path}` : '' }}</option>
          </select>
          <AppIcon name="chevron-down" :size="13" />
        </div>
      </div>
      <div class="second-document-actions">
        <button class="second-document-activate" type="button" title="切换到主阅读区，原主文档保留在对照区" @click="emit('activate', document.id)"><AppIcon name="reader" :size="14" /><span>设为主文档</span></button>
        <button class="second-document-close" type="button" aria-label="退出对照阅读" title="退出对照阅读，保留所有文档标签" @click="emit('close')"><AppIcon name="close" :size="15" /><span>退出对照</span></button>
      </div>
    </header>
    <div :key="document.id" ref="viewport" class="reader-viewport second-document-viewport" tabindex="0" :aria-label="`阅读 ${document.title}`" @scroll="rememberScroll">
      <div class="reader-content">
        <h1 class="reader-title" :title="document.path">{{ documentLabel(document) }}</h1>
        <div class="reader-rule" />
        <div class="regions-stack">
          <RegionBlock v-for="region in document.regions" :key="region.id" :region="region" :focused="false" :active="activeRegionId === region.id" :theme-mode="themeMode" :theme-key="themeKey" @focus="activeRegionId = region.id" @open-link="openLink" @open-viewer="emit('open-viewer', region)" @copy-image="emit('copy-image', region)" @code-copied="emit('notify', '代码已复制')" @math-copied="emit('notify', 'MathML 已复制')" @math-copy-failed="emit('notify', '复制 MathML 失败，请检查剪贴板权限')" @toggle-task="emit('notify', '请先在左侧打开文档，再修改任务')" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.second-document-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border-left: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 28%, transparent); }
.second-document-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; min-height: 76px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.second-document-identity { display: flex; flex: 1 1 220px; min-width: 0; max-width: 440px; flex-direction: column; gap: 6px; }
.second-document-caption { display: flex; align-items: center; gap: 8px; color: var(--muted); font: 11px/1.4 var(--ui-font); }
.second-document-readonly { padding: 1px 5px; border: 1px solid var(--border); border-radius: 4px; font-size: 10px; }
.second-document-select { position: relative; display: flex; align-items: center; min-width: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); transition: border-color .15s, background .15s; }
.second-document-select:hover, .second-document-select:focus-within { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
.second-document-select > .app-icon { position: absolute; pointer-events: none; color: var(--muted); }
.second-document-select > .app-icon:first-child { left: 10px; }
.second-document-select > .app-icon:last-child { right: 10px; }
.second-document-toolbar select { appearance: none; width: 100%; min-width: 0; min-height: 34px; padding: 6px 30px; color: var(--ink); background: transparent; border: 0; border-radius: inherit; font: 500 12px/1.5 var(--ui-font); text-overflow: ellipsis; cursor: pointer; }
.second-document-toolbar option { color: var(--ink); background: var(--surface); }
.second-document-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; margin-left: auto; }
.second-document-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--muted); font: 12px/1.5 var(--ui-font); white-space: nowrap; }
.second-document-actions .second-document-activate { color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
.second-document-actions button:hover { color: var(--ink); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.second-document-toolbar :focus-visible, .second-document-viewport:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.second-document-viewport { flex: 1; min-height: 0; scroll-behavior: auto; }
.second-document-pane .reader-content { width: min(var(--reader-width), calc(100% - 56px)); padding: 28px 0 80px; }
.second-document-pane .reader-title { overflow-wrap: anywhere; font-size: 28px; }
.second-document-pane :deep(.region-block) { opacity: 1 !important; filter: none !important; }
.second-document-pane :deep(.region-block) { scroll-margin-top: 20px; }
@container document-panes (max-width: 760px) {
  .second-document-pane { border-left: 0; border-top: 1px solid var(--border); }
  .second-document-toolbar { padding: 10px 16px; }
}
@container document-panes (max-width: 460px) {
  .second-document-identity { flex-basis: 100%; }
  .second-document-actions { width: 100%; margin-left: 0; justify-content: flex-end; }
}
@media (prefers-reduced-motion: reduce) {
  .second-document-select { transition: none; }
}
</style>
