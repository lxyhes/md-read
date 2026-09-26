<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Annotation, ReaderRegion, ThemeManifest } from '../types'
import MermaidBlock from './MermaidBlock.vue'
import TreeDiagram from './TreeDiagram.vue'
import AppIcon from './AppIcon.vue'
import IconButton from './IconButton.vue'
import { asciiDiagramToMermaid, asciiTreeToTree } from '../asciiDiagram'

const props = defineProps<{ region: ReaderRegion; annotations?: Annotation[]; focused: boolean; active: boolean; focusDistance?: number; themeMode?: ThemeManifest['mode']; themeKey?: string }>()
const emit = defineEmits<{ focus: []; openViewer: []; 'open-link': [url: string]; 'code-copied': []; 'toggle-task': [] }>()
const codeLanguage = computed(() => String(props.region.metadata?.language ?? 'text'))
const proseCodeLanguage = computed(() => /^(?:text|plaintext|markdown|md)$/i.test(codeLanguage.value))
const asciiDiagramCandidate = computed(() => props.region.type === 'code' && proseCodeLanguage.value)
const highlighted = ref(props.region.html)
const copied = ref(false)
const wrapped = ref(proseCodeLanguage.value)
const selectedCodeText = ref('')
const activeCodeLine = ref('')
let copyTimer: number | null = null
const asciiTree = computed(() => asciiDiagramCandidate.value ? asciiTreeToTree(props.region.textContent) : null)
const asciiDiagramCode = computed(() => asciiDiagramCandidate.value ? asciiDiagramToMermaid(props.region.textContent) : null)
const isDiagramLike = computed(() => Boolean(asciiTree.value || asciiDiagramCode.value))
const codeLineCount = computed(() => Math.max(1, props.region.textContent.split(/\r?\n/).length))
const focusDistanceClass = computed(() => `focus-distance-${Math.min(3, Math.max(0, props.focusDistance ?? 0))}`)
const regionAnnotations = computed(() => props.annotations?.filter((annotation) => annotation.regionId === props.region.id) ?? [])
const regionRoot = ref<HTMLElement | null>(null)
const codeVisible = ref(false)
let codeVisibilityObserver: IntersectionObserver | null = null
let codeRequest = 0

function highlightedHtml(source: string) {
  if (typeof document === 'undefined' || !regionAnnotations.value.length || props.region.type === 'code') return source
  const root = document.createElement('div')
  root.innerHTML = source
  for (const annotation of regionAnnotations.value) {
    const needle = annotation.selectedText.trim()
    if (!needle) continue
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      if (node.parentElement?.closest('mark.reader-highlight')) continue
      const start = node.data.indexOf(needle)
      if (start < 0) continue
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + needle.length)
      const mark = document.createElement('mark')
      mark.className = 'reader-highlight'
      mark.style.setProperty('--highlight-color', annotation.color)
      range.surroundContents(mark)
      break
    }
  }
  return root.innerHTML
}
const renderedHtml = computed(() => highlightedHtml(props.region.html))

async function updateCode() {
  if (props.region.type !== 'code') {
    highlighted.value = props.region.html
    return
  }
  const request = ++codeRequest
  const { highlightCode } = await import('../highlight')
  const html = await highlightCode(props.region.textContent, String(props.region.metadata?.language ?? 'text'), props.themeMode)
  if (request === codeRequest) highlighted.value = html
}
function observeCode() {
  if (props.region.type !== 'code') return
  if (typeof IntersectionObserver === 'undefined') {
    codeVisible.value = true
    void updateCode()
    return
  }
  codeVisibilityObserver = new IntersectionObserver((entries) => {
    if (!entries[0]?.isIntersecting) return
    codeVisible.value = true
    codeVisibilityObserver?.disconnect()
    codeVisibilityObserver = null
    void updateCode()
  }, { rootMargin: '240px 0px' })
  if (regionRoot.value) codeVisibilityObserver.observe(regionRoot.value)
}
onMounted(observeCode)
watch(() => [props.region, props.themeMode], () => {
  if (props.region.type !== 'code') {
    highlighted.value = props.region.html
    return
  }
  if (codeVisible.value) void updateCode()
})
onUnmounted(() => {
  if (copyTimer) window.clearTimeout(copyTimer)
  codeVisibilityObserver?.disconnect()
})

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.region.textContent)
    copied.value = true
    emit('code-copied')
    if (copyTimer) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => { copied.value = false }, 1400)
  } catch {
    copied.value = false
  }
}
function selectCodeLine(event: MouseEvent) {
  const line = (event.target as HTMLElement).closest('.line')
  if (line) activeCodeLine.value = line.textContent?.trimEnd() ?? ''
}
function captureCodeSelection(event: MouseEvent) {
  const body = event.currentTarget as HTMLElement
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  selectedCodeText.value = selection && range && body.contains(range.commonAncestorContainer) ? selection.toString().trim() : ''
}
async function copyCodeText(text: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    emit('code-copied')
    if (copyTimer) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => { copied.value = false }, 1400)
  } catch {
    copied.value = false
  }
}
function copySelectedCode() { void copyCodeText(selectedCodeText.value) }
function copyActiveCodeLine() { void copyCodeText(activeCodeLine.value) }
function handleContentClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.task-checkbox')) {
    event.preventDefault()
    event.stopPropagation()
    emit('toggle-task')
    return
  }
  const link = target.closest<HTMLAnchorElement>('a[href]')
  const url = link?.getAttribute('href')?.trim()
  if (link) {
    event.stopPropagation()
    if (!url || !/^(?:https?:|mailto:|tel:|\/\/)/i.test(url)) return
    event.preventDefault()
    emit('open-link', url)
    return
  }
  if (props.region.type === 'table' || target.closest('img, button, summary, details')) event.stopPropagation()
}
</script>

<template>
  <article ref="regionRoot" :data-region-id="region.id" class="region-block" :class="[`region-${region.type}`, focusDistanceClass, { focused, active }]" tabindex="0" @click="emit('focus')" @keydown.enter.self.prevent="emit('focus')" @keydown.space.self.prevent="emit('focus')">
      <div v-if="region.type === 'mermaid'" class="region-content" @click.stop="emit('openViewer')">
      <MermaidBlock :code="String(region.metadata?.code ?? region.textContent)" :theme-key="themeKey" />
    </div>
    <div v-else-if="region.type === 'image'" class="region-content image-region" @click.stop="emit('openViewer')">
      <div v-html="highlighted" />
      <button class="inline-view-action image-zoom-action" type="button" aria-label="放大查看原图" @click.stop="emit('openViewer')">放大查看 <AppIcon name="expand" :size="12" /></button>
    </div>
      <div v-else-if="region.type === 'code' && asciiTree" class="region-content auto-tree-region" @click.stop>
      <TreeDiagram :node="asciiTree" root @open-link="emit('open-link', $event)" />
    </div>
    <div v-else-if="region.type === 'code' && asciiDiagramCode" class="region-content auto-diagram-region" @click.stop="emit('openViewer')">
      <MermaidBlock :code="asciiDiagramCode" :theme-key="themeKey" native-labels />
    </div>
      <div v-else class="region-content" @click="handleContentClick">
      <div v-if="region.type === 'code'" class="code-frame" :class="{ 'is-diagram': isDiagramLike }" :data-language="isDiagramLike ? 'diagram' : codeLanguage">
        <div class="code-toolbar" @click.stop>
          <span class="code-language"><AppIcon name="code" :size="13" /><b>{{ codeLanguage }}</b><small>{{ codeLineCount }} 行</small></span>
          <span class="code-toolbar-actions">
            <button class="code-view" type="button" @click.stop="emit('openViewer')"><AppIcon name="external" :size="12" />独立查看</button>
            <button class="code-copy" type="button" @click="copyCode"><AppIcon :name="copied ? 'check' : 'copy'" :size="13" />{{ copied ? '已复制' : '复制全部' }}</button>
            <button class="code-copy" type="button" :disabled="!activeCodeLine" @click="copyActiveCodeLine">复制当前行</button>
            <button class="code-copy" type="button" :disabled="!selectedCodeText" @click="copySelectedCode">复制选中</button>
            <button class="code-copy code-wrap-toggle" type="button" :class="{ active: wrapped }" @click="wrapped = !wrapped">{{ wrapped ? '横向滚动' : '软换行' }}</button>
          </span>
        </div>
        <div class="code-body" :class="{ 'is-wrapped': wrapped }" @click.stop="selectCodeLine" @mouseup.stop="captureCodeSelection" v-html="highlighted" />
      </div>
      <div v-else-if="region.type === 'table'" class="table-region">
        <div class="table-region-toolbar">
          <span><AppIcon name="table" :size="13" /> 数据表</span>
          <button class="inline-view-action" type="button" @click.stop="emit('openViewer')">独立查看 <AppIcon name="table" :size="12" /></button>
        </div>
        <div v-html="renderedHtml" />
      </div>
      <div v-else v-html="renderedHtml" />
    </div>
    <IconButton v-if="region.type === 'image'" class="region-more image-region-more" icon="expand" size="sm" label="放大查看原图" @click.stop="emit('openViewer')" />
    <IconButton v-else-if="!focused" class="region-more" icon="focus" size="sm" label="聚焦此区域" @click.stop="emit('focus')" />
  </article>
</template>
