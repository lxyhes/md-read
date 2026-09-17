<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { useReaderStore } from './stores/reader'
import RegionBlock from './components/RegionBlock.vue'
import MermaidBlock from './components/MermaidBlock.vue'
import FocusAmbiencePicker from './components/FocusAmbiencePicker.vue'
import ThemeCenter from './components/ThemeCenter.vue'
import ThemePicker from './components/ThemePicker.vue'
import AppIcon from './components/AppIcon.vue'
import IconButton from './components/IconButton.vue'
import { listMarkdownFiles, readMarkdownPath, type WorkspaceFile } from './fileService'
import type { Annotation, FocusAmbienceId, ReaderRegion, ViewerType } from './types'

type View = 'library' | 'reader' | 'themes' | 'settings'
type BusyAction = 'file' | 'folder' | 'drop' | null
const store = useReaderStore()
const view = ref<View>('library')
const libraryTab = ref<'home' | 'all'>('all')
const readerViewport = ref<HTMLElement | null>(null)
const searchOpen = ref(false)
const query = ref('')
const searchIndex = ref(0)
const toast = ref('')
const settingsTab = ref('reading')
const viewer = ref<{ type: ViewerType; region: ReaderRegion } | null>(null)
const viewerTab = ref<'preview' | 'source' | 'data'>('preview')
const viewerFullscreen = ref(false)
const selectionToolbar = ref<{ text: string; regionId: string; rect: { top: number; left: number; width: number; height: number } } | null>(null)
const annotationEditor = ref<{ text: string; regionId: string } | null>(null)
const annotationNote = ref('')
const annotationColor = ref('#e1a85b')
const viewerZoom = ref(1)
const viewerPan = ref({ x: 0, y: 0 })
const viewerDragging = ref(false)
let viewerPointer = { x: 0, y: 0 }
const customProvider = ref('')
const busyAction = ref<BusyAction>(null)
const draggingFiles = ref(false)
const leftPanelTab = ref<'files' | 'outline'>('files')
const filesystemFiles = ref<WorkspaceFile[]>([])
let fileTreeRequest = 0
const focusRemaining = ref(25 * 60)
const focusRunning = ref(false)
function readFocusAmbience(): FocusAmbienceId {
  const value = localStorage.getItem('moyue:focus-ambience')
  return value === 'forest' || value === 'fire' ? value : 'moonlit'
}
const focusAmbience = ref<FocusAmbienceId>(readFocusAmbience())
let focusTimer: number | null = null
let scrollFrame: number | null = null
let progressTimer: number | null = null
let pendingProgress: { documentId: string; scrollPercent: number; regionId: string | null; headingId: string | null } | null = null
const focusThemeStyles = computed<Record<string, string>>(() => {
  const themes: Record<FocusAmbienceId, Record<string, string>> = {
    moonlit: {
      '--focus-accent': '#a89cff', '--focus-border': 'rgba(168, 156, 255, .32)', '--focus-sidebar-bg': 'linear-gradient(180deg, rgba(31, 30, 72, .96), rgba(13, 18, 40, .94))', '--focus-card-bg': 'linear-gradient(150deg, rgba(59, 56, 125, .68), rgba(21, 24, 51, .82))', '--focus-page-bg': 'radial-gradient(ellipse at 52% 8%, rgba(128, 119, 255, .18), transparent 35%), linear-gradient(112deg, rgba(8, 15, 39, .98), rgba(20, 28, 70, .82) 53%, rgba(9, 15, 39, .98))', '--focus-copy': '#f2efff', '--focus-muted': '#b3afd3', '--app-bg': '#0a1029', '--surface': '#121a3a', '--surface-raised': '#1c2550', '--ink': '#f2efff', '--muted': '#a8afd6', '--accent': '#a89cff', '--accent-soft': 'rgba(168, 156, 255, .18)', '--border': 'rgba(168, 156, 255, .25)', '--code-bg': '#0f172e',
    },
    forest: {
      '--focus-accent': '#82d6ad', '--focus-border': 'rgba(109, 204, 165, .32)', '--focus-sidebar-bg': 'linear-gradient(180deg, rgba(17, 51, 55, .96), rgba(8, 27, 34, .94))', '--focus-card-bg': 'linear-gradient(150deg, rgba(26, 79, 77, .72), rgba(11, 35, 42, .84))', '--focus-page-bg': 'radial-gradient(ellipse at 52% 8%, rgba(77, 174, 144, .18), transparent 35%), linear-gradient(112deg, rgba(7, 24, 32, .98), rgba(13, 48, 56, .84) 53%, rgba(6, 20, 27, .98))', '--focus-copy': '#e8fff4', '--focus-muted': '#a5cfbe', '--app-bg': '#081d25', '--surface': '#0d2a31', '--surface-raised': '#143d42', '--ink': '#e8fff4', '--muted': '#9cc9b7', '--accent': '#82d6ad', '--accent-soft': 'rgba(130, 214, 173, .18)', '--border': 'rgba(109, 204, 165, .25)', '--code-bg': '#0b222b',
    },
    fire: {
      '--focus-accent': '#f3a36d', '--focus-border': 'rgba(243, 163, 109, .34)', '--focus-sidebar-bg': 'linear-gradient(180deg, rgba(63, 35, 54, .96), rgba(29, 18, 31, .94))', '--focus-card-bg': 'linear-gradient(150deg, rgba(105, 52, 61, .68), rgba(38, 22, 35, .84))', '--focus-page-bg': 'radial-gradient(ellipse at 52% 8%, rgba(226, 110, 67, .18), transparent 35%), linear-gradient(112deg, rgba(28, 16, 31, .98), rgba(61, 30, 45, .84) 53%, rgba(20, 13, 25, .98))', '--focus-copy': '#fff0e6', '--focus-muted': '#d6b0a1', '--app-bg': '#1c1020', '--surface': '#2d1929', '--surface-raised': '#482333', '--ink': '#fff0e6', '--muted': '#d4ad9e', '--accent': '#f3a36d', '--accent-soft': 'rgba(243, 163, 109, .18)', '--border': 'rgba(243, 163, 109, .26)', '--code-bg': '#211523',
    },
  }
  return themes[focusAmbience.value]
})
const isDark = computed(() => store.activeTheme?.manifest.mode !== 'light')
const searchResults = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return []
  return store.documents.flatMap((document) => document.regions.filter((region) => `${document.title} ${region.textContent}`.toLowerCase().includes(needle)).map((region) => ({ document, region }))).slice(0, 18)
})
const activeViewerRegion = computed(() => viewer.value?.region ?? null)
const viewerCanPan = computed(() => viewer.value?.type === 'mermaid' && viewerTab.value === 'preview')
const viewerStageStyle = computed<Record<string, string>>(() => ({
  '--viewer-zoom': String(viewerZoom.value),
  '--viewer-pan-x': `${viewerPan.value.x}px`,
  '--viewer-pan-y': `${viewerPan.value.y}px`,
}))
const currentProgress = computed(() => store.currentDocument ? store.progress[store.currentDocument.id] : undefined)
const currentAnnotations = computed(() => store.annotations.slice().sort((a, b) => b.createdAt - a.createdAt))
const currentHeading = computed(() => store.currentDocument?.headings.find((heading) => heading.id === store.activeHeadingId))
const readerRegions = computed(() => {
  const document = store.currentDocument
  if (!document) return []
  const first = document.regions[0]
  return first?.type === 'heading' && first.textContent.trim() === document.title.trim() ? document.regions.slice(1) : document.regions
})
function normalizedPath(path: string) { return path.replace(/\\/g, '/') }
function directoryOf(path: string) {
  const normalized = normalizedPath(path)
  const separator = normalized.lastIndexOf('/')
  return separator >= 0 ? normalized.slice(0, separator) || '/' : '当前工作区'
}
function fileNameOf(path: string) { return normalizedPath(path).split('/').pop() || path }
const currentDirectory = computed(() => directoryOf(store.currentDocument?.path ?? ''))
const currentDirectoryLabel = computed(() => currentDirectory.value === '当前工作区' ? currentDirectory.value : currentDirectory.value.split('/').filter(Boolean).pop() || currentDirectory.value)
const currentDirectoryFiles = computed(() => {
  const files = new Map<string, { path: string; name: string; documentId?: string }>()
  for (const document of store.documents) {
    if (directoryOf(document.path) !== currentDirectory.value) continue
    files.set(normalizedPath(document.path), { path: document.path, name: fileNameOf(document.path), documentId: document.id })
  }
  for (const file of filesystemFiles.value) {
    const key = normalizedPath(file.path)
    if (!files.has(key)) files.set(key, file)
  }
  const result = [...files.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  return result.length || !store.currentDocument ? result : [{ path: store.currentDocument.path, name: fileNameOf(store.currentDocument.path), documentId: store.currentDocument.id }]
})
const focusTimeLabel = computed(() => `${String(Math.floor(focusRemaining.value / 60)).padStart(2, '0')}:${String(focusRemaining.value % 60).padStart(2, '0')}`)
const focusProgress = computed(() => 1 - focusRemaining.value / (25 * 60))

function notify(message: string) {
  toast.value = message
  window.setTimeout(() => { if (toast.value === message) toast.value = '' }, 2600)
}

function openLibrary(tab: 'home' | 'all') { libraryTab.value = tab; view.value = 'library' }
function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName))
}

async function boot() {
  await store.bootstrap()
  store.clearFocus()
  if (store.currentDocument) view.value = 'reader'
}
onMounted(() => { void boot(); window.addEventListener('keydown', onKeydown) })
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  stopFocusTimer()
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
  if (progressTimer !== null) window.clearTimeout(progressTimer)
})
watch(query, () => { searchIndex.value = 0 })
watch(() => store.mode, (mode) => { if (mode !== 'focus') stopFocusTimer() })
watch(() => store.currentDocument?.path, () => { void refreshFileTree() }, { immediate: true })

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchOpen.value = true; return }
  if (searchOpen.value && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    event.preventDefault()
    if (event.key === 'ArrowDown') searchIndex.value = Math.min(Math.max(0, searchResults.value.length - 1), searchIndex.value + 1)
    if (event.key === 'ArrowUp') searchIndex.value = Math.max(0, searchIndex.value - 1)
    if (event.key === 'Enter' && searchResults.value[searchIndex.value]) {
      const result = searchResults.value[searchIndex.value]
      void chooseSearchResult(result.document.id, result.region.id)
    }
    return
  }
  if (viewer.value && viewerCanPan.value && ['+', '=', '-', '0'].includes(event.key)) {
    event.preventDefault()
    if (event.key === '+' || event.key === '=') setViewerZoom(viewerZoom.value + .1)
    else if (event.key === '-') setViewerZoom(viewerZoom.value - .1)
    else resetViewerView()
    return
  }
  if (event.key === 'Escape') {
    if (annotationEditor.value) annotationEditor.value = null
    else if (viewer.value) viewer.value = null
    else if (store.mode === 'region-focus') store.clearFocus()
    else searchOpen.value = false
    selectionToolbar.value = null
    return
  }
  if (view.value === 'reader' && event.key === 'Enter' && !isTypingTarget(event.target)) {
    event.preventDefault()
    const id = store.activeRegionId ?? readerRegions.value[0]?.id
    if (id) store.focusRegion(id)
    return
  }
  if (event.key.toLowerCase() === 'f' && !isTypingTarget(event.target)) { store.setMode(store.mode === 'focus' ? 'normal' : 'focus'); view.value = 'reader' }
  if (view.value === 'reader' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) moveFocus(event.key === 'ArrowDown' ? 1 : -1)
}

function moveFocus(delta: number) {
  const regions = readerRegions.value
  if (!regions.length) return
  const focusedIndex = regions.findIndex((region) => region.id === store.focusedRegionId)
  const activeIndex = regions.findIndex((region) => region.id === store.activeRegionId)
  const current = focusedIndex >= 0 ? focusedIndex : Math.max(0, activeIndex)
  const next = regions[(current + delta + regions.length) % regions.length]
  store.focusRegion(next.id)
  document.querySelector(`[data-region-id="${next.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function openFile() {
  if (busyAction.value) return
  busyAction.value = 'file'
  try {
    const count = await store.importFiles()
    if (count) { view.value = 'reader'; await nextTick(); restoreScroll(); notify(`已打开 ${count} 个 Markdown 文档`) }
  } catch (error) {
    notify(error instanceof Error ? error.message : '打开文档失败')
  } finally { busyAction.value = null }
}
async function openFolder() {
  if (busyAction.value) return
  busyAction.value = 'folder'
  try {
    const count = await store.importFolder()
    if (count) { view.value = 'reader'; await nextTick(); restoreScroll(); notify(`已载入 ${count} 个 Markdown 文档`) }
  } catch (error) {
    notify(error instanceof Error ? error.message : '载入工作区失败')
  } finally { busyAction.value = null }
}
function onDragEnter(event: DragEvent) { if (event.dataTransfer?.types.includes('Files')) draggingFiles.value = true }
function onDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement
  const next = event.relatedTarget as Node | null
  if (!next || !current.contains(next)) draggingFiles.value = false
}
async function onDrop(event: DragEvent) {
  if (busyAction.value) return
  draggingFiles.value = false
  const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => /\.(md|markdown)$/i.test(file.name))
  if (!files.length) { notify('请拖入 .md 或 .markdown 文件'); return }
  busyAction.value = 'drop'
  try {
    const count = await store.addOpenedFiles(await Promise.all(files.map(async (file) => ({ path: file.name, source: await file.text() }))))
    if (count) { view.value = 'reader'; notify(`已导入 ${count} 个 Markdown 文档`) }
  } catch (error) {
    notify(error instanceof Error ? error.message : '导入文档失败')
  } finally { busyAction.value = null }
}

async function chooseDocument(id: string) { await store.openDocument(id); view.value = 'reader'; await nextTick(); restoreScroll() }
async function chooseSearchResult(documentId: string, regionId: string) {
  await chooseDocument(documentId)
  searchOpen.value = false
  await nextTick()
  scrollToHeading(regionId)
}
async function refreshFileTree() {
  const path = store.currentDocument?.path
  const request = ++fileTreeRequest
  if (!path) { filesystemFiles.value = []; return }
  try {
    const files = await listMarkdownFiles(path)
    if (request === fileTreeRequest) filesystemFiles.value = files
  } catch {
    if (request === fileTreeRequest) filesystemFiles.value = []
  }
}
function fileStatus(file: { documentId?: string }) {
  if (!file.documentId) return '点击打开'
  if (store.currentDocumentId === file.documentId) return '正在阅读'
  return `${store.documents.find((document) => document.id === file.documentId)?.regions.length ?? 0} 个阅读区域`
}
async function openFileTreeEntry(file: { path: string; name: string; documentId?: string }) {
  if (file.documentId) { await chooseDocument(file.documentId); return }
  if (busyAction.value) return
  busyAction.value = 'file'
  try {
    const source = await readMarkdownPath(file.path)
    const count = await store.addOpenedFiles([{ path: file.path, source }])
    if (count) { view.value = 'reader'; await nextTick(); restoreScroll(); notify(`已打开 ${file.name}`) }
  } catch (error) {
    notify(error instanceof Error ? error.message : '打开文件失败')
  } finally { busyAction.value = null }
}
async function closeDocument(id: string) {
  await store.closeDocument(id)
  if (!store.currentDocument) { view.value = 'library'; return }
  await nextTick()
  restoreScroll()
}
function restoreScroll() { if (readerViewport.value && currentProgress.value) readerViewport.value.scrollTop = currentProgress.value.scrollPercent * (readerViewport.value.scrollHeight - readerViewport.value.clientHeight) }
function onReaderScroll() {
  if (scrollFrame !== null) return
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = null
    const element = readerViewport.value
    const document = store.currentDocument
    if (!element || !document) return
    const percent = element.scrollHeight <= element.clientHeight ? 0 : element.scrollTop / (element.scrollHeight - element.clientHeight)
    const viewport = element.getBoundingClientRect()
    const probeY = viewport.top + Math.min(150, Math.max(50, element.clientHeight * .22))
    const probeX = viewport.left + element.clientWidth / 2
    const active = window.document.elementsFromPoint(probeX, probeY).map((node) => (node as HTMLElement).closest?.('[data-region-id]')).find(Boolean) as HTMLElement | undefined
    const regionId = active?.dataset.regionId ?? store.activeRegionId
    const heading = document.headings.find((item) => item.regionId === regionId)
    store.activeRegionId = regionId ?? store.activeRegionId
    store.activeHeadingId = heading?.id ?? store.activeHeadingId
    pendingProgress = { documentId: document.id, scrollPercent: percent, regionId: regionId ?? null, headingId: heading?.id ?? null }
    if (progressTimer === null) {
      progressTimer = window.setTimeout(() => {
        progressTimer = null
        const next = pendingProgress
        pendingProgress = null
        if (next && store.currentDocumentId === next.documentId) void store.setProgress(next.scrollPercent, next.regionId, next.headingId)
      }, 180)
    }
  })
}

function focusRegion(region: ReaderRegion) { store.focusRegion(region.id); selectionToolbar.value = null }
function setViewerZoom(value: number) { viewerZoom.value = Math.min(3, Math.max(.5, Number(value.toFixed(2)))) }
function resetViewerView() { viewerZoom.value = 1; viewerPan.value = { x: 0, y: 0 } }
function openViewer(region: ReaderRegion) { viewer.value = { type: region.type === 'code' ? 'code' : region.type === 'image' ? 'image' : region.type === 'table' ? 'table' : 'mermaid', region }; resetViewerView(); viewerTab.value = 'preview'; viewerFullscreen.value = false }
function closeViewer() { viewer.value = null; viewerDragging.value = false; resetViewerView(); viewerFullscreen.value = false }
function onViewerWheel(event: WheelEvent) {
  if (!viewerCanPan.value) return
  event.preventDefault()
  setViewerZoom(viewerZoom.value * (event.deltaY < 0 ? 1.1 : .9))
}
function onViewerPointerDown(event: PointerEvent) {
  if (!viewerCanPan.value || event.button !== 0) return
  viewerDragging.value = true
  viewerPointer = { x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onViewerPointerMove(event: PointerEvent) {
  if (!viewerDragging.value) return
  viewerPan.value = {
    x: viewerPan.value.x + event.clientX - viewerPointer.x,
    y: viewerPan.value.y + event.clientY - viewerPointer.y,
  }
  viewerPointer = { x: event.clientX, y: event.clientY }
}
function onViewerPointerUp(event: PointerEvent) {
  if (!viewerDragging.value) return
  viewerDragging.value = false
  const stage = event.currentTarget as HTMLElement
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId)
}
function onViewerDoubleClick() { if (viewerCanPan.value) resetViewerView() }
function exportViewer() {
  if (!viewer.value) return
  const source = viewer.value.region.type === 'mermaid' ? document.querySelector('.viewer-stage svg')?.outerHTML : viewer.value.region.textContent
  if (!source) { notify('当前内容暂时没有可导出的数据'); return }
  const extension = viewer.value.region.type === 'mermaid' ? 'svg' : 'txt'
  const blob = new Blob([source], { type: extension === 'svg' ? 'image/svg+xml' : 'text/plain' })
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `moyue-${viewer.value.region.type}.${extension}`; anchor.click(); URL.revokeObjectURL(url); notify('内容已导出')
}
function scrollToHeading(regionId: string) {
  const element = document.querySelector(`[data-region-id="${regionId}"]`)
  if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
  const first = store.currentDocument?.regions[0]
  if (first?.id === regionId && readerRegions.value[0]?.id !== regionId) readerViewport.value?.scrollTo({ top: 0, behavior: 'smooth' })
}
function stopFocusTimer() { if (focusTimer !== null) { window.clearInterval(focusTimer); focusTimer = null }; focusRunning.value = false }
function toggleFocusTimer() {
  if (focusRemaining.value <= 0) focusRemaining.value = 25 * 60
  if (focusRunning.value) { stopFocusTimer(); return }
  focusRunning.value = true
  focusTimer = window.setInterval(() => {
    if (focusRemaining.value <= 1) { focusRemaining.value = 0; stopFocusTimer(); notify('专注完成，休息一下'); return }
    focusRemaining.value -= 1
  }, 1000)
}
function resetFocusTimer() { stopFocusTimer(); focusRemaining.value = 25 * 60 }
function exitFocusMode() { store.setMode('normal') }
function focusHeading(regionId: string) { scrollToHeading(regionId); store.activeHeadingId = store.currentDocument?.headings.find((heading) => heading.regionId === regionId)?.id ?? store.activeHeadingId }

async function captureSelection(event: MouseEvent) {
  await nextTick()
  const selection = window.getSelection()
  const text = selection?.toString().trim()
  if (!text) return
  const anchor = (event.target as HTMLElement).closest('[data-region-id]') as HTMLElement | null
  if (!anchor) return
  const range = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null
  if (!range) return
  selectionToolbar.value = { text, regionId: anchor.dataset.regionId ?? '', rect: { top: range.top, left: range.left, width: range.width, height: range.height } }
  await nextTick()
  const toolbar = document.querySelector('.selection-toolbar') as HTMLElement | null
  if (toolbar) {
    const position = await computePosition(anchor, toolbar, { placement: 'top', middleware: [offset(8), flip(), shift({ padding: 12 })] })
    Object.assign(toolbar.style, { left: `${position.x}px`, top: `${position.y}px` })
  }
}

async function copySelection() {
  if (!selectionToolbar.value) return
  try {
    await navigator.clipboard.writeText(selectionToolbar.value.text)
    notify('已复制选中文字')
  } catch {
    notify('当前环境不允许访问剪贴板')
  }
  selectionToolbar.value = null
}
function jumpToAnnotation(annotation: Annotation) {
  store.clearFocus()
  scrollToHeading(annotation.regionId)
}
function assist(kind: 'translate' | 'explain') { notify(customProvider.value ? `${kind === 'translate' ? '翻译' : '解释'}适配器已预留：${customProvider.value}` : '尚未配置翻译 / AI 服务'); selectionToolbar.value = null }
function beginAnnotation() { if (!selectionToolbar.value) return; annotationEditor.value = { text: selectionToolbar.value.text, regionId: selectionToolbar.value.regionId }; annotationNote.value = ''; selectionToolbar.value = null }
async function saveCurrentAnnotation() {
  if (!annotationEditor.value || !store.currentDocument) return
  const annotation: Annotation = { id: `note_${Date.now()}`, documentId: store.currentDocument.id, regionId: annotationEditor.value.regionId, selectedText: annotationEditor.value.text, color: annotationColor.value, note: annotationNote.value.trim(), createdAt: Date.now() }
  await store.addAnnotation(annotation)
  annotationEditor.value = null
  notify('批注已保存')
}
function applyReaderTheme(theme: Parameters<typeof store.applyTheme>[0]) { store.applyTheme(theme); notify(`已切换到「${theme.manifest.name}」`) }

function changeSetting(key: 'fontSize' | 'lineHeight' | 'width', value: number) { store.updateSettings({ [key]: value }); document.documentElement.style.setProperty(`--reader-${key === 'fontSize' ? 'size' : key === 'lineHeight' ? 'leading' : 'width'}`, key === 'width' ? `${value}px` : String(value)) }
function requestFullscreen() { void document.documentElement.requestFullscreen?.() }
</script>

<template>
  <div class="app-shell" :class="{ 'is-focus': store.mode === 'focus', 'is-region-focus': store.mode === 'region-focus', 'is-dragging': draggingFiles, [`theme-${store.activeThemeId}`]: true, [`focus-${focusAmbience}`]: store.mode === 'focus' }" :style="store.mode === 'focus' ? focusThemeStyles : undefined" @dragover.prevent @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
    <aside class="global-nav">
      <div class="brand-mark"><span><AppIcon name="logo" :size="18" /></span><small>墨阅 · MOYUE</small></div>
      <nav>
        <span class="nav-section-label">我的空间</span>
        <button class="nav-item" :class="{ active: view === 'library' && libraryTab === 'home' }" type="button" @click="openLibrary('home')"><span class="nav-icon"><AppIcon name="home" /></span><span>我的空间</span></button>
        <button class="nav-item" :class="{ active: view === 'library' && libraryTab === 'all' }" type="button" @click="openLibrary('all')"><span class="nav-icon"><AppIcon name="library" /></span><span>全部文档</span></button>
        <button class="nav-item" :class="{ active: view === 'reader' }" type="button" @click="view = 'reader'"><span class="nav-icon"><AppIcon name="history" /></span><span>最近阅读</span></button>
        <button class="nav-item" type="button" @click="notify('收藏夹将在下一阶段接入')"><span class="nav-icon"><AppIcon name="star" /></span><span>收藏夹</span></button>
        <button class="nav-item" type="button" @click="notify('AI 知识库将在适配器完成后接入')"><span class="nav-icon"><AppIcon name="sparkle" /></span><span>AI 知识库</span></button>
        <button class="nav-item" type="button" @click="notify('个人笔记将在下一阶段接入')"><span class="nav-icon"><AppIcon name="note" /></span><span>个人笔记</span></button>
        <span class="nav-section-label nav-section-gap">探索</span>
        <button class="nav-item" :class="{ active: view === 'themes' }" type="button" @click="view = 'themes'"><span class="nav-icon"><AppIcon name="palette" /></span><span>主题中心</span></button>
        <button class="nav-item" type="button" @click="notify('插件市场将在下一阶段接入')"><span class="nav-icon"><AppIcon name="plugin" /></span><span>插件中心</span></button>
      </nav>
      <div class="nav-bottom">
        <button class="nav-item" :class="{ active: view === 'settings' }" type="button" @click="view = 'settings'"><span class="nav-icon"><AppIcon name="settings" /></span><span>设置</span></button>
        <p class="nav-motto">阅读<br />是灵魂的远行</p>
        <div class="profile-chip"><span class="profile-avatar">M</span><span><b>墨阅本地</b><small>离线工作区</small></span></div>
      </div>
    </aside>

    <main class="main-shell">
      <header class="topbar" :class="{ faded: store.mode === 'focus' }">
        <div class="crumbs"><span class="eyebrow">阅读空间</span><span class="crumb-separator">/</span><strong>{{ view === 'reader' ? store.currentDocument?.title : view === 'themes' ? '主题空间' : view === 'settings' ? '偏好设置' : '我的文档' }}</strong></div>
        <button class="command-trigger" type="button" @click="searchOpen = true"><span>搜索文档、标题、内容</span><kbd>⌘ K</kbd></button>
        <div class="top-actions">
          <IconButton icon="focus" label="专注阅读" :active="store.mode === 'focus'" @click="store.setMode(store.mode === 'focus' ? 'normal' : 'focus'); view = 'reader'" />
          <IconButton icon="palette" label="切换主题" @click="view = 'themes'" />
          <IconButton icon="fullscreen" label="全屏" @click="requestFullscreen" />
        </div>
      </header>

      <section v-if="view === 'library'" class="page library-page">
        <div class="library-hero reveal-1"><div><p class="section-kicker">LOCAL READING STUDIO</p><h1>给一个想法<br /><em>足够的时间。</em></h1><p class="hero-copy">墨阅把 Markdown 变成一个可以停留的空间。<br />离线、安静、属于你的阅读节奏。</p></div><div class="hero-orbit"><span class="orbit-core">读</span><span class="orbit-label label-one">Region Focus</span><span class="orbit-label label-two">Theme Package</span><span class="orbit-label label-three">Offline First</span></div></div>
        <div class="page-toolbar reveal-2"><div><span class="section-kicker">YOUR SHELF</span><h2>最近阅读 <span>{{ store.documents.length }}</span></h2></div><div class="toolbar-actions"><button class="ghost-button" type="button" :disabled="busyAction !== null" @click="openFolder"><AppIcon name="library" :size="14" />{{ busyAction === 'folder' ? '扫描中…' : '打开文件夹' }}</button><button class="primary-button" type="button" :disabled="busyAction !== null" @click="openFile"><AppIcon name="plus" :size="14" />{{ busyAction === 'file' ? '打开中…' : '导入 Markdown' }}</button></div></div>
        <div class="document-grid reveal-3">
          <button v-for="(document, index) in store.documents" :key="document.id" class="document-card" type="button" @click="chooseDocument(document.id)"><div class="card-topline"><span class="file-badge">MD</span><span>{{ index === 0 ? '刚刚' : '本地文档' }}</span></div><h3>{{ document.title }}</h3><p>{{ document.regions.length }} 个阅读区域 · {{ document.estimatedReadMinutes }} 分钟</p><div class="card-footer"><span>{{ document.path }}</span><span class="arrow"><AppIcon name="external" :size="14" /></span></div></button>
          <button class="import-card" type="button" :disabled="busyAction !== null" @click="openFile"><span class="import-plus"><AppIcon name="plus" :size="22" /></span><span>{{ busyAction === 'file' ? '正在打开…' : '拖入 Markdown' }}<br /><small>或从本地打开</small></span></button>
        </div>
        <div class="library-note reveal-4"><span class="note-line" /> <span>当前工作区完全离线运行 · 阅读位置会自动保存</span></div>
      </section>

      <section v-else-if="view === 'reader'" class="reader-page">
        <div class="reader-tabbar"><div v-for="document in store.openDocuments" :key="document.id" class="reader-tab" :class="{ active: store.currentDocumentId === document.id }" tabindex="0" @click="chooseDocument(document.id)" @keydown.enter="chooseDocument(document.id)" @keydown.space.prevent="chooseDocument(document.id)"><span><AppIcon name="reader" :size="15" /></span><strong>{{ document.title }}</strong><small>本地文档</small><IconButton icon="close" size="sm" :label="`关闭 ${document.title}`" @click.stop="closeDocument(document.id)" /></div><IconButton class="reader-new-tab" icon="plus" size="sm" label="打开新文档" :disabled="busyAction !== null" @click="openFile" /><div class="reader-tab-status"><span><AppIcon name="sync" :size="13" /></span><span>{{ store.currentDocument?.wordCount }} 字</span><span><AppIcon name="history" :size="13" /> 自动保存</span></div></div>
        <div class="reader-layout" :class="{ 'focus-layout': store.mode === 'focus' }">
          <aside v-if="store.mode !== 'focus'" class="outline-panel">
            <div class="panel-heading panel-switcher">
              <div class="panel-tabs" role="tablist" aria-label="阅读侧栏">
            <button type="button" :class="{ active: leftPanelTab === 'files' }" @click="leftPanelTab = 'files'">文件 <span>{{ currentDirectoryFiles.length }}</span></button>
                <button type="button" :class="{ active: leftPanelTab === 'outline' }" @click="leftPanelTab = 'outline'">大纲</button>
              </div>
              <button class="text-button" type="button" @click="store.setMode(store.mode === 'clean' ? 'normal' : 'clean')">{{ store.mode === 'clean' ? '展开' : '收起' }}</button>
            </div>
            <div v-if="leftPanelTab === 'files'" class="file-browser-panel">
              <div class="file-location" :title="currentDirectory"><AppIcon name="library" :size="13" /><span>{{ currentDirectoryLabel }}</span><small>所在目录</small></div>
              <nav class="file-list" aria-label="当前文件夹中的 Markdown 文件">
                <button v-for="file in currentDirectoryFiles" :key="file.path" type="button" class="file-item" :class="{ active: store.currentDocumentId === file.documentId, 'is-unloaded': !file.documentId }" :aria-label="file.documentId ? `打开 ${file.name}` : `载入 ${file.name}`" @click="openFileTreeEntry(file)">
                  <AppIcon name="file" :size="14" /><span class="file-item-copy"><strong>{{ file.name }}</strong><small>{{ fileStatus(file) }}</small></span><i v-if="store.currentDocumentId === file.documentId" class="file-active-mark" />
                </button>
              </nav>
              <p class="file-browser-note"><AppIcon name="info" :size="13" />当前目录的 Markdown 文件，点击即可打开</p>
            </div>
            <nav v-else class="outline-list" aria-label="当前文档大纲"><button v-for="heading in store.currentDocument?.headings" :key="heading.id" type="button" :class="{ active: store.activeHeadingId === heading.id }" :style="{ paddingLeft: `${12 + (heading.depth - 1) * 14}px` }" @click="scrollToHeading(heading.regionId)">{{ heading.text }}</button></nav>
            <div v-if="leftPanelTab === 'outline'" class="outline-footer"><span class="progress-ring" :style="{ '--progress': `${(currentProgress?.scrollPercent ?? 0) * 360}deg` }" /> <span>{{ Math.round((currentProgress?.scrollPercent ?? 0) * 100) }}% 已读</span></div>
          </aside>
          <div ref="readerViewport" class="reader-viewport" @scroll="onReaderScroll" @mouseup="captureSelection"><div class="reader-content"><div class="reader-meta"><span class="section-kicker">{{ store.currentDocument?.path }}</span><span>{{ store.currentDocument?.wordCount }} 字 · 约 {{ store.currentDocument?.estimatedReadMinutes }} 分钟</span></div><h1 class="reader-title">{{ store.currentDocument?.title }}</h1><p class="reader-deck">在文字、图表和一块留白之间，找到你自己的阅读速度。</p><div class="reader-rule" />
            <div class="regions-stack"><RegionBlock v-for="region in readerRegions" :key="region.id" :region="region" :focused="store.focusedRegionId === region.id" :active="store.activeRegionId === region.id" :theme-mode="store.mode === 'focus' ? 'dark' : store.activeTheme?.manifest.mode" :theme-key="`${store.mode}-${focusAmbience}`" @focus="focusRegion(region)" @open-viewer="openViewer(region)" @code-copied="notify('代码已复制')" /></div>
            <footer class="reader-footer"><span>墨阅 · Moyue Reader</span><span>Read → Focus → Understand</span></footer>
          </div></div>
        <aside v-if="store.mode !== 'focus'" class="context-panel"><div class="context-top"><span class="section-kicker">主题中心</span><button class="text-button" type="button" @click="view = 'themes'">更多 <AppIcon name="external" :size="12" /></button></div><div class="theme-mini-card"><ThemePicker :themes="store.themes" :selected-theme-id="store.activeThemeId" compact @select="applyReaderTheme" /><div class="theme-mini-caption"><strong>{{ store.activeTheme?.manifest.name }}</strong><small>沉浸阅读 · {{ store.activeTheme?.manifest.mode === 'light' ? '白昼' : '深色' }}</small></div></div><div class="translation-card"><div class="side-card-heading"><span>划词翻译</span><span>中 ↔ 英</span></div><strong>intelligence</strong><small>/ɪnˈtelɪdʒəns/</small><p>n. 智能；智力；理解力<br />复数：intelligences</p><button type="button" @click="assist('translate')">在适配器中打开 <AppIcon name="external" :size="12" /></button></div><div class="diagram-card"><div class="side-card-heading"><span>图表示例</span><IconButton icon="close" size="sm" label="关闭图表示例" @click="notify('图表可独立查看')" /></div><div class="mini-diagram"><span>数据收集</span><i>↓</i><div><span>数据预处理</span><span>模型训练</span></div><i>↓</i><div><span>评估与优化</span><span>预测应用</span></div></div><button class="diagram-link" type="button" @click="notify('请点击正文中的图表进入独立查看')">独立查看 <AppIcon name="external" :size="12" /></button></div><div class="context-card current-context"><span class="section-kicker">CURRENT REGION</span><strong>{{ currentHeading?.text || '开篇' }}</strong><small>{{ store.currentDocument?.regions.length ?? 0 }} 个阅读区域 · {{ currentAnnotations.length }} 条批注</small></div><div class="context-actions"><button type="button" @click="store.setMode('focus')"><AppIcon name="focus" :size="13" />进入专注</button><button type="button" @click="view = 'themes'"><AppIcon name="palette" :size="13" />切换主题</button></div><div v-if="currentAnnotations.length" class="annotation-panel"><div class="annotation-heading"><span class="section-kicker">ANNOTATIONS</span><span>{{ currentAnnotations.length }}</span></div><button v-for="annotation in currentAnnotations.slice(0, 4)" :key="annotation.id" class="annotation-item" type="button" @click="jumpToAnnotation(annotation)"><span class="annotation-dot" :style="{ background: annotation.color }" /><span><b>{{ annotation.note || '未命名批注' }}</b><small>{{ annotation.selectedText }}</small></span></button></div></aside>
          <aside v-if="store.mode === 'focus'" class="focus-sidebar"><div class="focus-sidebar-head"><div><span class="section-kicker">FOCUS READING</span><strong>专注阅读</strong></div><button class="ghost-button" type="button" @click="exitFocusMode"><AppIcon name="close" :size="13" />退出</button></div><div class="focus-timer-card"><div class="focus-timer-ring" :style="{ '--focus-progress': `${focusProgress * 360}deg` }"><strong>{{ focusTimeLabel }}</strong><span>{{ focusRunning ? '专注中' : focusRemaining === 0 ? '已完成' : '准备开始' }}</span></div><div class="focus-timer-actions"><button type="button" @click="resetFocusTimer">重置</button><button class="primary-button" type="button" @click="toggleFocusTimer">{{ focusRunning ? '暂停' : '开始' }}</button></div></div><FocusAmbiencePicker v-model="focusAmbience" /><div class="focus-card focus-outline"><div class="focus-card-heading"><span>内容导航</span><small>{{ Math.round((currentProgress?.scrollPercent ?? 0) * 100) }}%</small></div><nav><button v-for="heading in store.currentDocument?.headings" :key="heading.id" type="button" :class="{ active: store.activeHeadingId === heading.id }" @click="focusHeading(heading.regionId)"><i />{{ heading.text }}</button></nav></div></aside>
        </div>
        <div v-if="store.mode === 'region-focus'" class="focus-hud"><span>↑ ↓ 切换区域</span><span>Enter 聚焦</span><button type="button" @click="store.clearFocus">ESC 退出</button></div>
        <div v-if="selectionToolbar" class="selection-toolbar"><span class="selection-label">{{ selectionToolbar.text.slice(0, 28) }}{{ selectionToolbar.text.length > 28 ? '…' : '' }}</span><button type="button" @click="assist('translate')">翻译</button><button type="button" @click="assist('explain')">解释</button><button type="button" @click="beginAnnotation">批注</button><button type="button" @click="copySelection">复制</button></div>
      </section>

      <ThemeCenter v-else-if="view === 'themes'" :themes="store.themes" :active-theme-id="store.activeThemeId" :active-theme="store.activeTheme" @apply="applyReaderTheme" @install="store.installTheme" @notify="notify" />

      <section v-else class="page settings-page"><div class="page-heading"><div><p class="section-kicker">PREFERENCES / EXTENSIONS</p><h1>让阅读<br /><em>顺手一点。</em></h1></div><button class="ghost-button" type="button" @click="notify('设置已保存在本地')"><AppIcon name="check" :size="14" />保存设置</button></div><div class="settings-tabs"><button :class="{ active: settingsTab === 'reading' }" type="button" @click="settingsTab = 'reading'">阅读偏好</button><button :class="{ active: settingsTab === 'shortcuts' }" type="button" @click="settingsTab = 'shortcuts'">快捷键</button><button :class="{ active: settingsTab === 'extensions' }" type="button" @click="settingsTab = 'extensions'">插件扩展</button><button type="button" @click="notify('文件关联设置将在桌面端接入')">文件关联</button><button type="button" @click="notify('同步与备份暂不启用')">同步与备份</button></div><div class="settings-grid"><div class="settings-card"><span class="section-kicker">READER</span><h2>阅读偏好</h2><label class="setting-row"><span>正文宽度 <b>{{ store.readerSettings.width }}px</b></span><input :value="store.readerSettings.width" type="range" min="620" max="980" step="10" @input="changeSetting('width', Number(($event.target as HTMLInputElement).value))" /></label><label class="setting-row"><span>字号 <b>{{ store.readerSettings.fontSize }}px</b></span><input :value="store.readerSettings.fontSize" type="range" min="15" max="24" step="1" @input="changeSetting('fontSize', Number(($event.target as HTMLInputElement).value))" /></label><label class="setting-row"><span>行距 <b>{{ store.readerSettings.lineHeight }}</b></span><input :value="store.readerSettings.lineHeight" type="range" min="1.4" max="2.2" step=".05" @input="changeSetting('lineHeight', Number(($event.target as HTMLInputElement).value))" /></label><div class="setting-toggle-row"><span>显示阅读进度</span><i class="toggle-on" /></div><div class="setting-toggle-row"><span>启用专注模式</span><i class="toggle-on" /></div></div><div class="settings-card"><span class="section-kicker">ASSISTANCE</span><h2>翻译与解释</h2><p class="muted-copy">V1 使用适配器接口，不内置固定服务。配置后，划词工具栏即可调用。</p><label class="setting-input">服务标识<input v-model="customProvider" placeholder="例如：local-llm / my-translator" /></label><button class="primary-button" type="button" @click="notify(customProvider ? '适配器标识已保存' : '保持未配置状态')"><AppIcon name="check" :size="14" />保存配置</button></div><div class="settings-card"><span class="section-kicker">SHORTCUTS</span><h2>快捷键</h2><div class="shortcut-row"><span>搜索</span><kbd>Ctrl / Cmd + K</kbd></div><div class="shortcut-row"><span>专注模式</span><kbd>F</kbd></div><div class="shortcut-row"><span>退出聚焦</span><kbd>Esc</kbd></div><div class="shortcut-row"><span>切换区域</span><kbd>↑ ↓</kbd></div></div><div class="settings-card extensions-card"><div class="extensions-head"><div><span class="section-kicker">EXTENSION CENTER</span><h2>插件扩展</h2></div><button class="ghost-button" type="button" @click="notify('插件运行时将在后续版本启用')"><AppIcon name="plugin" :size="14" />打开插件目录</button></div><div class="extension-filter"><AppIcon name="search" :size="14" /><span>探索无限可能，让阅读更强大</span></div><div class="extension-list"><div class="extension-item"><span class="extension-icon purple"><AppIcon name="sparkle" :size="17" /></span><span><b>AI 阅读助手</b><small>总结、解释与问答适配器</small></span><button type="button" @click="notify('请先在翻译与解释中配置服务')">配置</button></div><div class="extension-item"><span class="extension-icon green"><AppIcon name="download" :size="17" /></span><span><b>导出增强</b><small>为阅读内容准备更多导出格式</small></span><button type="button" @click="notify('导出增强将在下一阶段接入')">安装</button></div><div class="extension-item"><span class="extension-icon pink"><AppIcon name="components" :size="17" /></span><span><b>思维导图</b><small>把长文转换为结构化视图</small></span><button type="button" @click="notify('插件运行时暂未启用')">安装</button></div></div></div></div></section>
    </main>

    <div v-if="searchOpen" class="overlay search-overlay" @click.self="searchOpen = false"><div class="search-dialog"><div class="search-input-row"><AppIcon name="search" :size="17" /><input v-model="query" autofocus placeholder="搜索文档、标题、内容…" @keydown.esc="searchOpen = false" /><kbd>ESC</kbd></div><div v-if="searchResults.length" class="search-results"><button v-for="(result, index) in searchResults" :key="`${result.document.id}-${result.region.id}`" type="button" :class="{ selected: searchIndex === index }" @click="chooseSearchResult(result.document.id, result.region.id)"><span class="result-kind">{{ result.region.type }}</span><span><b>{{ result.document.title }}</b><small>{{ result.region.textContent.slice(0, 100) }}</small></span><AppIcon name="external" :size="14" /></button></div><div v-else class="empty-search">{{ query ? '没有找到相关内容' : '输入关键词，搜索你的阅读空间' }}</div></div></div>

    <div v-if="viewer" class="overlay viewer-overlay" @click.self="closeViewer"><div class="viewer-shell" :class="{ 'is-fullscreen': viewerFullscreen }"><header><div><span class="section-kicker">FOCUS VIEWER</span><strong>{{ viewer.region.type === 'mermaid' ? 'Mermaid 图表' : viewer.region.type === 'image' ? '图片查看' : '内容查看' }}</strong></div><div class="viewer-actions"><IconButton icon="minus" size="sm" variant="surface" label="缩小" @click="setViewerZoom(viewerZoom - .1)" /><button class="viewer-zoom-value" type="button" title="重置视图" @click="resetViewerView">{{ Math.round(viewerZoom * 100) }}%</button><IconButton icon="plus" size="sm" variant="surface" label="放大" @click="setViewerZoom(viewerZoom + .1)" /><IconButton icon="fullscreen" size="sm" variant="surface" :label="viewerFullscreen ? '退出全屏' : '全屏查看'" @click="viewerFullscreen = !viewerFullscreen" /><IconButton icon="close" size="sm" variant="surface" label="关闭查看器" @click="closeViewer" /></div></header><nav v-if="viewer.type === 'mermaid'" class="viewer-tabs"><button type="button" :class="{ active: viewerTab === 'preview' }" @click="viewerTab = 'preview'">图表预览</button><button type="button" :class="{ active: viewerTab === 'source' }" @click="viewerTab = 'source'">源代码</button><button type="button" :class="{ active: viewerTab === 'data' }" @click="viewerTab = 'data'">数据</button></nav><div class="viewer-stage" :class="{ 'is-pan-enabled': viewerCanPan, 'is-dragging': viewerDragging }" :style="viewerStageStyle" @wheel="onViewerWheel" @pointerdown="onViewerPointerDown" @pointermove="onViewerPointerMove" @pointerup="onViewerPointerUp" @pointercancel="onViewerPointerUp" @dblclick="onViewerDoubleClick"><MermaidBlock v-if="viewer.type === 'mermaid' && viewerTab === 'preview'" :code="String(viewer.region.metadata?.code ?? viewer.region.textContent)" large /><pre v-else-if="viewer.type === 'mermaid' && viewerTab === 'source'" class="viewer-source">{{ String(viewer.region.metadata?.code ?? viewer.region.textContent) }}</pre><pre v-else-if="viewer.type === 'mermaid'" class="viewer-source">{{ JSON.stringify(viewer.region.metadata ?? {}, null, 2) }}</pre><div v-else-if="viewer.type === 'image'" class="image-viewer"><img :src="String(viewer.region.metadata?.url ?? '')" :alt="viewer.region.textContent" /></div><div v-else class="code-viewer" v-html="viewer.region.html" /></div><footer><span>{{ viewerCanPan ? '滚轮缩放 · 拖动查看 · 双击还原 · Esc 返回正文' : 'Esc 返回正文' }}</span><button type="button" @click="exportViewer"><AppIcon name="download" :size="14" />导出 {{ viewer.region.type === 'mermaid' ? 'SVG' : '文本' }}</button></footer></div></div>
    <div v-if="annotationEditor" class="overlay note-overlay" @click.self="annotationEditor = null"><div class="note-dialog"><span class="section-kicker">ANNOTATION</span><h2>留下一个记号</h2><blockquote>{{ annotationEditor.text }}</blockquote><textarea v-model="annotationNote" autofocus placeholder="记录你的思考……" /><div class="note-colors"><button v-for="color in ['#e1a85b', '#a78bfa', '#76c893', '#75b7d5', '#e98282']" :key="color" type="button" :class="{ selected: annotationColor === color }" :style="{ background: color }" @click="annotationColor = color" /></div><div class="note-actions"><button class="ghost-button" type="button" @click="annotationEditor = null">取消</button><button class="primary-button" type="button" @click="saveCurrentAnnotation">保存批注</button></div></div></div>
    <div v-if="draggingFiles" class="drop-overlay" aria-live="polite"><span><AppIcon name="plus" :size="26" /></span><strong>释放以导入 Markdown</strong><small>支持 .md / .markdown 文件</small></div>
    <div v-if="toast" class="toast" role="status" aria-live="polite">{{ toast }}</div>
  </div>
</template>
