<script setup lang="ts">
import { computed, defineAsyncComponent, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { invoke, isTauri as tauriIsTauri } from '@tauri-apps/api/core'
import { useReaderStore } from './stores/reader'
import RegionBlock from './components/RegionBlock.vue'
import MermaidBlock from './components/MermaidBlock.vue'
import TreeDiagram from './components/TreeDiagram.vue'
import AppIcon from './components/AppIcon.vue'
import IconButton from './components/IconButton.vue'
import FontPicker from './components/FontPicker.vue'
import MarkdownEditor from './components/MarkdownEditor.vue'
import EditorExportMenu from './components/EditorExportMenu.vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { interfaceFont } from './fonts'
import FileSystemTree, { type FileSystemTreeNode } from './components/FileSystemTree.vue'
import ClipboardManager from './components/ClipboardManager.vue'
import { copyMarkdownPath, createBrowserAssetMap, createMarkdownDirectory, createMarkdownFile, downloadMarkdownImages, exportDocumentWithPandoc, importDocumentWithPandoc, importMarkdownAsset, importMarkdownAssetFromPath, listDirectoryFiles, listFileSystemEntries, markdownPathExists, openFileSystemDirectory, openMarkdownDirectory, openMarkdownFile, openMarkdownFolderAt, organizeMarkdownAssets, readMarkdownExportAssets, readMarkdownPath, removeMarkdownAsset, renameMarkdownAsset, renameMarkdownPath, resolveMarkdownAssetUrl, resolveMarkdownPath, saveBinaryExportFile, saveClipboardImage, saveExportFile, saveMarkdownFile, savePdfExportFile, selectDocxReference, selectFileSystemDirectory, selectMarkdownFolder, splitMarkdownLinkTarget, uploadMarkdownImage, watchMarkdownPath, writeMarkdownFile, type PandocExportFormat, type WorkspaceFile } from './fileService'
import type { Annotation, ReaderDocument, ReaderRegion, ViewerType } from './types'
import { escapeHtml, renderMathMl } from './markdown/shared'
import { makeImplicitMarkdownHeadingsExplicit, parseMarkdown, renderMarkdownFragment } from './parser'
import { getDocumentStatistics } from './documentStats'
import { asciiDiagramToMermaid, asciiTreeToTree, markdownToTree } from './asciiDiagram'
import { formatClipboardImage, formatClipboardToMarkdown, htmlToMarkdown, normalizeMixedOrderedListSource, suggestPastedMarkdownName } from './pasteMarkdown'
import { matchQuickOpen } from './quickOpen'
import { indentSelection, codeIndentInsertion, isFenceBacktickInput, selectedLineRange, removeSelectedLines } from './editorInput'
import { createEditorHistory, recordEditorHistory, stepEditorHistory } from './editorHistory'
import { findEditorMatches, replaceEditorMatches } from './editorFind'
import { parseEditableTable, serializeEditableTable, moveTableRow, moveTableColumn, deleteTableRow, deleteTableColumn, pasteTableCells, type TableAlignment } from './tableEditing'
import { sortFileTreeEntries, type FileTreeSortMode } from './fileTreeSort'
import { orderRecentFolders, pinRecentFolder, rememberRecentFolder, removeRecentFolder, type RecentFolder } from './recentFolders'
import { createDocx, createEpub, createLatex } from './exportService'
import { createExportCss, createPortableHtml } from './exportPresentation'
import { prepareExportDiagrams } from './exportDiagrams'
import { createDocumentPng } from './exportPng'
import { createPrintHtml, printPortableHtml } from './exportPrint'
import { embedExportImages, rasterizeExportImages } from './exportImages'
import { normalizeLatexDelimiters } from './markdown/fragment'
import { readEditorDraft, saveEditorDraft, removeEditorDraft, hasSaveConflict } from './editorDrafts'
import logoAsset from './assets/moyue-logo-256.png'

const FocusAmbiencePicker = defineAsyncComponent(() => import('./components/FocusAmbiencePicker.vue'))
const ThemeCenter = defineAsyncComponent(() => import('./components/ThemeCenter.vue'))
const ViewerCode = defineAsyncComponent(() => import('./components/ViewerCode.vue'))

type View = 'library' | 'reader' | 'clipboard' | 'themes' | 'settings'
type BusyAction = 'file' | 'folder' | 'drop' | 'paste' | 'paste-save' | 'paste-image' | 'pandoc' | 'delete' | null
type FileSyncState = 'idle' | 'syncing' | 'updated' | 'error'
type FileSortMode = FileTreeSortMode
type SearchScope = 'all' | 'current'
type FileTreeEntry = { path: string; name: string; documentId?: string; isDirectory?: boolean; size?: number; createdAt?: number; modifiedAt?: number }
const store = useReaderStore()
const exportAppContext = getCurrentInstance()!.appContext
const view = ref<View>('library')
const libraryTab = ref<'home' | 'all'>('all')
const librarySearchQuery = ref('')
const navCollapsed = ref(localStorage.getItem('moyue:nav-collapsed') === 'true')
const outlinePanelMinWidth = 170
const outlinePanelMaxWidth = 380
const outlinePanelDefaultWidth = typeof window !== 'undefined' && window.innerWidth < 1181 ? 195 : 204
const savedOutlinePanelWidth = Number(localStorage.getItem('moyue:outline-panel-width'))
const outlinePanelWidth = ref(Number.isFinite(savedOutlinePanelWidth) ? Math.min(outlinePanelMaxWidth, Math.max(outlinePanelMinWidth, savedOutlinePanelWidth)) : outlinePanelDefaultWidth)
const outlinePanelResizing = ref(false)
let outlineResizeStart: { x: number; width: number; handle: HTMLElement } | null = null
const readerViewport = ref<HTMLElement | null>(null)
const searchOpen = ref(false)
const query = ref('')
const searchNeedle = ref('')
const searchIndex = ref(0)
const searchScope = ref<SearchScope>('all')
const quickOpenOpen = ref(false)
const quickOpenQuery = ref('')
const quickOpenIndex = ref(0)
const searchRegex = ref(false)
const replaceOpen = ref(false)
const replaceValue = ref('')
const toast = ref('')
const booting = ref(true)
const saveFailed = ref(false)
const fileSyncState = ref<FileSyncState>('idle')
const fullscreenActive = ref(typeof document !== 'undefined' && Boolean(document.fullscreenElement))
const settingsTab = ref('reading')
type AdvancedSettings = {
  defaultExtension: 'md' | 'markdown'
  defaultCodeLanguage: string
  rememberCodeLanguage: boolean
  emojiAutocomplete: boolean
  autoLink: boolean
  rememberRecent: boolean
  dropBehavior: 'open' | 'insert'
  picListEndpoint: string
  picListKey: string
  epubChapterDepth: number
  referenceDocx: string
  printPageSize: 'A4' | 'Letter'
  printMargin: number
  printHeader: string
  printFooter: string
  printBackground: boolean
  spellcheck: boolean
  typewriterMode: boolean
  editorAutoSave: boolean
  remoteImagePrivacy: boolean
  relativeImagePathPrefix: boolean
}
const RECENT_FOLDERS_KEY = 'moyue:recent-folders'
const advancedDefaults: AdvancedSettings = { defaultExtension: 'md', defaultCodeLanguage: 'text', rememberCodeLanguage: true, emojiAutocomplete: true, autoLink: true, rememberRecent: true, dropBehavior: 'insert', picListEndpoint: 'http://127.0.0.1:36677/upload', picListKey: '', epubChapterDepth: 3, referenceDocx: '', printPageSize: 'A4', printMargin: 18, printHeader: '', printFooter: '', printBackground: true, spellcheck: true, typewriterMode: false, editorAutoSave: false, remoteImagePrivacy: false, relativeImagePathPrefix: false }
function readAdvancedSettings(): AdvancedSettings {
  try { return { ...advancedDefaults, ...JSON.parse(localStorage.getItem('moyue:advanced-settings') ?? '{}') } }
  catch { return { ...advancedDefaults } }
}
function readRecentFolders(): RecentFolder[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_FOLDERS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const folder = entry as Partial<RecentFolder>
      const openedAt = typeof folder.openedAt === 'number' ? folder.openedAt : Number.NaN
      if (typeof folder.path !== 'string' || !folder.path.trim() || !Number.isFinite(openedAt)) return []
      return [{ path: folder.path, pinned: Boolean(folder.pinned), openedAt }]
    }).slice(0, 12)
  } catch { return [] }
}
const advancedSettings = ref(readAdvancedSettings())
const recentFolders = ref<RecentFolder[]>(advancedSettings.value.rememberRecent ? readRecentFolders() : [])
const orderedRecentFolders = computed(() => orderRecentFolders(recentFolders.value))
const viewer = ref<{ type: ViewerType; region: ReaderRegion } | null>(null)
const viewerTab = ref<'preview' | 'source' | 'data'>('preview')
const viewerFullscreen = ref(false)
const wordCountOpen = ref(false)
const selectionToolbar = ref<{ text: string; html: string; regionId: string; rect: { top: number; left: number; width: number; height: number } } | null>(null)
const annotationEditor = ref<{ text: string; regionId: string } | null>(null)
const annotationNote = ref('')
const annotationColor = ref('#e1a85b')
const viewerZoom = ref(1)
const viewerPan = ref({ x: 0, y: 0 })
const viewerImageNaturalSize = ref({ width: 0, height: 0 })
const viewerDragging = ref(false)
const viewerStage = ref<HTMLElement | null>(null)
const resumePrompt = ref<{ documentId: string; percent: number } | null>(null)
let viewerPointer = { x: 0, y: 0 }
const customProvider = ref('')
const busyAction = ref<BusyAction>(null)
const exporting = ref(false)
const exportError = ref('')
const draggingFiles = ref(false)
const leftPanelTab = ref<'files' | 'outline'>('files')
const contextPanelOpen = ref(false)
const outlineQuery = ref('')
const fileBrowserMode = ref<'list' | 'tree'>('list')
const sidebarFilter = ref<'markdown' | 'all' | 'hidden' | 'glob'>('markdown')
const sidebarGlob = ref('*.md')
const savedFileSort = localStorage.getItem('moyue:file-sort') as FileSortMode | null
const fileSort = ref<FileSortMode>(savedFileSort && ['name', 'natural', 'created', 'modified', 'size'].includes(savedFileSort) ? savedFileSort : 'name')
const fileTreeMixFolders = ref(localStorage.getItem('moyue:file-tree-mix-folders') === 'true')
const filesystemTree = ref<FileSystemTreeNode | null>(null)
const filesystemTreeTarget = ref('')
const filesystemTreeScope = ref<'system' | 'workspace'>('workspace')
const filesystemFiles = ref<WorkspaceFile[]>([])
const tabListOpen = ref(false)
const tabSearchQuery = ref('')
const recentlyClosedTabs = ref<string[]>([])
const tabContextMenu = ref<{ documentId: string; x: number; y: number } | null>(null)
const fileContextMenu = ref<{ file: FileTreeEntry; x: number; y: number } | null>(null)
const fileContextMenuElement = ref<HTMLElement | null>(null)
const fileProperties = ref<FileTreeEntry | null>(null)
const editorOpen = ref(false)
const editorFindOpen = ref(false)
const editorFindQuery = ref('')
const editorFindReplacement = ref('')
const editorFindInput = ref<HTMLInputElement | null>(null)
const editorFindIndex = ref(-1)
const editorFindOptions = ref({ caseSensitive: false, wholeWord: false, regex: false })
const editorFindScope = ref<{ start: number; end: number } | undefined>()
let editorFindReplacing = false
const editorFindResult = computed(() => findEditorMatches(editorSource.value, editorFindQuery.value, { ...editorFindOptions.value, scope: editorFindScope.value }))
const editorSource = ref('')
const editorTextarea = ref<InstanceType<typeof MarkdownEditor> | null>(null)
const editorUndoAvailable = ref(false)
const editorRedoAvailable = ref(false)
const editorFocusMode = ref(localStorage.getItem('moyue:editor-focus') === 'true')


const editorPreview = ref<HTMLElement | null>(null)
const savedEditorMode = localStorage.getItem('moyue:editor-mode')
const editorMode = ref<'write' | 'split' | 'rich' | 'preview'>(savedEditorMode && ['write', 'split', 'rich', 'preview'].includes(savedEditorMode) ? savedEditorMode as 'write' | 'split' | 'rich' | 'preview' : 'rich')
const editorCalmMode = ref(localStorage.getItem('moyue:editor-calm') !== 'false')
const editorDocumentPath = ref('')
const editorDocumentId = ref('')
const editorBackupError = ref('')
const editorConflict = ref(false)
let editorAutoSaveTimer: number | null = null
let stopEditorCloseGuard: (() => void) | undefined
let editorAppDisposed = false
const editorContextMenu = ref<{ x: number; y: number } | null>(null)
const imageManagerOpen = ref(false)
const tableBuilderOpen = ref(false)
const tableBuilder = ref({ rows: 3, columns: 3, alignment: 'left' as 'left' | 'center' | 'right' })
const tableEditor = ref<{ region: ReaderRegion; rows: string[][]; alignments: TableAlignment[]; selectedColumns: number[]; row: number; column: number; documentId: string; baseSource: string; initialState: string; draft: boolean } | null>(null)
const tableEditorDialog = ref<HTMLDialogElement | null>(null)
const tableEditorSaving = ref(false)
const tableEditorMessage = ref('')
const tableEditorState = computed(() => tableEditor.value ? JSON.stringify({ rows: tableEditor.value.rows, alignments: tableEditor.value.alignments }) : null)
const tableEditorHistory = ref(createEditorHistory({ value: '', start: 0, end: 0 }))
let tableEditorHistoryRestoring = false
let tableEditorHistoryGroup = ''
const editorCodeLanguage = ref(advancedSettings.value.defaultCodeLanguage)
const lastMediaAction = ref<{ source: string; path: string | null } | null>(null)
const editorOriginalSource = ref('')
const editorSaving = ref(false)
const editorCursor = ref({ line: 1, column: 1 })
const editorInlineAssets = ref<Record<string, string>>({})
const editorInlineAssetSources = new Map<string, string>()
const editorSplitRatio = ref(58)
const editorSplitResizing = ref(false)
let editorSplitResizeCleanup: (() => void) | null = null
const editorListNormalization = computed(() => normalizeMixedOrderedListSource(restoreEditorInlineImages(editorSource.value)))
const editorSourceForSave = computed(() => restoreEditorInlineImages(editorSource.value))
const editorDirty = computed(() => editorOpen.value && editorSourceForSave.value !== editorOriginalSource.value)
const editorSourceStats = computed(() => {
  const source = editorSource.value
  return {
    characters: source.replace(/\s/g, '').length,
    lines: source ? source.split(/\r?\n/).length : 1,
  }
})
const wordCountStats = computed(() => getDocumentStatistics(store.currentDocument))
const editorImages = computed(() => [...editorSource.value.matchAll(/!\[([^\]\n]*)\]\((<[^>\n]+>|[^)\n]+)\)/g)].map((match, index) => ({ index, alt: match[1] || `图片 ${index + 1}`, url: match[2].replace(/^<|>$/g, ''), remote: /^https?:\/\//i.test(match[2].replace(/^<|>$/g, '')) })))
const emojiChoices = [{ code: 'smile', value: '😊' }, { code: 'joy', value: '😂' }, { code: 'heart', value: '❤️' }, { code: 'thumbsup', value: '👍' }, { code: 'warning', value: '⚠️' }, { code: 'check', value: '✅' }, { code: 'bulb', value: '💡' }, { code: 'rocket', value: '🚀' }]
const editorEmojiSuggestions = computed(() => {
  if (!advancedSettings.value.emojiAutocomplete || editorMode.value === 'rich') return []
  const position = editorTextarea.value?.selectionStart ?? 0
  const query = editorSource.value.slice(0, position).match(/:([a-z0-9_+-]{0,16})$/i)?.[1]?.toLowerCase()
  return query === undefined ? [] : emojiChoices.filter((item) => item.code.includes(query)).slice(0, 5)
})
const editorMarkdownNormalization = computed(() => makeImplicitMarkdownHeadingsExplicit(editorSource.value))
const exportOpen = ref(false)
const deleteConfirmation = ref<{ files: FileTreeEntry[] } | null>(null)
const selectedFilePaths = ref<string[]>([])
let fileTreeRequest = 0
const focusRemaining = ref(25 * 60)
const focusRunning = ref(false)
let focusTimer: number | null = null
let scrollFrame: number | null = null
let progressTimer: number | null = null
let searchTimer: number | null = null
let regionLayoutObserver: ResizeObserver | null = null
let regionMeasurementObserver: ResizeObserver | null = null
let viewportResizeObserver: ResizeObserver | null = null
let regionLayoutDocumentId: string | null = null
let regionLayoutStateKey: string | null = null
let regionLayoutCache: Array<{ id: string; top: number; bottom: number }> = []
const virtualMeasuredHeights = shallowRef(new Map<string, number>())
const virtualScrollTop = ref(0)
const virtualViewportHeight = ref(0)
const virtualRegionThreshold = 240
const virtualGap = 8
let focusScrollTargetId: string | null = null
let focusWheelAt = -Infinity
let readerZoomWheelAt = -Infinity
let stopNativeFileDrop: (() => void) | null = null
const documentWatchers = new Map<string, () => void>()
const documentReloadTimers = new Map<string, number>()
let documentWatchRequest = 0
let pendingProgress: { documentId: string; scrollPercent: number; regionId: string | null; headingId: string | null } | null = null
const focusThemes = computed(() => {
  const themes = store.themes.filter((theme) => theme.builtIn !== false)
  const active = store.activeTheme
  if (active && !themes.some((theme) => theme.manifest.id === active.manifest.id)) themes.unshift(active)
  return themes
})
const focusThemeStyles = computed<Record<string, string>>(() => {
  const color = store.activeTheme.tokens.color
  return {
    '--focus-accent': color.accent,
    '--focus-border': color.border,
    '--focus-sidebar-bg': 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, var(--app-bg)), var(--app-bg))',
    '--focus-card-bg': 'color-mix(in srgb, var(--surface-raised) 90%, var(--app-bg))',
    '--focus-page-bg': 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 42%, var(--app-bg)), var(--app-bg))',
    '--focus-copy': color.text,
    '--focus-muted': color.textMuted,
  }
})
const searchResults = computed(() => {
  const needle = searchNeedle.value
  if (!needle) return []
  const pattern = searchPattern.value
  if (!pattern) return []
  const documents = searchScope.value === 'current' && store.currentDocument ? [store.currentDocument] : store.documents
  return documents.flatMap((document) => document.regions.filter((region) => {
    const text = `${document.title} ${document.path} ${region.textContent}`
    pattern.lastIndex = 0
    return pattern.test(searchRegex.value ? text : text.toLowerCase())
  }).map((region) => ({ document, region, matchCount: countMatches(`${document.title} ${document.path} ${region.textContent}`, pattern) }))).slice(0, 18)
})
const quickOpenCandidates = computed<FileTreeEntry[]>(() => {
  const entries = new Map<string, FileTreeEntry>()
  for (const document of store.documents) {
    const entry = { path: document.path, name: fileNameOf(document.path), documentId: document.id }
    if (isMarkdownEntry(entry)) entries.set(normalizedPath(entry.path).toLowerCase(), entry)
  }
  for (const file of filesystemFiles.value) {
    if (!isMarkdownEntry(file)) continue
    const key = normalizedPath(file.path).toLowerCase()
    if (!entries.has(key)) entries.set(key, file)
  }
  return [...entries.values()]
})
const quickOpenResults = computed(() => matchQuickOpen(quickOpenQuery.value, quickOpenCandidates.value))
const searchPattern = computed(() => {
  const needle = searchNeedle.value.trim()
  if (!needle) return null
  try { return new RegExp(searchRegex.value ? needle : escapeRegExp(needle), 'gi') } catch { return null }
})
const searchPatternError = computed(() => Boolean(searchNeedle.value.trim()) && !searchPattern.value)
const activeViewerRegion = computed(() => viewer.value?.region ?? null)
const activeViewerTree = computed(() => viewer.value?.type === 'tree' ? asciiTreeToTree(viewer.value.region.textContent) : null)
const viewerCanZoom = computed(() => (viewer.value?.type === 'mermaid' || viewer.value?.type === 'image') && viewerTab.value === 'preview')
const viewerCanPan = computed(() => viewerCanZoom.value)
const viewerStageStyle = computed<Record<string, string>>(() => ({
  '--viewer-zoom': String(viewerZoom.value),
  '--viewer-pan-x': `${viewerPan.value.x}px`,
  '--viewer-pan-y': `${viewerPan.value.y}px`,
}))
const viewerImageStyle = computed<Record<string, string>>((): Record<string, string> => {
  const { width, height } = viewerImageNaturalSize.value
  if (!width || !height) return {}
  return {
    width: `${width * viewerZoom.value}px`,
    height: `${height * viewerZoom.value}px`,
  }
})
const currentProgress = computed(() => store.currentDocument ? store.progress[store.currentDocument.id] : undefined)
const currentAnnotations = computed(() => store.annotations.slice().sort((a, b) => b.createdAt - a.createdAt))
const currentAnnotationsByRegion = computed(() => {
  const grouped = new Map<string, Annotation[]>()
  for (const annotation of currentAnnotations.value) {
    const list = grouped.get(annotation.regionId)
    if (list) list.push(annotation)
    else grouped.set(annotation.regionId, [annotation])
  }
  return grouped
})
const filteredOpenDocuments = computed(() => {
  const needle = tabSearchQuery.value.trim().toLowerCase()
  if (!needle) return store.openDocuments
  return store.openDocuments.filter((document) => `${document.title} ${document.path}`.toLowerCase().includes(needle))
})
const filteredLibraryDocuments = computed(() => {
  const needle = librarySearchQuery.value.trim().toLowerCase()
  if (!needle) return store.documents
  return store.documents.filter((document) => document.title.toLowerCase().includes(needle))
})
const currentHeading = computed(() => store.currentDocument?.headings.find((heading) => heading.id === store.activeHeadingId))
const headingIdByRegion = computed(() => {
  const result = new Map<string, string | null>()
  const document = store.currentDocument
  if (!document) return result
  const headingByRegion = new Map(document.headings.map((heading) => [heading.regionId, heading.id]))
  let activeHeadingId: string | null = null
  for (const region of document.regions) {
    const headingId = headingByRegion.get(region.id)
    if (headingId) activeHeadingId = headingId
    result.set(region.id, activeHeadingId)
  }
  return result
})
const collapsedOutlineHeadingIds = ref<Set<string>>(new Set())
const outlineExpansionOverride = ref<boolean | null>(null)
const outlineRows = computed(() => {
  const needle = outlineQuery.value.trim().toLowerCase()
  const headings = store.currentDocument?.headings ?? []
  const rows = headings.map((heading, index) => ({
    heading,
    hasChildren: headings[index + 1]?.depth > heading.depth,
    collapsed: outlineExpansionOverride.value === false || (outlineExpansionOverride.value === null && collapsedOutlineHeadingIds.value.has(heading.id)),
  }))
  if (needle) return rows.filter(({ heading }) => heading.text.toLowerCase().includes(needle)).map((row) => ({ ...row, collapsed: false }))

  const visibleRows: typeof rows = []
  let collapsedDepth = Infinity
  for (const row of rows) {
    if (row.heading.depth > collapsedDepth) continue
    visibleRows.push(row)
    collapsedDepth = row.collapsed && row.hasChildren ? row.heading.depth : Infinity
  }
  return visibleRows
})
const readerScrollPercent = ref(0)
const readerAtTop = computed(() => readerScrollPercent.value <= 0.01)
const readerAtBottom = computed(() => readerScrollPercent.value >= 0.99)
const readerDisplayMode = ref<'markdown' | 'mindmap' | 'split'>('markdown')
const currentMindmap = computed(() => {
  const document = store.currentDocument
  return document ? markdownToTree(document.source, document.title) : null
})
const editorPreviewDocument = computed(() => {
  if (!editorSource.value.trim()) return null
  try {
    const path = store.currentDocument?.path ?? '编辑.md'
    return parseMarkdown(path, editorSource.value, (url) => resolveMarkdownAssetUrl(path, url, editorInlineAssets.value))
  } catch {
    return null
  }
})
const editorPreviewHtml = computed(() => {
  if (!editorSource.value.trim()) return '<p class="editor-preview-empty">从左侧开始写作，右侧会实时出现阅读效果。</p>'
  try {
    const path = store.currentDocument?.path ?? ''
    const html = renderMarkdownFragment(editorSource.value, (url) => resolveMarkdownAssetUrl(path, url, editorInlineAssets.value))
    return html.replace(/<p><strong>([\s\S]*?)<\/strong><\/p>/g, '<h2 class="editor-semantic-heading">$1</h2>')
  } catch {
    return '<p class="editor-preview-error">预览暂时无法解析，请检查 Markdown 语法。</p>'
  }
})
const editorHeadings = computed(() => editorPreviewDocument.value?.headings ?? [])
const readerRegions = computed(() => {
  const document = store.currentDocument
  if (!document) return []
  const first = document.regions[0]
  return first?.type === 'heading' && first.textContent.trim() === document.title.trim() ? document.regions.slice(1) : document.regions
})
const virtualizedReader = computed(() => readerRegions.value.length > virtualRegionThreshold)
const virtualLayout = computed(() => {
  const regions = readerRegions.value
  const offsets: number[] = []
  const heights: number[] = []
  let cursor = 0
  for (const [index, region] of regions.entries()) {
    offsets.push(cursor)
    const height = virtualMeasuredHeights.value.get(region.id) ?? estimatedRegionHeight(region)
    heights.push(height)
    cursor += height
    if (index < regions.length - 1) cursor += virtualGap
  }
  return { regions, offsets, heights, total: cursor }
})
const virtualRange = computed(() => {
  const layout = virtualLayout.value
  if (!virtualizedReader.value || !layout.regions.length) return { start: 0, end: layout.regions.length, before: 0, after: 0, regions: layout.regions }
  const viewportHeight = virtualViewportHeight.value || readerViewport.value?.clientHeight || 720
  const overscan = Math.max(720, viewportHeight * 1.5)
  const top = Math.max(0, virtualScrollTop.value - overscan)
  const bottom = virtualScrollTop.value + viewportHeight + overscan
  const start = Math.max(0, findVirtualIndex(layout, top) - 1)
  const end = Math.min(layout.regions.length, findVirtualIndex(layout, bottom) + 2)
  const renderedBottom = end > 0 ? layout.offsets[end - 1] + layout.heights[end - 1] : 0
  return { start, end: Math.max(start, end), before: layout.offsets[start] ?? 0, after: Math.max(0, layout.total - renderedBottom), regions: layout.regions.slice(start, end) }
})
const focusDistanceByRegion = computed(() => {
  const focusedIndex = readerRegions.value.findIndex((region) => region.id === store.focusedRegionId)
  return new Map(readerRegions.value.map((region, index) => [region.id, focusedIndex < 0 ? 0 : Math.abs(index - focusedIndex)]))
})
const focusPosition = computed(() => {
  const index = readerRegions.value.findIndex((region) => region.id === store.focusedRegionId)
  return index < 0 ? '' : `${index + 1} / ${readerRegions.value.length}`
})
function isTauriRuntime() { return tauriIsTauri() }
function linkHeadingSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^\w\u3400-\u9fff -]/g, '').replace(/\s+/g, '-')
}

function decodeLinkPart(value: string) {
  try { return decodeURIComponent(value) } catch { return value }
}

function findDocumentHeading(document: ReaderDocument | null, fragment: string) {
  const needle = decodeLinkPart(fragment.replace(/^#/, '')).trim().toLowerCase()
  if (!document || !needle) return null
  return document.headings.find((heading) => heading.id.toLowerCase() === needle || linkHeadingSlug(heading.text) === needle || heading.text.trim().toLowerCase() === needle) ?? null
}

async function openExternalLink(url: string) {
  const normalized = url.trim()
  if (!normalized) return
  if (/^(?:https?:|mailto:|tel:|\/\/)/i.test(normalized)) {
    if (!isTauriRuntime()) {
      window.open(normalized, '_blank', 'noopener,noreferrer')
      return
    }
    await invoke('open_external_url', { url: normalized }).catch(() => notify('链接打开失败，请检查链接地址'))
    return
  }

  const current = store.currentDocument
  if (!current) return
  if (normalized.startsWith('#')) {
    const heading = findDocumentHeading(current, normalized)
    if (heading) scrollToHeading(heading.regionId)
    else notify('未找到对应章节')
    return
  }
  if (!isTauriRuntime()) {
    window.open(normalized, '_blank', 'noopener,noreferrer')
    return
  }

  const { path: pathPart, fragment } = splitMarkdownLinkTarget(normalized)
  const targetPath = resolveMarkdownPath(current.path, decodeLinkPart(pathPart))
  if (!/\.(?:md|markdown|qmd)$/i.test(targetPath)) {
    notify('当前仅支持打开 Markdown / Quarto 文件链接')
    return
  }
  try {
    const existing = store.documents.find((document) => filePathKey(document.path) === filePathKey(targetPath))
    if (existing) await chooseDocument(existing.id, { skipResumePrompt: true })
    else {
      let source: string
      try { source = await readMarkdownPath(targetPath) }
      catch (error) {
        if (await markdownPathExists(targetPath)) throw error
        const name = targetPath.replace(/[\\/]/g, '/').split('/').pop() ?? '未命名文档.md'
        if (!window.confirm(`未找到「${name}」，是否创建空 Markdown 文件？`)) return
        source = `# ${name.replace(/\.(md|markdown|qmd)$/i, '')}\n\n`
        await createMarkdownFile(targetPath, source)
        notify(`已创建 ${name}`)
      }
      await store.addOpenedFiles([{ path: targetPath, source }])
    }
    if (fragment) {
      await nextTick()
      const heading = findDocumentHeading(store.currentDocument, `#${fragment}`)
      if (heading) scrollToHeading(heading.regionId)
      else notify('文件已打开，但未找到对应章节')
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : '打开文件链接失败')
  }
}
function normalizedPath(path: string) { return path.replace(/\\/g, '/') }
function directoryOf(path: string) {
  const normalized = normalizedPath(path)
  const separator = normalized.lastIndexOf('/')
  return separator >= 0 ? normalized.slice(0, separator) || '/' : '当前工作区'
}
function fileNameOf(path: string) { return normalizedPath(path).split('/').pop() || path }
function isMarkdownEntry(file: FileTreeEntry) { return !file.isDirectory && /\.(md|markdown|qmd)$/i.test(file.name) }
function hasRealFilesystemPath(path: string) { return Boolean(filesystemRoot(path)) }
function folderNameOf(path: string) { return normalizedPath(path).replace(/\/+$/, '').split('/').pop() || path }
function persistRecentFolders() {
  if (advancedSettings.value.rememberRecent) localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(recentFolders.value))
}
function rememberFolder(path: string) {
  if (!advancedSettings.value.rememberRecent || !hasRealFilesystemPath(path)) return
  recentFolders.value = rememberRecentFolder(recentFolders.value, path)
  persistRecentFolders()
}
function toggleRecentFolderPin(path: string) {
  const folder = recentFolders.value.find((item) => normalizedPath(item.path).toLowerCase() === normalizedPath(path).toLowerCase())
  if (!folder) return
  recentFolders.value = pinRecentFolder(recentFolders.value, path, !folder.pinned)
  persistRecentFolders()
}
function removeSavedRecentFolder(path: string) {
  recentFolders.value = removeRecentFolder(recentFolders.value, path)
  persistRecentFolders()
}
function isHiddenFile(name: string) { return name.startsWith('.') || name.startsWith('~$') }
function globRegExp(glob: string) {
  const source = glob.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${source || '.*'}$`, 'i')
}
function matchesSidebarFilter(name: string) {
  const markdown = /\.(md|markdown|qmd)$/i.test(name)
  const hidden = isHiddenFile(name)
  if (sidebarFilter.value === 'all') return !hidden
  if (sidebarFilter.value === 'hidden') return markdown || hidden
  if (sidebarFilter.value === 'glob') return globRegExp(sidebarGlob.value).test(name)
  return markdown && !hidden
}
const currentDirectory = computed(() => directoryOf(store.currentDocument?.path ?? ''))
const currentDirectoryLabel = computed(() => currentDirectory.value === '当前工作区' ? currentDirectory.value : currentDirectory.value.split('/').filter(Boolean).pop() || currentDirectory.value)
function compareWorkspaceFiles(left: FileTreeEntry, right: FileTreeEntry) {
  if (fileSort.value === 'natural') return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
  if (fileSort.value === 'created' || fileSort.value === 'modified') {
    const key = fileSort.value === 'created' ? 'createdAt' : 'modifiedAt'
    const difference = (right[key] ?? 0) - (left[key] ?? 0)
    return difference || left.name.localeCompare(right.name, 'zh-CN')
  }
  if (fileSort.value === 'size') return (right.size ?? 0) - (left.size ?? 0) || left.name.localeCompare(right.name, 'zh-CN')
  return left.name.localeCompare(right.name, 'zh-CN')
}
const currentDirectoryFiles = computed(() => {
  const files = new Map<string, FileTreeEntry>()
  for (const document of store.documents) {
    if (directoryOf(document.path) !== currentDirectory.value) continue
    files.set(normalizedPath(document.path), { path: document.path, name: fileNameOf(document.path), documentId: document.id })
  }
  for (const file of filesystemFiles.value) {
    const key = normalizedPath(file.path)
    if (!files.has(key)) files.set(key, file)
  }
  const result = [...files.values()].filter((file) => matchesSidebarFilter(file.name)).sort(compareWorkspaceFiles)
  return result.length || !store.currentDocument ? result : [{ path: store.currentDocument.path, name: fileNameOf(store.currentDocument.path), documentId: store.currentDocument.id }]
})
const batchDeletableFiles = computed(() => currentDirectoryFiles.value.filter(isBatchDeletableFile))
const selectedFiles = computed(() => {
  const selected = new Set(selectedFilePaths.value)
  return batchDeletableFiles.value.filter((file) => selected.has(filePathKey(file.path)))
})
const allFilesSelected = computed(() => batchDeletableFiles.value.length > 0 && selectedFiles.value.length === batchDeletableFiles.value.length)
const deleteConfirmationSummary = computed(() => {
  const files = deleteConfirmation.value?.files ?? []
  const names = files.slice(0, 3).map((file) => `“${file.name}”`).join('、')
  return files.length > 3 ? `${names} 等 ${files.length} 个文件` : names
})
const focusTimeLabel = computed(() => `${String(Math.floor(focusRemaining.value / 60)).padStart(2, '0')}:${String(focusRemaining.value % 60).padStart(2, '0')}`)
const focusProgress = computed(() => 1 - focusRemaining.value / (25 * 60))

function estimatedRegionHeight(region: ReaderRegion) {
  switch (region.type) {
    case 'heading': return 92
    case 'code': return Math.min(560, 92 + region.textContent.split(/\r?\n/).length * 22)
    case 'image': return 320
    case 'mermaid': return 260
    case 'table': return 250
    case 'math': return 140
    case 'list': return 190
    case 'blockquote': return 150
    case 'footnotes': return 260
    case 'thematic-break': return 70
    default: return 118
  }
}

function findVirtualIndex(layout: { offsets: number[]; heights: number[] }, target: number) {
  if (!layout.offsets.length) return 0
  let low = 0
  let high = layout.offsets.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (layout.offsets[middle] <= target) low = middle
    else high = middle - 1
  }
  return low
}

function notify(message: string) {
  toast.value = message
  window.setTimeout(() => { if (toast.value === message) toast.value = '' }, 2600)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countMatches(value: string, pattern: RegExp) {
  const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  let count = 0
  let match: RegExpExecArray | null
  while ((match = matcher.exec(value)) !== null) {
    count += 1
    if (!match[0]) matcher.lastIndex += 1
  }
  return count
}

function toggleOutlineHeading(headingId: string) {
  outlineExpansionOverride.value = null
  const next = new Set(collapsedOutlineHeadingIds.value)
  if (next.has(headingId)) next.delete(headingId)
  else next.add(headingId)
  collapsedOutlineHeadingIds.value = next
}

function setOutlineExpansion(expanded: boolean) {
  outlineExpansionOverride.value = expanded
  collapsedOutlineHeadingIds.value = new Set()
}

function openSearch(scope: SearchScope = 'all') {
  searchScope.value = scope
  searchIndex.value = 0
  searchOpen.value = true
}
function openQuickOpen() {
  quickOpenQuery.value = ''
  quickOpenIndex.value = 0
  quickOpenOpen.value = true
}

async function openEditor() {
  if (!store.currentDocument) return
  const document = store.currentDocument
  let originalSource = document.source
  if (isRealDocumentPath(document.path)) {
    try { originalSource = await readMarkdownPath(document.path) }
    catch (error) { notify(`无法读取原文件，未开始编辑：${String(error)}`); return }
    if (store.currentDocumentId !== document.id) return
    if (originalSource !== document.source) await store.replaceDocumentSource(document.id, originalSource)
  }
  const recovered = readEditorDraft(document.path)
  const realPath = isRealDocumentPath(store.currentDocument.path)
  let migrated = { source: originalSource, count: 0 }
  let migrationMode: 'file' | 'memory' | 'none' = 'none'
  clearEditorInlineAssets()
  try {
    if (realPath) {
      migrated = await migrateEmbeddedEditorImages(originalSource, store.currentDocument.path)
      if (migrated.count) {
        migrationMode = 'file'
      } else {
        migrated = compactEmbeddedEditorImages(originalSource)
        if (migrated.count) migrationMode = 'memory'
      }
    } else {
      migrated = compactEmbeddedEditorImages(originalSource)
      if (migrated.count) migrationMode = 'memory'
    }
  } catch {
    migrated = compactEmbeddedEditorImages(originalSource)
    if (migrated.count) migrationMode = 'memory'
    else notify('内嵌图片转换失败，可继续编辑并稍后重试')
  }
  editorDocumentPath.value = document.path
  editorDocumentId.value = document.id
  editorSource.value = recovered?.source ?? migrated.source
  editorOriginalSource.value = recovered?.baseSource ?? originalSource
  editorConflict.value = Boolean(recovered && hasSaveConflict(recovered.baseSource, originalSource, recovered.source))
  editorBackupError.value = ''
  editorCursor.value = { line: 1, column: 1 }
  editorOpen.value = true
  view.value = 'reader'
  editorContextMenu.value = null
  if (migrated.count) {
    notify(migrationMode === 'file'
      ? `已将 ${migrated.count} 张内嵌图片转换为本地图片，请保存文档`
      : `已将 ${migrated.count} 张内嵌图片收纳为短引用`)
  }
  if (recovered) notify(editorConflict.value ? '已恢复草稿；磁盘原文有变更，请另存副本后合并' : '已恢复上次未保存的草稿')
  persistEditorDraft()
  void nextTick(mountRichEditor)
}

function closeEditor() {
  if (editorDirty.value && !persistEditorDraft()) { notify('草稿备份失败，请先保存或另存副本再退出'); return }
  editorOpen.value = false
  editorFindOpen.value = false
  editorContextMenu.value = null
  clearEditorInlineAssets()
}

function persistEditorDraft() {
  if (!editorOpen.value || !editorDocumentPath.value) return true
  try {
    if (editorDirty.value) saveEditorDraft({ path: editorDocumentPath.value, source: editorSourceForSave.value, baseSource: editorOriginalSource.value, updatedAt: Date.now() })
    else removeEditorDraft(editorDocumentPath.value)
    editorBackupError.value = ''
    return true
  } catch {
    editorBackupError.value = '草稿备份失败（存储空间不足或不可用），请立即保存或另存副本'
    return false
  }
}

function protectUnsavedEditor(event: BeforeUnloadEvent) {
  if (editorDirty.value && !persistEditorDraft()) { event.preventDefault(); event.returnValue = '' }
}

async function saveEditorCopy() {
  const source = editorSourceForSave.value
  try {
    const path = await saveMarkdownFile(source, `${store.currentDocument?.title || '文档'}-草稿副本`)
    if (path) notify(`草稿副本已保存：${path}；原文件未覆盖`)
  } catch (error) { notify(String(error)) }
}

function mountRichEditor() { editorTextarea.value?.focus() }

function centerEditorCaret() { editorTextarea.value?.centerCaret() }

function onEditorCaretActivity() {
  updateEditorCursor()
  centerEditorCaret()
}



function openEditorFind() {
  if (editorMode.value === 'preview') setEditorMode('rich')
  const element = editorTextarea.value
  if (element && element.selectionStart !== element.selectionEnd) {
    const selected = editorSource.value.slice(element.selectionStart, element.selectionEnd)
    if (!selected.includes('\n')) editorFindQuery.value = selected
  }
  editorFindScope.value = undefined
  editorFindIndex.value = -1
  editorFindOpen.value = true
  void nextTick(() => { editorFindInput.value?.focus(); editorFindInput.value?.select() })
}

function closeEditorFind() {
  editorFindOpen.value = false
  void nextTick(() => editorTextarea.value?.focus())
}

function toggleEditorFindScope() {
  if (editorFindScope.value) { editorFindScope.value = undefined; return }
  const element = editorTextarea.value
  if (!element || element.selectionStart === element.selectionEnd) { notify('先在源码中选中要查找的范围'); return }
  editorFindScope.value = { start: element.selectionStart, end: element.selectionEnd }
}

function navigateEditorFind(direction: -1 | 1) {
  const matches = editorFindResult.value.matches
  if (!matches.length) return
  const index = editorFindIndex.value
  editorFindIndex.value = index < 0 ? (direction === 1 ? 0 : matches.length - 1) : (index + direction + matches.length) % matches.length
  const match = matches[editorFindIndex.value]
  applyEditorChange(editorSource.value, match.start, match.end)

}

function replaceEditorFind(all: boolean) {
  const matches = editorFindResult.value.matches
  if (editorFindResult.value.error || !matches.length) return
  const index = editorFindIndex.value < 0 ? 0 : editorFindIndex.value
  const selected = all ? matches : [matches[index]]
  if (!selected[0]) return
  const result = replaceEditorMatches(editorSource.value, selected, editorFindReplacement.value, editorFindOptions.value.regex)
  if (editorFindScope.value) editorFindScope.value = { ...editorFindScope.value, end: editorFindScope.value.end + result.delta }
  const caret = all ? selected[0].start : selected[0].end + result.delta
  editorFindReplacing = true
  try { applyEditorChange(result.value, caret) }
  finally { editorFindReplacing = false }
  editorFindIndex.value = -1
  if (!all) void nextTick(() => {
    const next = editorFindResult.value.matches.findIndex((match) => match.start >= caret)
    editorFindIndex.value = next >= 0 ? next : editorFindResult.value.matches.length ? 0 : -1
    const match = editorFindResult.value.matches[editorFindIndex.value]
    if (match) applyEditorChange(editorSource.value, match.start, match.end)
  })
  notify(`已替换 ${selected.length} 处，可用 Ctrl/Cmd+Z 撤销`)
}

function restoreEditorHistory(direction: -1 | 1) {
  if (direction === -1) editorTextarea.value?.undo()
  else editorTextarea.value?.redo()
}

function toggleTypewriterMode() {
  advancedSettings.value.typewriterMode = !advancedSettings.value.typewriterMode
}

function setEditorMode(mode: 'write' | 'split' | 'rich' | 'preview') {
  if (mode === 'preview') editorFindOpen.value = false
  if (mode !== 'split') stopEditorSplitResize()
  editorMode.value = mode
  void nextTick(() => {
    if (mode !== 'preview') editorTextarea.value?.focus()
  })
}

function onEditorSplitResizeKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Home') editorSplitRatio.value = 36
  else if (event.key === 'End') editorSplitRatio.value = 70
  else editorSplitRatio.value = Math.min(70, Math.max(36, editorSplitRatio.value + (event.key === 'ArrowLeft' ? -2 : 2)))
}

function stopEditorSplitResize() {
  editorSplitResizeCleanup?.()
  editorSplitResizeCleanup = null
  editorSplitResizing.value = false
}

function startEditorSplitResize(event: PointerEvent) {
  if (editorMode.value !== 'split') return
  const handle = event.currentTarget as HTMLElement | null
  const workspace = handle?.parentElement
  if (!handle || !workspace) return
  event.preventDefault()
  stopEditorSplitResize()
  const bounds = workspace.getBoundingClientRect()
  const updateRatio = (moveEvent: PointerEvent) => {
    const ratio = ((moveEvent.clientX - bounds.left) / bounds.width) * 100
    editorSplitRatio.value = Math.min(70, Math.max(36, ratio))
  }
  const finish = () => stopEditorSplitResize()
  editorSplitResizing.value = true
  window.addEventListener('pointermove', updateRatio)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  editorSplitResizeCleanup = () => {
    window.removeEventListener('pointermove', updateRatio)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  }
  updateRatio(event)
}

function toggleEditorCalmMode() {
  editorCalmMode.value = !editorCalmMode.value
  void nextTick(() => editorTextarea.value?.focus())
}

function openEditorPreviewImage(event: MouseEvent) {
  const image = event.target instanceof HTMLImageElement ? event.target : null
  const document = editorPreviewDocument.value
  if (!image || !document) return
  const source = image.currentSrc || image.getAttribute('src') || ''
  const region = document.regions.find((item) => item.type === 'image' && (String(item.metadata?.url ?? '') === source || item.html.includes(source)))
  if (!region) return
  openViewer({ ...region, metadata: { ...(region.metadata ?? {}), url: source } })
}

function jumpToEditorHeading(index: number) {
  const heading = editorPreview.value?.querySelectorAll('h1, h2, h3, h4, h5, h6, .editor-semantic-heading').item(index)
  heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function isRealDocumentPath(path: string) {
  return isTauriRuntime() && (/^[A-Za-z]:[\\/]/.test(path) || path.includes('/') || path.includes('\\'))
}

async function saveEditor() {
  const document = store.documents.find(item => item.id === editorDocumentId.value)
  if (!document || !editorOpen.value || editorSaving.value) return
  const sourceToSave = editorSourceForSave.value
  const original = editorOriginalSource.value
  const documentId = document.id
  editorSaving.value = true
  try {
    if (isRealDocumentPath(document.path)) await writeMarkdownFile(document.path, sourceToSave, original)
    await store.replaceDocumentSource(documentId, sourceToSave)
    if (editorDocumentId.value === documentId) {
      editorOriginalSource.value = sourceToSave
      editorConflict.value = false
      persistEditorDraft()
    } else {
      const draft = readEditorDraft(document.path)
      if (draft?.source === sourceToSave) removeEditorDraft(document.path)
      else if (draft) saveEditorDraft({ ...draft, baseSource: sourceToSave })
    }
    notify('Markdown 已保存')
  } catch (error) {
    if (editorDocumentId.value === documentId) {
      editorConflict.value = String(error).includes('其他程序修改')
      persistEditorDraft()
    }
    notify(String(error instanceof Error ? error.message : error))
  } finally { editorSaving.value = false }
}

function updateEditorCursor() {
  const element = editorTextarea.value
  if (!element) return
  const position = element.selectionStart
  const before = editorSource.value.slice(0, position)
  const lastBreak = before.lastIndexOf('\n')
  editorCursor.value = {
    line: (before.match(/\n/g)?.length ?? 0) + 1,
    column: position - lastBreak,
  }
}

function updateEditor(transform: (value: string, start: number, end: number) => { value: string; start: number; end: number }) {
  const element = editorTextarea.value
  if (!element) return
  const result = transform(editorSource.value, element.selectionStart, element.selectionEnd)
  applyEditorChange(result.value, result.start, result.end)
}

function applyEditorChange(value: string, start: number, end = start) {
  editorTextarea.value?.replaceSource(value, start, end)
  editorSource.value = value
  editorTextarea.value?.focus()
  updateEditorCursor()
}

function normalizeEditorMarkdown() {
  const result = editorMarkdownNormalization.value
  if (!result.converted) return
  const element = editorTextarea.value
  const start = element?.selectionStart ?? editorSource.value.length
  const end = element?.selectionEnd ?? start
  const deltaBefore = result.insertedOffsets.filter((offset) => offset < start).length * 3
  const deltaToEnd = result.insertedOffsets.filter((offset) => offset < end).length * 3
  applyEditorChange(result.source, start + deltaBefore, end + deltaToEnd)
  notify(`已补全 ${result.converted} 个 Markdown 章节标记`)
}

function normalizeEditorLists() {
  const result = editorListNormalization.value
  if (!result.converted || result.source === editorSource.value) return
  const element = editorTextarea.value
  const cursor = element?.selectionStart ?? result.source.length
  editorSource.value = result.source
  void nextTick(() => {
    element?.focus()
    const nextCursor = Math.min(result.source.length, cursor)
    element?.setSelectionRange(nextCursor, nextCursor)
  })
  notify(`已整理 ${result.converted} 行列表编号`)
}

function indentEditorSelection(outdent: boolean) {
  const element = editorTextarea.value
  if (!element) return
  const result = indentSelection(editorSource.value, element.selectionStart, element.selectionEnd, outdent)
  applyEditorChange(result.value, result.start, result.end)
}

function continueEditorList() {
  const element = editorTextarea.value
  if (!element || element.selectionStart !== element.selectionEnd) return false
  const value = editorSource.value
  const cursor = element.selectionStart
  const lineStart = value.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const lineEnd = value.indexOf('\n', cursor)
  const end = lineEnd < 0 ? value.length : lineEnd
  const line = value.slice(lineStart, end)
  const match = line.match(/^(\s*)([-+*]|\d+[.)]|>)(\s+)(\[[ xX]\]\s*)?/)
  if (!match) return false
  const prefix = match[0]
  const content = line.slice(prefix.length).trim()
  if (!content) {
    applyEditorChange(`${value.slice(0, lineStart)}${value.slice(end)}`, lineStart)
    return true
  }
  const mixed = line.match(/^(\s*)[-+*]\s+(\d+)[.)]\s+(.+)$/)
  if (mixed) {
    const normalizedLine = `${mixed[1]}${mixed[2]}. ${mixed[3]}`
    const oldPrefixLength = mixed[0].length - mixed[3].length
    const newPrefixLength = mixed[1].length + mixed[2].length + 2
    const normalizedCursor = cursor + (cursor > lineStart + oldPrefixLength ? newPrefixLength - oldPrefixLength : 0)
    const normalizedValue = `${value.slice(0, lineStart)}${normalizedLine}${value.slice(end)}`
    const insertion = `\n${mixed[1]}${Number(mixed[2]) + 1}. `
    applyEditorChange(`${normalizedValue.slice(0, normalizedCursor)}${insertion}${normalizedValue.slice(normalizedCursor)}`, normalizedCursor + insertion.length)
    return true
  }
  const ordered = match[2].match(/^(\d+)([.)])$/)
  const nextPrefix = ordered ? `${Number(ordered[1]) + 1}${ordered[2]}${match[3]}${match[4] ?? ''}` : prefix
  const insertion = `\n${nextPrefix}`
  applyEditorChange(`${value.slice(0, cursor)}${insertion}${value.slice(cursor)}`, cursor + insertion.length)
  return true
}

function continueEditorCodeIndent() {
  const element = editorTextarea.value
  if (!element || element.selectionStart !== element.selectionEnd) return false
  const value = editorSource.value
  const cursor = element.selectionStart
  const insertion = codeIndentInsertion(value, cursor)
  if (insertion === null) return false
  applyEditorChange(`${value.slice(0, cursor)}${insertion.text}${value.slice(cursor)}`, cursor + insertion.caret)
  return true
}

function editorLineRange() {
  const element = editorTextarea.value
  if (!element) return null
  return selectedLineRange(editorSource.value, element.selectionStart, element.selectionEnd)
}

function selectEditorLine() {
  const range = editorLineRange()
  const element = editorTextarea.value
  if (!range || !element) return
  element.focus()
  element.setSelectionRange(range.start, range.end)
}

function deleteEditorLine() {
  const range = editorLineRange()
  if (!range) return
  const result = removeSelectedLines(editorSource.value, range.start, range.end)
  applyEditorChange(result.value, result.start, result.end)
}

async function cutEditorLine() {
  const range = editorLineRange()
  if (!range) return
  const source = editorSource.value
  const documentId = store.currentDocumentId
  const line = source.slice(range.start, range.end < source.length ? range.end + 1 : range.end)
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(line)
    if (!editorOpen.value || editorMode.value === 'preview' || store.currentDocumentId !== documentId || editorSource.value !== source) {
      notify('已复制原行；文档发生变化，未删除内容')
      return
    }
    const result = removeSelectedLines(source, range.start, range.end)
    applyEditorChange(result.value, result.start, result.end)
  } catch { notify('剪切失败：无法写入剪贴板，原文已保留') }
}

function onEditorLineClipboard(event: ClipboardEvent, cut: boolean) {
  const element = editorTextarea.value
  if (!element || element.selectionStart !== element.selectionEnd || !event.clipboardData) return
  const range = editorLineRange()
  if (!range) return
  try {
    event.clipboardData.setData('text/plain', editorSource.value.slice(range.start, range.end < editorSource.value.length ? range.end + 1 : range.end))
    event.preventDefault()
    if (cut) deleteEditorLine()
  } catch { event.preventDefault(); notify('剪贴板操作失败，原文已保留') }
}

function onEditorKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()) && !event.altKey) {
    event.preventDefault()
    restoreEditorHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1)
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    deleteEditorLine()
    return
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    indentEditorSelection(event.shiftKey)
    return
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && (continueEditorCodeIndent() || continueEditorList())) {
    event.preventDefault()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const element = editorTextarea.value
  if (!element) return
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '`': '`' }
  if (event.key === '`' && element.selectionStart === element.selectionEnd && isFenceBacktickInput(editorSource.value, element.selectionStart)) return
  const closing = new Set(Object.values(pairs))
  if (closing.has(event.key) && element.selectionStart === element.selectionEnd && editorSource.value[element.selectionStart] === event.key) {
    event.preventDefault()
    applyEditorChange(editorSource.value, element.selectionStart + 1)
    return
  }
  if (pairs[event.key]) {
    event.preventDefault()
    const start = element.selectionStart
    const end = element.selectionEnd
    const selected = editorSource.value.slice(start, end)
    const insertion = `${event.key}${selected}${pairs[event.key]}`
    applyEditorChange(`${editorSource.value.slice(0, start)}${insertion}${editorSource.value.slice(end)}`, start + 1, start + 1 + selected.length)
    return
  }
}

function insertEditorTextAt(text: string, start: number, end: number, block = false) {
  const element = editorTextarea.value
  if (!element) return
  const before = editorSource.value.slice(0, start)
  const after = editorSource.value.slice(end)
  const value = block
    ? `${before && !before.endsWith('\n') ? '\n' : ''}${text}${after && !after.startsWith('\n') ? '\n' : ''}`
    : text
  editorSource.value = `${before}${value}${after}`
  const cursor = start + value.length
  void nextTick(() => {
    element.focus()
    element.setSelectionRange(cursor, cursor)
  })
}

async function onEditorPaste(event: ClipboardEvent) {
  const element = editorTextarea.value
  if (!element) return
  const clipboard = event.clipboardData
  const imageItem = Array.from(clipboard?.items ?? []).find((item) => item.kind === 'file' && /^image\//i.test(item.type))
  const plainText = clipboard?.getData('text/plain') ?? ''
  const hasText = Boolean(clipboard?.getData('text/html') || plainText)
  if (!imageItem && hasText) {
    const html = clipboard?.getData('text/html') ?? ''
    if (html) {
      event.preventDefault(); event.stopPropagation()
      insertEditorTextAt(formatClipboardToMarkdown(html, plainText), element.selectionStart, element.selectionEnd)
      return
    }
    const normalized = normalizeMixedOrderedListSource(plainText)
    if (normalized.converted) {
      event.preventDefault()
      event.stopPropagation()
      insertEditorTextAt(normalized.source, element.selectionStart, element.selectionEnd)
      notify(`已修正 ${normalized.converted} 行列表编号`)
    }
    return
  }

  // The page-level handler intentionally ignores typing targets. Stop this
  // event here so an image is handled exactly once by the editor.
  event.preventDefault()
  event.stopPropagation()
  const start = element.selectionStart
  const end = element.selectionEnd
  const sourceAtPaste = editorSource.value
  const documentId = editorDocumentId.value
  const documentPath = editorDocumentPath.value
  busyAction.value = 'paste-image'
  try {
    const image = imageItem?.getAsFile() ?? await readNativeClipboardImage()
    if (!image) {
      notify('剪贴板里没有可读取的图片')
      return
    }
    if (!editorOpen.value || editorDocumentId.value !== documentId || editorSource.value !== sourceAtPaste) { notify('文档已变化，未插入图片，请重新粘贴'); return }
    const imagePath = isRealDocumentPath(documentPath)
      ? await saveClipboardImage(documentPath, image, advancedSettings.value.relativeImagePathPrefix)
      : null
    const imageMarkdown = formatClipboardImage(imagePath ?? await blobToDataUrl(image))
    if (!editorOpen.value || editorDocumentId.value !== documentId || editorSource.value !== sourceAtPaste) { notify(imagePath ? `图片已保存至 ${imagePath}；文档已变化，未插入错误位置` : '文档已变化，未插入图片，请重新粘贴'); return }
    insertEditorTextAt(imageMarkdown, start, end, true)
    notify(imagePath ? '图片已保存并插入 Markdown 编辑器' : '图片已插入 Markdown 编辑器')
  } catch (error) {
    notify(error instanceof Error ? error.message : '插入剪贴板图片失败')
  } finally {
    busyAction.value = null
  }
}

function wrapEditorSelection(before: string, after: string, placeholder: string) {
  if (editorTextarea.value?.wrapInlineCell(before, after, placeholder)) return
  updateEditor((value, start, end) => {
    const selected = value.slice(start, end) || placeholder
    if (start >= before.length && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
      return { value: value.slice(0, start - before.length) + selected + value.slice(end + after.length), start: start - before.length, end: end - before.length }
    }
    return { value: value.slice(0, start) + before + selected + after + value.slice(end), start: start + before.length, end: start + before.length + selected.length }
  })
}

function insertEditorToc() {
  const element = editorTextarea.value
  if (element) insertEditorTextAt('[toc]', element.selectionStart, element.selectionEnd, true)
}

function insertEditorLink() {
  updateEditor((value, start, end) => {
    const selected = value.slice(start, end) || '链接文字'
    const next = `${value.slice(0, start)}[${selected}](https://)${value.slice(end)}`
    const urlStart = start + selected.length + 3
    return { value: next, start: urlStart, end: urlStart + 8 }
  })
}

function insertEditorMedia(kind: 'image' | 'video', markdownUrl: string, videoTitle = '') {
  const markup = kind === 'image' ? `![图片](${markdownUrl})` : `[视频](${markdownUrl}${videoTitle ? ` "${videoTitle}"` : ''})`
  updateEditor((value, start, end) => ({ value: `${value.slice(0, start)}${markup}${value.slice(end)}`, start: start + markup.length, end: start + markup.length }))
}

async function importEditorMedia(kind: 'image' | 'video') {
  const document = store.currentDocument
  if (!document) return
  if (!isRealDocumentPath(document.path)) {
    const fallback = kind === 'image' ? '图片地址' : '视频地址'
    insertEditorMedia(kind, fallback)
    notify('浏览器预览已插入地址占位符；桌面端可直接导入文件')
    return
  }
  busyAction.value = 'file'
  try {
    const url = await importMarkdownAsset(document.path, kind, kind === 'image' && advancedSettings.value.relativeImagePathPrefix)
    if (!url) return
    lastMediaAction.value = { source: editorSource.value, path: url }
    const videoTitle = kind === 'video'
      ? (window.prompt('视频封面/字幕（可选）', 'poster=封面.jpg;track=字幕.vtt;lang=zh-CN') ?? '').trim().replace(/["\r\n]/g, '')
      : ''
    insertEditorMedia(kind, url, videoTitle)
    notify(kind === 'image' ? '图片已导入并插入' : '视频已导入并插入')
  } catch (error) {
    notify(error instanceof Error ? error.message : '媒体导入失败')
  } finally {
    busyAction.value = null
  }
}

function insertEditorImage() {
  void importEditorMedia('image')
}

function insertEditorVideo() {
  void importEditorMedia('video')
}

async function uploadEditorImage() {
  busyAction.value = 'file'
  try {
    const url = await uploadMarkdownImage(advancedSettings.value.picListEndpoint, advancedSettings.value.picListKey)
    if (!url) return
    lastMediaAction.value = { source: editorSource.value, path: null }
    insertEditorMedia('image', url)
    notify('图片已通过 PicList 上传并插入')
  } catch (error) {
    notify(error instanceof Error ? error.message : 'PicList 上传失败')
  } finally { busyAction.value = null }
}

async function downloadAllEditorImages() {
  const document = store.currentDocument
  if (!document || !isRealDocumentPath(document.path)) { notify('请先在桌面端保存 Markdown'); return }
  busyAction.value = 'file'
  try {
    const previous = editorSource.value
    const result = await downloadMarkdownImages(document.path, previous, advancedSettings.value.relativeImagePathPrefix)
    if (!result.count) { notify('没有需要下载的远程图片'); return }
    lastMediaAction.value = { source: previous, path: null }
    editorSource.value = result.source
    if (editorMode.value === 'rich') void nextTick(mountRichEditor)
    notify(`已下载 ${result.count} 张图片到 .moyue-assets`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '下载图片失败')
  } finally { busyAction.value = null }
}

async function undoLastMediaAction() {
  const action = lastMediaAction.value
  const document = store.currentDocument
  if (!action || !document) return
  try {
    if (action.path) await removeMarkdownAsset(document.path, action.path)
    editorSource.value = action.source
    lastMediaAction.value = null
    if (editorMode.value === 'rich') void nextTick(mountRichEditor)
    notify('已撤销上一次图片操作')
  } catch (error) { notify(error instanceof Error ? error.message : '撤销图片操作失败') }
}

async function renameEditorImage(url: string) {
  const document = store.currentDocument
  if (!document) return
  const currentName = url.split('/').pop() ?? 'image.png'
  const nextName = window.prompt('图片新文件名', currentName)?.trim()
  if (!nextName) return
  try {
    const nextUrl = await renameMarkdownAsset(document.path, url, nextName, advancedSettings.value.relativeImagePathPrefix)
    editorSource.value = editorSource.value.split(url).join(nextUrl)
    notify(`图片已重命名为 ${nextName}`)
  } catch (error) { notify(error instanceof Error ? error.message : '图片重命名失败') }
}

async function deleteEditorImage(url: string) {
  const document = store.currentDocument
  if (!document || !window.confirm('删除图片文件并移除文档中的引用？')) return
  try {
    await removeMarkdownAsset(document.path, url)
    editorSource.value = editorSource.value.replace(new RegExp(`!\\[[^\\]\\n]*\\]\\(${escapeRegExp(url)}\\)\\s*`, 'g'), '')
    notify('图片文件和引用已删除')
  } catch (error) { notify(error instanceof Error ? error.message : '图片删除失败') }
}

async function organizeEditorMedia() {
  const document = store.currentDocument
  if (!document || !isRealDocumentPath(document.path)) {
    notify('请先在桌面端保存 Markdown，再整理媒体')
    return
  }
  busyAction.value = 'file'
  try {
    const result = await organizeMarkdownAssets(document.path, editorSource.value, advancedSettings.value.relativeImagePathPrefix)
    if (!result.count) {
      notify('没有需要移动的本地图片或视频')
      return
    }
    editorSource.value = result.source
    if (editorMode.value === 'rich') void nextTick(mountRichEditor)
    notify(`已整理 ${result.count} 个媒体文件，请保存文档`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '媒体整理失败')
  } finally {
    busyAction.value = null
  }
}

function insertEditorTable() {
  tableBuilderOpen.value = true
}

function confirmInsertEditorTable() {
  const rows = Math.min(20, Math.max(2, tableBuilder.value.rows))
  const columns = Math.min(12, Math.max(1, tableBuilder.value.columns))
  const marker = tableBuilder.value.alignment === 'center' ? ':---:' : tableBuilder.value.alignment === 'right' ? '---:' : ':---'
  const header = `| ${Array.from({ length: columns }, (_, index) => `列 ${index + 1}`).join(' | ')} |`
  const divider = `| ${Array.from({ length: columns }, () => marker).join(' | ')} |`
  const body = Array.from({ length: rows - 1 }, () => `| ${Array.from({ length: columns }, () => ' ').join(' | ')} |`).join('\n')
  const table = `${header}\n${divider}\n${body}`
  const element = editorTextarea.value
  if (element) insertEditorTextAt(table, element.selectionStart, element.selectionEnd, true)
  tableBuilderOpen.value = false
}

function openTableEditor(region: ReaderRegion, draft = false) {
  const document = store.currentDocument
  if (!document) return
  const baseSource = draft ? editorSource.value : document.source
  const table = parseEditableTable(baseSource.slice(region.sourceStart, region.sourceEnd))
  if (!table) { notify('当前表格无法进入可视化编辑'); return }
  tableEditorMessage.value = ''
  tableEditor.value = {
    region, ...table, selectedColumns: [], row: 0, column: 0,
    documentId: document.id, baseSource, initialState: JSON.stringify(table), draft,
  }
  void nextTick(() => { tableEditorDialog.value?.showModal(); focusTableCell(0, 0) })
}

function closeTableEditor() {
  if (tableEditorSaving.value) return
  const draft = tableEditor.value?.draft
  tableEditorDialog.value?.close()
  tableEditor.value = null
  if (draft) void nextTick(() => editorTextarea.value?.focus())
}

function onTableEditorDialogKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
  const controls = [...(tableEditorDialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

function restoreTableEditorHistory(direction: -1 | 1) {
  const editor = tableEditor.value
  if (!editor || tableEditorSaving.value) return
  const snapshot = stepEditorHistory(tableEditorHistory.value, direction)
  if (!snapshot) return
  const restored = JSON.parse(snapshot.value) as { rows: string[][]; alignments: TableAlignment[] }
  tableEditorHistoryRestoring = true
  editor.rows = restored.rows
  editor.alignments = restored.alignments
  editor.selectedColumns = []
  editor.row = Math.min(snapshot.start, editor.rows.length - 1)
  editor.column = Math.min(snapshot.end, editor.alignments.length - 1)
  focusTableCell(editor.row, editor.column)
  void nextTick(() => { tableEditorHistoryRestoring = false })
}

function onTableCellFocus(row: number, column: number) {
  const editor = tableEditor.value
  if (!editor) return
  if (editor.row !== row || editor.column !== column) tableEditorHistory.value.group = ''
  editor.row = row
  editor.column = column
  const current = tableEditorHistory.value.entries[tableEditorHistory.value.index]
  current.start = row
  current.end = column
}

function onTableCellBeforeInput(event: InputEvent, row: number, column: number) {
  tableEditorMessage.value = ''
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault()
    restoreTableEditorHistory(event.inputType === 'historyUndo' ? -1 : 1)
    return
  }
  const element = event.currentTarget as HTMLTextAreaElement
  tableEditorHistoryGroup = element.selectionStart === element.selectionEnd && /^(insertText|insertCompositionText|deleteContentBackward|deleteContentForward)$/.test(event.inputType) ? `cell-${row}-${column}-${event.inputType}` : ''
}

function openDraftTableEditor() {
  const cursor = editorTextarea.value?.selectionStart
  if (cursor === undefined) return
  const region = editorPreviewDocument.value?.regions.find((region) => region.type === 'table' && cursor >= region.sourceStart && cursor <= region.sourceEnd)
  if (!region) { notify('先把光标放到要编辑的 Markdown 表格中'); return }
  openTableEditor(region, true)
}

function changeTableStructure(kind: 'delete-row' | 'delete-column' | 'up' | 'down' | 'left' | 'right') {
  tableEditorHistoryGroup = ''
  tableEditorMessage.value = ''
  const editor = tableEditor.value
  if (!editor) return
  if (kind === 'delete-row') {
    if (deleteTableRow(editor, editor.row)) editor.row = Math.min(editor.row, editor.rows.length - 1)
  } else if (kind === 'up' || kind === 'down') editor.row = moveTableRow(editor, editor.row, kind === 'up' ? -1 : 1)
  else if (kind === 'delete-column') {
    const column = editor.column
    if (deleteTableColumn(editor, column)) {
      editor.selectedColumns = editor.selectedColumns.filter((item) => item !== column).map((item) => item > column ? item - 1 : item)
      editor.column = Math.min(column, editor.alignments.length - 1)
    }
  } else {
    const column = editor.column
    const target = moveTableColumn(editor, column, kind === 'left' ? -1 : 1)
    editor.selectedColumns = editor.selectedColumns.map((item) => item === column ? target : item === target ? column : item)
    editor.column = target
  }
  focusTableCell(editor.row, editor.column)
}

function focusTableCell(row: number, column: number) {
  void nextTick(() => tableEditorDialog.value?.querySelector<HTMLTextAreaElement>(`[data-table-cell="${row}-${column}"]`)?.focus())
}

function onTableCellKeydown(event: KeyboardEvent, row: number, column: number) {
  const editor = tableEditor.value
  if (event.ctrlKey || event.metaKey || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) tableEditorHistory.value.group = ''
  if (!editor || event.isComposing || !['Tab', 'Enter'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Enter' && event.shiftKey) return
  const width = editor.alignments.length
  let index = row * width + column + (event.key === 'Tab' ? (event.shiftKey ? -1 : 1) : (event.shiftKey ? -width : width))
  if (index < 0) return
  if (index >= editor.rows.length * width) {
    if (editor.rows.length >= 500) return
    addTableEditorRow()
  }
  event.preventDefault()
  focusTableCell(Math.floor(index / width), index % width)
}

function onTableCellPaste(event: ClipboardEvent, row: number, column: number) {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (!tableEditor.value || !/[\t\r\n]/.test(text)) return
  event.preventDefault()
  tableEditorHistoryGroup = ''
  const error = pasteTableCells(tableEditor.value, row, column, text)
  tableEditorMessage.value = error
  if (!error) focusTableCell(row, column)
}

function addTableEditorRow() {
  tableEditorHistoryGroup = ''
  if (!tableEditor.value || tableEditor.value.rows.length >= 500) return
  tableEditor.value.rows.push(Array.from({ length: tableEditor.value.alignments.length }, () => ''))
}

function addTableEditorColumn() {
  tableEditorHistoryGroup = ''
  if (!tableEditor.value || tableEditor.value.alignments.length >= 12) return
  tableEditor.value.alignments.push('left')
  for (const row of tableEditor.value.rows) row.push('')
}

function setTableEditorAlignment(alignment: 'left' | 'center' | 'right') {
  tableEditorHistoryGroup = ''
  if (!tableEditor.value) return
  const selected = new Set(tableEditor.value.selectedColumns)
  tableEditor.value.alignments = tableEditor.value.alignments.map((current, column) => !selected.size || selected.has(column) ? alignment : current)
}

function toggleTableEditorColumn(column: number) {
  if (!tableEditor.value) return
  tableEditor.value.selectedColumns = tableEditor.value.selectedColumns.includes(column)
    ? tableEditor.value.selectedColumns.filter((item) => item !== column)
    : [...tableEditor.value.selectedColumns, column].sort((left, right) => left - right)
}

async function saveTableEditor() {
  const editor = tableEditor.value
  const document = store.currentDocument
  if (!editor || !document || tableEditorSaving.value) return
  if (tableEditorState.value === editor.initialState) {
    closeTableEditor()
    notify('表格未改变，已保留原始 Markdown 格式')
    return
  }
  const currentSource = editor.draft ? editorSource.value : document.source
  if (document.id !== editor.documentId || currentSource !== editor.baseSource || (editor.draft && !editorOpen.value)) {
    tableEditorMessage.value = '文档已变化，未覆盖内容；请关闭并重新打开表格编辑器'
    return
  }
  const source = serializeEditableTable(editor)
  const nextSource = `${currentSource.slice(0, editor.region.sourceStart)}${source}${currentSource.slice(editor.region.sourceEnd)}`
  if (editor.draft) {
    applyEditorChange(nextSource, editor.region.sourceStart, editor.region.sourceStart + source.length)
    closeTableEditor()
    notify('表格已应用到草稿，可撤销；保存文档后才写入文件')
    return
  }
  tableEditorSaving.value = true
  try {
    if (isRealDocumentPath(document.path)) await writeMarkdownFile(document.path, nextSource, document.source)
    await store.replaceDocumentSource(document.id, nextSource)
    tableEditorSaving.value = false
    closeTableEditor()
    closeViewer()
    notify('表格已更新')
  } catch (error) { tableEditorMessage.value = error instanceof Error ? error.message : '保存表格失败，请重试' }
  finally { tableEditorSaving.value = false }
}

function insertEditorAlert(kind = 'NOTE') {
  const source = `> [!${kind}]\n> 在这里填写内容`
  updateEditor((value, start, end) => ({ value: `${value.slice(0, start)}${source}${value.slice(end)}`, start: start + source.length, end: start + source.length }))
}

function toggleEditorAlert(kind = 'NOTE') {
  const element = editorTextarea.value
  if (!element) return
  const value = editorSource.value
  const start = element.selectionStart
  const end = element.selectionEnd
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEnd = value.indexOf('\n', Math.max(start, end - (end > start ? 1 : 0)))
  const blockEnd = lineEnd < 0 ? value.length : lineEnd
  const lines = value.slice(lineStart, blockEnd).split('\n')
  if (!lines.some((line) => line.trim())) { insertEditorAlert(kind); return }
  const currentAlert = /^>\s*\[![A-Z]+\](?:\s+.*)?$/i.test(lines[0] ?? '')
  const next = currentAlert
    ? lines.slice(1).map((line) => line.replace(/^>\s?/, '')).join('\n')
    : [`> [!${kind}]`, ...lines.map((line) => `> ${line}`)].join('\n')
  applyEditorChange(`${value.slice(0, lineStart)}${next}${value.slice(blockEnd)}`, lineStart, lineStart + next.length)
}

function insertEditorCodeBlock() {
  const language = editorCodeLanguage.value.trim() || advancedSettings.value.defaultCodeLanguage || 'text'
  if (advancedSettings.value.rememberCodeLanguage) advancedSettings.value.defaultCodeLanguage = language
  wrapEditorSelection(`\`\`\`${language}\n`, '\n```', '代码')
}

function insertEditorEmoji(value: string) {
  const element = editorTextarea.value
  if (!element) return
  const position = element.selectionStart
  const before = editorSource.value.slice(0, position)
  const start = before.search(/:[a-z0-9_+-]{0,16}$/i)
  if (start < 0) return
  applyEditorChange(`${editorSource.value.slice(0, start)}${value}${editorSource.value.slice(position)}`, start + value.length)
}

function insertEditorDivider() {
  updateEditor((value, start, end) => {
    const divider = '---'
    const next = `${value.slice(0, start)}${divider}${value.slice(end)}`
    return { value: next, start: start + divider.length, end: start + divider.length }
  })
}

function prefixEditorLines(prefix: string) {
  updateEditor((value, start, end) => {
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const lineEnd = value.indexOf('\n', end)
    const stop = lineEnd < 0 ? value.length : lineEnd
    const lines = value.slice(lineStart, stop).split('\n').map((line) => {
      if (prefix !== '- ' && prefix !== '- [ ] ') return `${prefix}${line}`
      const content = line.replace(/^(\s*)(?:(?:[-+*]\s+)?\d+[.)]\s+|[-+*]\s+)(?:\[[ xX]\]\s*)?/, '$1')
      return `${prefix}${content}`
    })
    const next = `${value.slice(0, lineStart)}${lines.join('\n')}${value.slice(stop)}`
    const added = prefix.length * lines.length
    return { value: next, start: start + prefix.length, end: end + added }
  })
}

function editorBlockLineRange(lines: string[], line: number) {
  if (!lines[line]?.trim()) return { startLine: line, endLine: line }
  const fence = /^\s*(?:```|~~~)/
  let fenceStart = -1
  for (let index = 0; index <= line; index += 1) {
    if (!fence.test(lines[index] ?? '')) continue
    if (fenceStart < 0) {
      fenceStart = index
      continue
    }
    if (line <= index) return { startLine: fenceStart, endLine: index }
    fenceStart = -1
  }
  if (fenceStart >= 0) {
    let fenceEnd = lines.length - 1
    for (let index = fenceStart + 1; index < lines.length; index += 1) {
      if (fence.test(lines[index] ?? '')) { fenceEnd = index; break }
    }
    return { startLine: fenceStart, endLine: fenceEnd }
  }
  let startLine = line
  let endLine = line
  while (startLine > 0 && lines[startLine - 1]?.trim()) startLine -= 1
  while (endLine + 1 < lines.length && lines[endLine + 1]?.trim()) endLine += 1
  return { startLine, endLine }
}

function lineOffset(lines: string[], line: number) {
  return lines.slice(0, line).join('\n').length + (line ? 1 : 0)
}

function moveEditorLine(delta: number) {
  updateEditor((value, start, end) => {
    const lines = value.split('\n')
    const startLine = value.slice(0, start).split('\n').length - 1
    const endLine = value.slice(0, Math.max(start, end - 1)).split('\n').length - 1
    const firstBlock = editorBlockLineRange(lines, startLine)
    const lastBlock = editorBlockLineRange(lines, endLine)
    const blockStart = Math.min(firstBlock.startLine, lastBlock.startLine)
    const blockEnd = Math.max(firstBlock.endLine, lastBlock.endLine)
    const blockStartOffset = lineOffset(lines, blockStart)
    const relativeStart = Math.max(0, start - blockStartOffset)
    const relativeEnd = Math.max(relativeStart, end - blockStartOffset)

    if (delta < 0) {
      let previousEnd = blockStart - 1
      while (previousEnd >= 0 && !lines[previousEnd]?.trim()) previousEnd -= 1
      if (previousEnd < 0) return { value, start, end }
      const previous = editorBlockLineRange(lines, previousEnd)
      const previousBlock = lines.slice(previous.startLine, previous.endLine + 1)
      const between = lines.slice(previous.endLine + 1, blockStart)
      const currentBlock = lines.slice(blockStart, blockEnd + 1)
      const nextLines = [...lines]
      nextLines.splice(previous.startLine, blockEnd - previous.startLine + 1, ...currentBlock, ...between, ...previousBlock)
      const nextStart = lineOffset(nextLines, previous.startLine)
      return { value: nextLines.join('\n'), start: nextStart + relativeStart, end: nextStart + relativeEnd }
    }

    let nextStartLine = blockEnd + 1
    while (nextStartLine < lines.length && !lines[nextStartLine]?.trim()) nextStartLine += 1
    if (nextStartLine >= lines.length) return { value, start, end }
    const nextBlock = editorBlockLineRange(lines, nextStartLine)
    const currentBlock = lines.slice(blockStart, blockEnd + 1)
    const between = lines.slice(blockEnd + 1, nextBlock.startLine)
    const followingBlock = lines.slice(nextBlock.startLine, nextBlock.endLine + 1)
    const nextLines = [...lines]
    nextLines.splice(blockStart, nextBlock.endLine - blockStart + 1, ...followingBlock, ...between, ...currentBlock)
    const nextStart = lineOffset(nextLines, blockStart + followingBlock.length + between.length)
    return { value: nextLines.join('\n'), start: nextStart + relativeStart, end: nextStart + relativeEnd }
  })
}

function openEditorContextMenu(event: MouseEvent) {
  event.preventDefault()
  editorContextMenu.value = { x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 190) }
}

function closeEditorContextMenu() { editorContextMenu.value = null }

function exportSnapshot() {
  const document = store.currentDocument
  if (!document) return null
  return editorOpen.value && editorDocumentId.value === document.id
    ? parseMarkdown(document.path, editorSourceForSave.value) : document
}

async function chooseDocxReference() {
  try {
    const path = await selectDocxReference()
    if (path) { advancedSettings.value.referenceDocx = path; notify('Word 样式模板已设置') }
  } catch (error) { notify(String(error instanceof Error ? error.message : error)) }
}

async function exportHtmlSource(document: ReaderDocument, styled = true) {
  const source = await prepareExportDiagrams(document.source, exportAppContext)
  const assets = await rasterizeExportImages(await readMarkdownExportAssets(document.path, source))
  return createPortableHtml(document.title, source, assets, styled ? createExportCss(store.activeTheme, store.readerSettings) : '')
}

async function renderDocumentPng(document: ReaderDocument) {
  return createDocumentPng(await exportHtmlSource(document), Math.min(1400, Math.max(720, store.readerSettings.width + 96)))
}

async function exportDocument(format: 'markdown' | 'html' | 'html-clean' | 'image' | PandocExportFormat) {
  const document = exportSnapshot()
  if (!document || exporting.value) return
  exporting.value = true
  exportError.value = ''
  try {
    let path: string | null = null
    if (isTauriRuntime() && ['docx', 'latex', 'odt', 'rtf', 'mediawiki'].includes(format)) {
      let source = await prepareExportDiagrams(normalizeLatexDelimiters(document.source), exportAppContext)
      if (format === 'docx' || format === 'latex') source = embedExportImages(source, await rasterizeExportImages(await readMarkdownExportAssets(document.path, source), true))
      path = await exportDocumentWithPandoc(source, document.title || '文档', format as PandocExportFormat, document.path, { css: createExportCss(store.activeTheme, store.readerSettings), referenceDocx: advancedSettings.value.referenceDocx, chapterDepth: advancedSettings.value.epubChapterDepth, title: document.title })
    } else if (format === 'docx' || format === 'epub') {
      const source = await prepareExportDiagrams(document.source, exportAppContext)
      const assets = await readMarkdownExportAssets(document.path, source)
      const bytes = format === 'docx' ? createDocx(document.title, source, assets) : createEpub(document.title, source, assets, { chapterDepth: advancedSettings.value.epubChapterDepth, css: createExportCss(store.activeTheme, store.readerSettings) })
      path = await saveBinaryExportFile(bytes, document.title || '文档', format, format === 'docx' ? 'Word 文档' : 'EPUB 电子书', format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/epub+zip')
    } else if (format === 'image') {
      path = await saveBinaryExportFile(await renderDocumentPng(document), document.title || '文档', 'png', 'PNG 长图', 'image/png')
    } else if (format === 'odt' || format === 'rtf' || format === 'mediawiki') {
      throw new Error('此格式需要桌面端和 Pandoc')
    } else {
      const extension = format === 'html' || format === 'html-clean' ? 'html' : format === 'latex' ? 'tex' : 'md'
      const source = format === 'html' || format === 'html-clean' ? await exportHtmlSource(document, format === 'html') : format === 'latex' ? createLatex(document.title, document.source) : document.source
      path = await saveExportFile(source, document.title || '文档', extension, format === 'latex' ? 'LaTeX' : extension.toUpperCase())
    }
    if (path) notify(`已导出：${path}`)
  } catch (error) {
    exportError.value = String(error instanceof Error ? error.message : error)
    notify(exportError.value)
  } finally { exporting.value = false }
}

function printDocument() {
  void exportPdfDocument(true)
}

async function exportPdfDocument(print = false) {
  const document = exportSnapshot()
  if (!document || exporting.value) return
  exporting.value = true
  exportError.value = ''
  const settings = advancedSettings.value
  try {
    const html = createPrintHtml(await exportHtmlSource(document), settings)
    if (print || !isTauriRuntime()) { await printPortableHtml(html); return }
    const path = await savePdfExportFile(html, document.title || '文档')
    if (path) notify(`已导出 PDF：${path}`)
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '打印 / PDF 导出失败'
    notify(exportError.value)
  } finally { exporting.value = false }
}

async function replaceSearchMatches() {
  const pattern = searchPattern.value
  if (!pattern || !query.value.trim()) return
  const documents = searchScope.value === 'current' && store.currentDocument ? [store.currentDocument] : store.documents
  let changed = 0
  try {
    for (const document of documents) {
      const matcher = new RegExp(pattern.source, pattern.flags)
      const nextSource = document.source.replace(matcher, replaceValue.value)
      if (nextSource === document.source) continue
      if (isRealDocumentPath(document.path)) await writeMarkdownFile(document.path, nextSource, document.source)
      await store.replaceDocumentSource(document.id, nextSource)
      changed += 1
    }
    notify(changed ? `已替换 ${changed} 个文档` : '没有可替换的匹配项')
  } catch (error) {
    notify(error instanceof Error ? error.message : '替换失败')
  }
}

async function toggleTask(region: ReaderRegion) {
  const document = store.currentDocument
  if (!document || region.type !== 'list') return
  const original = document.source.slice(region.sourceStart, region.sourceEnd)
  if (!/\[[ xX]\]/.test(original)) return
  const nextRegion = original.replace(/\[([ xX])\]/, (_, mark: string) => mark.toLowerCase() === 'x' ? '[ ]' : '[x]')
  const nextSource = `${document.source.slice(0, region.sourceStart)}${nextRegion}${document.source.slice(region.sourceEnd)}`
  try {
    if (isRealDocumentPath(document.path)) await writeMarkdownFile(document.path, nextSource, document.source)
    await store.replaceDocumentSource(document.id, nextSource)
    notify('任务状态已更新')
  } catch (error) {
    notify(error instanceof Error ? error.message : '任务状态保存失败')
  }
}

function openLibrary(tab: 'home' | 'all') { libraryTab.value = tab; view.value = 'library' }
function toggleNavCollapsed() {
  navCollapsed.value = !navCollapsed.value
  localStorage.setItem('moyue:nav-collapsed', String(navCollapsed.value))
}
function setOutlinePanelWidth(width: number) {
  outlinePanelWidth.value = Math.round(Math.min(outlinePanelMaxWidth, Math.max(outlinePanelMinWidth, width)))
  localStorage.setItem('moyue:outline-panel-width', String(outlinePanelWidth.value))
}
function startOutlinePanelResize(event: PointerEvent) {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  outlineResizeStart = { x: event.clientX, width: outlinePanelWidth.value, handle }
  outlinePanelResizing.value = true
  document.body.classList.add('is-resizing-outline')
  handle.setPointerCapture(event.pointerId)
  window.addEventListener('pointermove', onOutlinePanelResize)
  window.addEventListener('pointerup', stopOutlinePanelResize)
  window.addEventListener('pointercancel', stopOutlinePanelResize)
  event.preventDefault()
}
function onOutlinePanelResize(event: PointerEvent) {
  if (!outlineResizeStart) return
  setOutlinePanelWidth(outlineResizeStart.width + event.clientX - outlineResizeStart.x)
}
function stopOutlinePanelResize(event?: PointerEvent) {
  if (!outlineResizeStart) return
  if (event && outlineResizeStart.handle.hasPointerCapture(event.pointerId)) outlineResizeStart.handle.releasePointerCapture(event.pointerId)
  outlineResizeStart = null
  outlinePanelResizing.value = false
  document.body.classList.remove('is-resizing-outline')
  window.removeEventListener('pointermove', onOutlinePanelResize)
  window.removeEventListener('pointerup', stopOutlinePanelResize)
  window.removeEventListener('pointercancel', stopOutlinePanelResize)
}
function onOutlinePanelResizeKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    setOutlinePanelWidth(outlinePanelWidth.value + (event.key === 'ArrowRight' ? 10 : -10))
    event.preventDefault()
  } else if (event.key === 'Home') {
    setOutlinePanelWidth(outlinePanelMinWidth)
    event.preventDefault()
  } else if (event.key === 'End') {
    setOutlinePanelWidth(outlinePanelMaxWidth)
    event.preventDefault()
  }
}
function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('clipboard-image-read-failed'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(value: string): Blob | null {
  const match = value.match(/^data:(image\/[\w.+-]+);base64,([\s\S]*)$/i)
  if (!match) return null
  try {
    const binary = atob(match[2].replace(/\s/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type: match[1] })
  } catch {
    return null
  }
}

function clearEditorInlineAssets() {
  for (const url of Object.values(editorInlineAssets.value)) URL.revokeObjectURL(url)
  editorInlineAssets.value = {}
  editorInlineAssetSources.clear()
}

function compactEmbeddedEditorImages(source: string) {
  if (!/data:image\//i.test(source)) return { source, count: 0 }
  const pattern = /data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=\s]*?(?=\s*[\)"'])/gi
  let nextSource = ''
  let lastIndex = 0
  let count = 0
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? -1
    if (index < 0) continue
    const dataUrl = match[0].trim()
    const image = dataUrlToBlob(dataUrl)
    if (!image) continue
    const key = `moyue-editor://image-${Date.now().toString(36)}-${count + 1}`
    editorInlineAssets.value[key] = URL.createObjectURL(image)
    editorInlineAssetSources.set(key, dataUrl)
    nextSource += source.slice(lastIndex, index) + key
    lastIndex = index + match[0].length
    count += 1
  }
  return count ? { source: nextSource + source.slice(lastIndex), count } : { source, count: 0 }
}

function restoreEditorInlineImages(source: string) {
  let restored = source
  for (const [key, dataUrl] of editorInlineAssetSources) restored = restored.split(key).join(dataUrl)
  return restored
}

async function migrateEmbeddedEditorImages(source: string, markdownPath: string) {
  if (!isRealDocumentPath(markdownPath) || !/data:image\//i.test(source)) return { source, count: 0 }
  const pattern = /data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=\s]*?(?=\s*[\)"'])/gi
  let nextSource = ''
  let lastIndex = 0
  let count = 0
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? -1
    if (index < 0) continue
    const image = dataUrlToBlob(match[0].trim())
    if (!image) continue
    const imagePath = await saveClipboardImage(markdownPath, image, advancedSettings.value.relativeImagePathPrefix)
    if (!imagePath) continue
    nextSource += source.slice(lastIndex, index) + imagePath
    lastIndex = index + match[0].length
    count += 1
  }
  return count ? { source: nextSource + source.slice(lastIndex), count } : { source, count: 0 }
}

async function readNativeClipboardImage(): Promise<Blob | null> {
  try {
    const result = await invoke<{ bytes: number[]; mime: string }>('read_clipboard_image')
    const bytes = Uint8Array.from(result.bytes)
    return bytes.length ? new Blob([bytes], { type: result.mime || 'image/png' }) : null
  } catch {
    return null
  }
}

async function importClipboardContent(html: string, text: string, saveToFile = false, image: Blob | null = null, action: BusyAction = null) {
  if (busyAction.value) return
  let source = formatClipboardToMarkdown(html, text)
  if (!source && !image) image = await readNativeClipboardImage()
  if (!source && image) source = formatClipboardImage(await blobToDataUrl(image))
  if (!source) {
    notify('剪贴板里没有可格式化的内容')
    return
  }
  busyAction.value = action ?? (saveToFile ? 'paste-save' : 'paste')
  try {
    const suggestedName = suggestPastedMarkdownName(source)
    let path = saveToFile ? await saveMarkdownFile(source, suggestedName) : `${suggestedName}.md`
    if (!path) return
    if (!saveToFile) {
      const usedPaths = new Set(store.documents.map((document) => normalizedPath(document.path).toLowerCase()))
      const base = path.replace(/\.(?:md|markdown|qmd)$/i, '')
      let suffix = 2
      while (usedPaths.has(normalizedPath(path).toLowerCase())) path = `${base}-${suffix++}.md`
    }
    // Clipboard images are opened as session documents first. Persisting a
    // large data URL in the local snapshot can exceed WebKit's storage quota
    // and leave the default document selected.
    const count = await store.addOpenedFiles([{ path, source }], { persist: !image })
    if (count) {
      view.value = 'reader'
      await nextTick()
      restoreScroll()
      notify(saveToFile ? `已保存并打开：${path}` : '已粘贴并格式化为 Markdown')
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : '粘贴内容失败')
  } finally {
    busyAction.value = null
  }
}

function onPaste(event: ClipboardEvent) {
  if (isTypingTarget(event.target)) return
  const clipboard = event.clipboardData
  const html = clipboard?.getData('text/html') ?? ''
  const text = clipboard?.getData('text/plain') ?? ''
  const imageItem = Array.from(clipboard?.items ?? []).find((item) => item.kind === 'file' && /^image\//i.test(item.type))
  const image = imageItem?.getAsFile() ?? null
  event.preventDefault()
  void importClipboardContent(html, text, false, image)
}

async function pasteFromClipboard(saveToFile = false) {
  if (busyAction.value) return
  try {
    const clipboard = navigator.clipboard
    if (clipboard && typeof clipboard.read === 'function') {
      const items = await clipboard.read()
      const item = items[0]
      if (item) {
        const htmlBlob = item.types.includes('text/html') ? await item.getType('text/html') : null
        const textBlob = item.types.includes('text/plain') ? await item.getType('text/plain') : null
        const imageType = item.types.find((type) => /^image\//i.test(type))
        const image = imageType ? await item.getType(imageType) : null
        await importClipboardContent(htmlBlob ? await htmlBlob.text() : '', textBlob ? await textBlob.text() : '', saveToFile, image)
        return
      }
    }
    if (!clipboard) throw new Error('clipboard-unavailable')
    await importClipboardContent('', await clipboard.readText(), saveToFile)
  } catch (error) {
    notify(error instanceof Error ? '无法读取剪贴板，请直接按 Ctrl/Cmd+V' : '无法读取剪贴板')
  }
}

async function pasteImageFromClipboard() {
  if (busyAction.value) return
  const image = await readNativeClipboardImage()
  if (!image) {
    notify('剪贴板里没有可读取的图片，请先复制一张图片')
    return
  }
  await importClipboardContent('', '', false, image, 'paste-image')
}

function onFullscreenChange() {
  fullscreenActive.value = Boolean(document.fullscreenElement)
}

function switchDocument(delta: number) {
  const ids = store.openDocumentIds
  if (ids.length < 2 || !store.currentDocumentId) return
  const index = ids.indexOf(store.currentDocumentId)
  const next = ids[(index + delta + ids.length) % ids.length]
  if (next) void chooseDocument(next)
}

function tabLabel(document: { title: string; path: string }) {
  const duplicates = store.openDocuments.filter((item) => item.title === document.title)
  return duplicates.length > 1 ? `${displayTitle(document.title)} · ${displayTitle(fileNameOf(document.path))}` : displayTitle(document.title)
}

function closeTabMenus() {
  tabListOpen.value = false
  tabSearchQuery.value = ''
  tabContextMenu.value = null
  fileContextMenu.value = null
}

function toggleTabList() {
  tabListOpen.value = !tabListOpen.value
  if (!tabListOpen.value) tabSearchQuery.value = ''
  tabContextMenu.value = null
}

function openTabContextMenu(event: MouseEvent, documentId: string) {
  const width = 214
  const height = 194
  tabListOpen.value = false
  tabContextMenu.value = {
    documentId,
    x: Math.min(event.clientX, Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(event.clientY, Math.max(8, window.innerHeight - height - 8)),
  }
}

function openFileContextMenu(event: MouseEvent, file: FileTreeEntry) {
  event.preventDefault()
  closeTabMenus()
  fileContextMenu.value = {
    file,
    x: event.clientX,
    y: event.clientY,
  }
  void nextTick(() => {
    const current = fileContextMenu.value
    const menu = fileContextMenuElement.value
    if (!current || !menu || current.file.path !== file.path) return
    const bounds = menu.getBoundingClientRect()
    const x = Math.min(event.clientX, Math.max(8, window.innerWidth - bounds.width - 8))
    const y = Math.min(event.clientY, Math.max(8, window.innerHeight - bounds.height - 8))
    fileContextMenu.value = { ...current, x, y }
  })
}

function openFilesystemContextMenu(event: MouseEvent, node: FileSystemTreeNode) {
  openFileContextMenu(event, {
    path: node.path,
    name: node.name,
    documentId: node.documentId,
    isDirectory: node.isDirectory,
  })
}

function joinFilePath(directory: string, name: string) {
  return directory ? `${directory.replace(/[\\/]+$/, '')}/${name}` : name
}

function validEntryName(value: string) {
  const name = value.trim()
  return Boolean(name) && !['.', '..'].includes(name) && !/[\\/]/.test(name)
}

function markdownName(value: string) {
  const name = value.trim()
  return /\.(md|markdown|qmd)$/i.test(name) ? name : `${name}.${advancedSettings.value.defaultExtension}`
}

function hasCurrentFile(path: string) {
  return currentDirectoryFiles.value.some((file) => normalizedPath(file.path).toLowerCase() === normalizedPath(path).toLowerCase())
}

function filesystemRoot(path: string) {
  const normalized = normalizedPath(path)
  return normalized.match(/^[A-Za-z]:\//)?.[0] ?? (normalized.startsWith('/') ? '/' : '')
}

function filesystemPathKey(path: string) {
  return normalizedPath(path).replace(/\/+$/, '').toLowerCase()
}

function filesystemDocumentRoot(path: string) {
  const directory = directoryOf(path)
  return directory !== '当前工作区' && filesystemRoot(path) ? directory : ''
}

function createFilesystemNode(path: string, name: string, isDirectory: boolean, metadata: Pick<FileSystemTreeNode, 'size' | 'createdAt' | 'modifiedAt'> = {}): FileSystemTreeNode {
  return { path, name, isDirectory, ...metadata, expanded: false, loading: false, children: null }
}

function sortFilesystemTree(node: FileSystemTreeNode) {
  if (!node.children) return
  node.children = sortFileTreeEntries(node.children, fileSort.value, fileTreeMixFolders.value)
  for (const child of node.children) sortFilesystemTree(child)
}

function createWorkspaceTree(): FileSystemTreeNode {
  const root = createFilesystemNode('当前工作区', '当前工作区', true)
  root.expanded = true
  root.children = []
  const directories = new Map<string, FileSystemTreeNode>([['', root]])
  for (const document of store.documents) {
    const path = normalizedPath(document.path).replace(/^\/+/, '')
    const parts = path.split('/').filter(Boolean)
    if (!parts.length) continue
    let parent = root
    let directoryPath = ''
    for (const part of parts.slice(0, -1)) {
      directoryPath = directoryPath ? `${directoryPath}/${part}` : part
      let directory = directories.get(directoryPath)
      if (!directory) {
        directory = { ...createFilesystemNode(`@workspace/${directoryPath}`, part, true), children: [] }
        parent.children?.push(directory)
        directories.set(directoryPath, directory)
      }
      parent = directory
    }
    parent.children?.push({ ...createFilesystemNode(document.path, fileNameOf(path), false), documentId: document.id })
  }
  function sortAndReveal(node: FileSystemTreeNode) {
    node.expanded = true
    node.children = sortFileTreeEntries(node.children ?? [], fileSort.value, fileTreeMixFolders.value)
    for (const child of node.children ?? []) {
      sortAndReveal(child)
    }
  }
  sortAndReveal(root)
  return root
}

async function loadFilesystemNode(node: FileSystemTreeNode) {
  if (!node.isDirectory || node.children !== null || node.loading) return
  node.loading = true
  node.error = ''
  try {
    const children = (await listFileSystemEntries(node.path))
      .filter((entry) => entry.isDirectory || matchesSidebarFilter(entry.name))
      .map((entry) => createFilesystemNode(entry.path, entry.name, entry.isDirectory, entry))
    node.children = sortFileTreeEntries(children, fileSort.value, fileTreeMixFolders.value)
  } catch (error) {
    node.children = []
    node.error = error instanceof Error ? error.message : '无法读取此目录'
  } finally {
    node.loading = false
  }
}

async function toggleFilesystemNode(node: FileSystemTreeNode) {
  if (!node.isDirectory) return
  if (node.children === null) await loadFilesystemNode(node)
  node.expanded = !node.expanded
}

async function revealFilesystemTarget(node: FileSystemTreeNode, targetPath: string) {
  await loadFilesystemNode(node)
  node.expanded = true
  const target = filesystemPathKey(targetPath)
  const child = node.children?.find((item) => target === filesystemPathKey(item.path) || target.startsWith(`${filesystemPathKey(item.path)}/`))
  if (child && filesystemPathKey(child.path) !== target && child.isDirectory) await revealFilesystemTarget(child, targetPath)
}

async function expandFilesystemTree(node: FileSystemTreeNode) {
  await loadFilesystemNode(node)
  node.expanded = true
  for (const child of node.children ?? []) {
    if (child.isDirectory) await expandFilesystemTree(child)
  }
}

async function refreshFilesystemDirectory(path: string) {
  if (fileBrowserMode.value !== 'tree') return
  const node = filesystemNodeAt(path)
  if (!node?.isDirectory) return
  node.children = null
  await loadFilesystemNode(node)
  node.expanded = true
}

function fileDirectoryPath(path: string) {
  const normalized = normalizedPath(path)
  const separator = normalized.lastIndexOf('/')
  if (separator < 0) return ''
  const parent = normalized.slice(0, separator)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent || '/'
}

function contextDirectoryPath(file: FileTreeEntry) {
  return file.isDirectory ? file.path : fileDirectoryPath(file.path)
}

function canCreateInContext(file: FileTreeEntry) {
  return isTauriRuntime() && hasRealFilesystemPath(contextDirectoryPath(file))
}

function canManageMarkdownEntry(file: FileTreeEntry) {
  return isTauriRuntime() && hasRealFilesystemPath(file.path) && isMarkdownEntry(file)
}

function filesystemNodeAt(path: string, node = filesystemTree.value): FileSystemTreeNode | null {
  if (!node) return null
  if (filesystemPathKey(node.path) === filesystemPathKey(path)) return node
  for (const child of node.children ?? []) {
    const match = filesystemNodeAt(path, child)
    if (match) return match
  }
  return null
}

function filesystemNodeExpanded(path: string) {
  return filesystemNodeAt(path)?.expanded ?? false
}

async function writeTextToClipboard(value: string) {
  if (isTauriRuntime()) {
    await invoke('write_clipboard_snapshot', { kind: 'text', text: value, bytes: null })
    return
  }
  if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable')
  await navigator.clipboard.writeText(value)
}

async function copyFileContextValue(kind: 'name' | 'file' | 'directory') {
  const file = fileContextMenu.value?.file
  if (!file) return
  const value = kind === 'name' ? file.name : kind === 'file' ? file.path : contextDirectoryPath(file)
  fileContextMenu.value = null
  if (!value || (kind === 'directory' && !hasRealFilesystemPath(value))) {
    notify('当前工作区没有可复制的实际目录路径')
    return
  }
  try {
    await writeTextToClipboard(value)
    notify(kind === 'name' ? '文件名已复制' : kind === 'file' ? '文件路径已复制' : '目录路径已复制')
  } catch {
    notify('复制失败，请检查剪贴板权限')
  }
}

async function openFileContextEntry() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file) return
  if (file.isDirectory) {
    await toggleFileContextDirectory(file)
    return
  }
  await openFileTreeEntry(file)
}

async function openFileContextNewTab() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file || file.isDirectory) return
  await openFileTreeEntry(file)
  if (file.documentId && store.openDocumentIds.includes(file.documentId)) notify('已切换到该文档标签')
}

async function createFileContextFile() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file) return
  const directory = contextDirectoryPath(file)
  const value = window.prompt('新建 Markdown 文件', '新建文本文档.md')
  if (value === null) return
  const name = markdownName(value)
  if (!validEntryName(name)) { notify('文件名不能为空，且不能包含路径分隔符'); return }
  const path = joinFilePath(directory, name)
  if (hasCurrentFile(path)) { notify('同名文件已存在'); return }
  if (busyAction.value) return
  busyAction.value = 'file'
  try {
    await createMarkdownFile(path, `# ${name.replace(/\.(md|markdown|qmd)$/i, '')}\n\n`)
    await refreshFileTree()
    await refreshFilesystemDirectory(directory)
    notify(`已新建 ${name}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '新建文件失败')
  } finally { busyAction.value = null }
}

async function createFileContextFolder() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file) return
  const directory = contextDirectoryPath(file)
  const name = window.prompt('新建文件夹', '新建文件夹')
  if (name === null) return
  if (!validEntryName(name)) { notify('文件夹名称不能为空，且不能包含路径分隔符'); return }
  if (!directory) { notify('当前工作区没有可用的实际目录路径'); return }
  if (busyAction.value) return
  busyAction.value = 'file'
  try {
    await createMarkdownDirectory(joinFilePath(directory, name.trim()))
    await refreshFilesystemDirectory(directory)
    notify(`已新建文件夹 ${name.trim()}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '新建文件夹失败')
  } finally { busyAction.value = null }
}

function searchFileContextEntry() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file || !isMarkdownEntry(file)) return
  query.value = file.name.replace(/\.(md|markdown|qmd)$/i, '')
  openSearch('all')
}

function showFileProperties() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (file) fileProperties.value = file
}

async function copyFilePropertiesPath() {
  const file = fileProperties.value
  if (!file) return
  try {
    await writeTextToClipboard(file.path)
    fileProperties.value = null
    notify('文件路径已复制')
  } catch {
    notify('复制失败，请检查剪贴板权限')
  }
}

function showDocumentList() {
  fileContextMenu.value = null
  fileBrowserMode.value = 'list'
  leftPanelTab.value = 'files'
  notify('已切换到文档列表')
}

async function openFilesystemTreeForFile(file: FileTreeEntry) {
  const rootPath = filesystemDocumentRoot(file.path)
  if (!rootPath) {
    notify('当前文档没有真实系统路径，请重新选择这个文件')
    return
  }
  filesystemTreeScope.value = 'system'
  filesystemTreeTarget.value = file.path
  const root = createFilesystemNode(rootPath, fileNameOf(rootPath) || rootPath, true)
  filesystemTree.value = root
  await expandFilesystemTree(root)
  notify(root.error ? '当前目录文档树已打开，但目录读取受限' : '已打开当前目录的文档树')
}

async function toggleFileContextDirectory(file: FileTreeEntry) {
  if (!file.isDirectory) return
  if (fileBrowserMode.value !== 'tree') {
    fileBrowserMode.value = 'tree'
    leftPanelTab.value = 'files'
    if (!isTauriRuntime() || !hasRealFilesystemPath(file.path)) {
      filesystemTreeScope.value = 'workspace'
      filesystemTreeTarget.value = file.path
      filesystemTree.value = createWorkspaceTree()
      notify('已打开已授权工作区的文件树')
      return
    }
    filesystemTreeScope.value = 'system'
    filesystemTreeTarget.value = file.path
    filesystemTree.value = createFilesystemNode(file.path, file.name, true)
    await expandFilesystemTree(filesystemTree.value)
    return
  }
  const node = filesystemNodeAt(file.path)
  if (node) {
    await toggleFilesystemNode(node)
    filesystemTreeTarget.value = file.path
  } else {
    await showDocumentTreeForEntry(file)
  }
}

async function showDocumentTreeForEntry(file: FileTreeEntry) {
  fileContextMenu.value = null
  fileBrowserMode.value = 'tree'
  leftPanelTab.value = 'files'
  if (!isTauriRuntime()) {
    filesystemTreeScope.value = 'workspace'
    filesystemTreeTarget.value = file.path
    filesystemTree.value = createWorkspaceTree()
    notify('已打开已授权工作区的文件树')
    return
  }
  if (file.isDirectory && isTauriRuntime() && hasRealFilesystemPath(file.path)) {
    filesystemTreeScope.value = 'system'
    filesystemTreeTarget.value = file.path
    filesystemTree.value = createFilesystemNode(file.path, file.name, true)
    await expandFilesystemTree(filesystemTree.value)
    notify('已打开当前目录的文档树')
    return
  }
  if (!filesystemRoot(file.path)) {
    const selected = await openMarkdownFile()
    const matched = selected.find((item) => fileNameOf(item.path).toLowerCase() === file.name.toLowerCase()) ?? selected[0]
    if (!matched) {
      notify('未选择文件，系统文件树未打开')
      return
    }
    await store.addOpenedFiles([matched])
    await openFilesystemTreeForFile({ path: matched.path, name: fileNameOf(matched.path) })
    return
  }
  await openFilesystemTreeForFile(file)
}

async function showDocumentTree() {
  const file = fileContextMenu.value?.file
  if (!file) return
  await showDocumentTreeForEntry(file)
}

async function syncFilesystemTreeTarget(path: string) {
  if (fileBrowserMode.value !== 'tree' || !path) return
  filesystemTreeTarget.value = path
  const rootPath = filesystemDocumentRoot(path)
  if (filesystemTreeScope.value === 'workspace' || !rootPath) {
    filesystemTreeScope.value = 'workspace'
    filesystemTree.value = createWorkspaceTree()
    return
  }
  if (!filesystemTree.value || filesystemPathKey(filesystemTree.value.path) !== filesystemPathKey(rootPath)) {
    filesystemTree.value = createFilesystemNode(rootPath, fileNameOf(rootPath) || rootPath, true)
    await expandFilesystemTree(filesystemTree.value)
  } else {
    await revealFilesystemTarget(filesystemTree.value, path)
  }
}

async function openFilesystemTreeNode(node: FileSystemTreeNode) {
  if (node.isDirectory) {
    await toggleFilesystemNode(node)
    return
  }
  if (!/\.(md|markdown|qmd)$/i.test(node.name)) {
    notify('当前阅读器只支持打开 Markdown 文件')
    return
  }
  await openFileTreeEntry({ path: node.path, name: node.name, documentId: node.documentId })
}

async function renameFileContextEntry() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file || !canManageMarkdownEntry(file)) return
  const value = window.prompt('重命名 Markdown 文件', file.name)
  if (value === null) return
  const name = markdownName(value)
  if (!validEntryName(name)) { notify('文件名不能为空，且不能包含路径分隔符'); return }
  const nextPath = joinFilePath(fileDirectoryPath(file.path), name)
  if (normalizedPath(nextPath).toLowerCase() === normalizedPath(file.path).toLowerCase()) return
  if (hasCurrentFile(nextPath)) { notify('同名文件已存在'); return }
  if (busyAction.value) return
  busyAction.value = 'file'
  try {
    const renamedSource = await renameMarkdownPath(file.path, nextPath)
    if (file.documentId) await store.renameDocument(file.documentId, nextPath, renamedSource ?? undefined)
    await refreshFileTree()
    await refreshFilesystemDirectory(fileDirectoryPath(file.path))
    notify(`已重命名为 ${name}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '重命名失败')
  } finally { busyAction.value = null }
}

async function moveFileContextEntry() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file || !canManageMarkdownEntry(file)) return
  const directory = await selectFileSystemDirectory()
  if (!directory || filePathKey(directory) === filePathKey(fileDirectoryPath(file.path))) return
  const nextPath = joinFilePath(directory, file.name)
  if (busyAction.value) return
  busyAction.value = 'file'
  try {
    const movedSource = await renameMarkdownPath(file.path, nextPath)
    if (file.documentId) await store.renameDocument(file.documentId, nextPath, movedSource ?? undefined)
    await refreshFileTree()
    await refreshFilesystemDirectory(fileDirectoryPath(file.path))
    await refreshFilesystemDirectory(directory)
    notify(`已移动到 ${directory}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '移动文件失败')
  } finally { busyAction.value = null }
}

async function duplicateFileContextEntry() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file || !canManageMarkdownEntry(file)) return
  const base = file.name.replace(/\.(md|markdown|qmd)$/i, '')
  const extension = file.name.match(/\.(md|markdown|qmd)$/i)?.[0] ?? '.md'
  const value = window.prompt('创建文件副本', `${base} - 副本${extension}`)
  if (value === null) return
  const name = markdownName(value)
  if (!validEntryName(name)) { notify('文件名不能为空，且不能包含路径分隔符'); return }
  const nextPath = joinFilePath(fileDirectoryPath(file.path), name)
  if (hasCurrentFile(nextPath)) { notify('同名文件已存在'); return }
  if (busyAction.value) return
  busyAction.value = 'file'
  try {
    await copyMarkdownPath(file.path, nextPath)
    await refreshFileTree()
    await refreshFilesystemDirectory(fileDirectoryPath(file.path))
    notify(`已创建副本 ${name}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '创建副本失败')
  } finally { busyAction.value = null }
}

async function reloadFileContextEntry() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (!file || !isMarkdownEntry(file)) return
  if (!file.documentId) {
    await openFileTreeEntry(file)
    return
  }
  if (busyAction.value) return
  busyAction.value = 'file'
  try {
    const source = await readMarkdownPath(file.path)
    const current = store.documents.find((document) => document.id === file.documentId)
    if (!current) return
    if (source === current.source) {
      notify('文件没有变化')
      return
    }
    await store.reloadDocument({ path: file.path, source })
    if (store.currentDocumentId === file.documentId) {
      await nextTick()
      restoreScroll()
    }
    notify('文件已重新载入')
  } catch (error) {
    notify(error instanceof Error ? error.message : '重新载入失败')
  } finally {
    busyAction.value = null
  }
}

async function openFileContextDirectory() {
  const file = fileContextMenu.value?.file
  if (!file) return
  fileContextMenu.value = null
  try {
    if (file.isDirectory) {
      await openFileSystemDirectory(file.path)
      notify('已打开文件夹')
    } else {
      await openMarkdownDirectory(file.path)
      notify('已打开文件所在目录')
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : '打开目录失败')
  }
}

async function deleteContextFile() {
  const file = fileContextMenu.value?.file
  fileContextMenu.value = null
  if (file) await deleteFile(file)
}

function onTabAuxClick(event: MouseEvent, documentId: string) {
  if (event.button !== 1) return
  event.preventDefault()
  void closeDocument(documentId)
}

function hasTabsToRight(documentId: string) {
  const index = store.openDocumentIds.indexOf(documentId)
  return index >= 0 && index < store.openDocumentIds.length - 1
}

async function runTabMenuAction(action: 'close' | 'close-others' | 'close-right' | 'reopen') {
  const documentId = tabContextMenu.value?.documentId
  closeTabMenus()
  if (action === 'reopen') {
    await reopenLastClosedTab()
    return
  }
  if (!documentId) return
  if (action === 'close') {
    await closeDocument(documentId)
    return
  }
  const ids = action === 'close-others'
    ? store.openDocumentIds.filter((id) => id !== documentId)
    : store.openDocumentIds.slice(store.openDocumentIds.indexOf(documentId) + 1)
  for (const id of ids) await closeDocument(id)
}

async function reopenLastClosedTab() {
  closeTabMenus()
  const documentId = recentlyClosedTabs.value.shift()
  if (!documentId || !store.documents.some((document) => document.id === documentId)) {
    notify('没有可重新打开的标签')
    return
  }
  await chooseDocument(documentId, { skipResumePrompt: true })
  notify('已重新打开上一个标签')
}

function onTabOutsideClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.reader-tab-actions, .tab-context-menu, .file-context-menu')) closeTabMenus()
  if (!target?.closest('.editor-context-menu, .editor-toolbar, .editor-surface')) closeEditorContextMenu()
}

async function boot() {
  try {
    await store.bootstrap()
    store.clearFocus()
    if (store.currentDocument) {
      view.value = 'reader'
      await nextTick()
      invalidateRegionLayout()
      syncVirtualViewport()
      observeReaderLayout()
      if (!showResumePromptIfNeeded(store.currentDocument.id)) restoreScroll()
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : '阅读空间初始化失败')
  } finally {
    booting.value = false
  }
}
onMounted(() => {
  void boot()
  void bindNativeFileDrop()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('paste', onPaste)
  window.addEventListener('beforeunload', protectUnsavedEditor)
  if (isTauriRuntime()) void getCurrentWindow().onCloseRequested(event => {
    if (editorDirty.value && !persistEditorDraft()) {
      event.preventDefault()
      notify('草稿备份失败，请保存或另存副本后关闭窗口')
    }
  }).then(stop => { if (editorAppDisposed) stop(); else stopEditorCloseGuard = stop }).catch(() => notify('关闭窗口保护未能注册，请先保存草稿再退出'))
  editorAutoSaveTimer = window.setInterval(() => {
    if (advancedSettings.value.editorAutoSave && editorOpen.value && editorDirty.value && !editorConflict.value && !tableEditor.value) void saveEditor()
  }, 60000)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('click', onTabOutsideClick)
})
onUnmounted(() => {
  editorAppDisposed = true
  stopEditorCloseGuard?.()
  persistEditorDraft()
  window.removeEventListener('beforeunload', protectUnsavedEditor)
  if (editorAutoSaveTimer !== null) window.clearInterval(editorAutoSaveTimer)
  stopOutlinePanelResize()
  stopEditorSplitResize()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('paste', onPaste)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('click', onTabOutsideClick)
  stopFocusTimer()
  stopNativeFileDrop?.()
  stopAllDocumentWatchers()
  if (searchTimer !== null) window.clearTimeout(searchTimer)
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
  if (progressTimer !== null) window.clearTimeout(progressTimer)
  regionLayoutObserver?.disconnect()
  regionMeasurementObserver?.disconnect()
  viewportResizeObserver?.disconnect()
})
watch(editorSource, () => { persistEditorDraft() }, { flush: 'sync' })
watch(editorCalmMode, value => localStorage.setItem('moyue:editor-calm', String(value)))
watch(editorFocusMode, value => localStorage.setItem('moyue:editor-focus', String(value)))
watch(editorMode, value => localStorage.setItem('moyue:editor-mode', value))
watch(tableEditorState, (value, oldValue) => {
  if (value === null || oldValue === null) {
    tableEditorHistory.value = createEditorHistory({ value: value ?? '', start: 0, end: 0 })
  } else if (!tableEditorHistoryRestoring && tableEditor.value) {
    const current = tableEditorHistory.value.entries[tableEditorHistory.value.index]
    recordEditorHistory(tableEditorHistory.value, { ...current, value: oldValue }, { value, start: tableEditor.value.row, end: tableEditor.value.column }, tableEditorHistoryGroup)
  }
  tableEditorHistoryGroup = ''
})
watch(quickOpenResults, () => { quickOpenIndex.value = 0 })
watch([editorFindQuery, editorFindOptions, editorFindScope], () => { editorFindIndex.value = -1 }, { deep: true })
watch(editorSource, () => {
  editorFindIndex.value = -1
  if (!editorFindReplacing) editorFindScope.value = undefined
}, { flush: 'sync' })
watch(query, () => {
  searchIndex.value = 0
  if (searchTimer !== null) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => { searchNeedle.value = query.value.trim(); searchTimer = null }, 90)
})
watch(advancedSettings, (settings) => {
  localStorage.setItem('moyue:advanced-settings', JSON.stringify(settings))
  if (!settings.rememberRecent) {
    localStorage.removeItem('moyue:reader-session')
    localStorage.removeItem(RECENT_FOLDERS_KEY)
    recentFolders.value = []
  }
}, { deep: true })
watch(() => advancedSettings.value.remoteImagePrivacy, () => {
  const document = store.currentDocument
  if (!document || editorOpen.value) return
  void store.reloadDocument({ path: document.path, source: document.source }).catch(() => {
    notify('远程图片设置将在下次打开文档时生效')
  })
})
watch([fileSort, fileTreeMixFolders], ([sort, mixFolders]) => {
  localStorage.setItem('moyue:file-sort', sort)
  localStorage.setItem('moyue:file-tree-mix-folders', String(mixFolders))
  if (filesystemTree.value) sortFilesystemTree(filesystemTree.value)
})
watch(() => store.mode, (mode) => { if (mode !== 'focus') stopFocusTimer() })
watch(() => store.currentDocument?.path, (path) => { fileSyncState.value = 'idle'; focusScrollTargetId = null; outlineQuery.value = ''; selectedFilePaths.value = []; invalidateRegionLayout(); void refreshFileTree(); if (path) { rememberFolder(directoryOf(path)); void syncFilesystemTreeTarget(path) } }, { immediate: true })
watch(currentDirectoryFiles, (files) => {
  const available = new Set(files.filter(isBatchDeletableFile).map((file) => filePathKey(file.path)))
  selectedFilePaths.value = selectedFilePaths.value.filter((path) => available.has(path))
})
watch(() => store.currentDocumentId, () => {
  collapsedOutlineHeadingIds.value = new Set()
  outlineExpansionOverride.value = null
  virtualMeasuredHeights.value = new Map()
  nextTick(() => {
    document.querySelector<HTMLElement>('.reader-tab[aria-selected="true"]')?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' })
    syncVirtualViewport()
    observeReaderLayout()
  })
})
watch(() => [store.mode, store.activeThemeId, store.readerSettings.fontSize, store.readerSettings.lineHeight, store.readerSettings.width], () => {
  virtualMeasuredHeights.value = new Map()
  nextTick(() => { syncVirtualViewport(); observeReaderLayout() })
})
watch(() => [virtualizedReader.value, virtualRange.value.start, virtualRange.value.end], () => { void nextTick(observeRenderedRegionSizes) })
watch(() => store.openDocuments.map((document) => document.path).join('\n'), () => { void syncDocumentWatchers() }, { immediate: true })
watch(() => [store.activeHeadingId, leftPanelTab.value, store.mode], () => {
  if (!store.activeHeadingId) return
  nextTick(() => document.querySelector<HTMLElement>(`[data-outline-id="${store.activeHeadingId}"], [data-focus-outline-id="${store.activeHeadingId}"]`)?.scrollIntoView({ behavior: 'auto', block: 'nearest' }))
})

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return
  if (tableEditor.value) {
    if (event.key === 'Escape') { event.preventDefault(); closeTableEditor() }
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()) && !event.altKey) {
      event.preventDefault()
      restoreTableEditorHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1)
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveTableEditor() }
    return
  }
  if (annotationEditor.value || viewer.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (annotationEditor.value) annotationEditor.value = null
      else closeViewer()
      selectionToolbar.value = null
      return
    }
    if (viewer.value && viewerCanPan.value && ['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault()
      if (event.key === '+' || event.key === '=') setViewerZoom(viewerZoom.value + .1)
      else if (event.key === '-') setViewerZoom(viewerZoom.value - .1)
      else resetViewerView()
    }
    return
  }
  if (editorOpen.value && !quickOpenOpen.value && !searchOpen.value) {
    if ((event.ctrlKey || event.metaKey) && ['f', 'h'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      openEditorFind()
      return
    }
    if (editorFindOpen.value && event.key === 'F3') { event.preventDefault(); navigateEditorFind(event.shiftKey ? -1 : 1); return }
    if (editorFindOpen.value && event.key === 'Escape') { event.preventDefault(); closeEditorFind(); return }
    const inEditorText = event.target instanceof HTMLElement && Boolean(event.target.closest('.cm-content')) && !event.target.closest('textarea, input, button')
    if (inEditorText && (event.ctrlKey || event.metaKey)) {
      const shortcut = event.key.toLowerCase()
      if (shortcut === 'b' || shortcut === 'i' || shortcut === 'k') {
        event.preventDefault()
        if (shortcut === 'b') wrapEditorSelection('**', '**', '粗体')
        if (shortcut === 'i') wrapEditorSelection('*', '*', '斜体')
        if (shortcut === 'k') insertEditorLink()
        return
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveEditor()
      return
    }
    if (inEditorText && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      moveEditorLine(event.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeEditorContextMenu()
      return
    }
  }
  if (quickOpenOpen.value) {
    if (event.key === 'Escape') { event.preventDefault(); quickOpenOpen.value = false; return }
    if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      event.preventDefault()
      if (event.key === 'ArrowDown') quickOpenIndex.value = Math.min(Math.max(0, quickOpenResults.value.length - 1), quickOpenIndex.value + 1)
      if (event.key === 'ArrowUp') quickOpenIndex.value = Math.max(0, quickOpenIndex.value - 1)
      if (event.key === 'Enter' && quickOpenResults.value[quickOpenIndex.value]) void chooseQuickOpenResult(quickOpenResults.value[quickOpenIndex.value])
    }
    return
  }
  if (searchOpen.value) {
    if (event.key === 'Escape') { event.preventDefault(); searchOpen.value = false; return }
    if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      event.preventDefault()
      if (event.key === 'ArrowDown') searchIndex.value = Math.min(Math.max(0, searchResults.value.length - 1), searchIndex.value + 1)
      if (event.key === 'ArrowUp') searchIndex.value = Math.max(0, searchIndex.value - 1)
      if (event.key === 'Enter' && searchResults.value[searchIndex.value]) {
        const result = searchResults.value[searchIndex.value]
        void chooseSearchResult(result.document.id, result.region.id)
      }
    }
    return
  }
  if (tabContextMenu.value || tabListOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeTabMenus()
      return
    }
  }
  if (view.value === 'reader' && !isTypingTarget(event.target) && (event.ctrlKey || event.metaKey)) {
    const isZoomIn = event.key === '+' || event.key === '=' || event.key === 'Add' || event.code === 'Equal' || event.code === 'NumpadAdd'
    const isZoomOut = event.key === '-' || event.key === '_' || event.key === 'Subtract' || event.code === 'Minus' || event.code === 'NumpadSubtract'
    if (isZoomIn || isZoomOut) {
      event.preventDefault()
      changeReaderZoom(isZoomIn ? 1 : -1)
      return
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); openQuickOpen(); return }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch('all'); return }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch('current'); return }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Tab' && view.value === 'reader') { event.preventDefault(); switchDocument(event.shiftKey ? -1 : 1); return }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w' && view.value === 'reader' && store.currentDocumentId && !isTypingTarget(event.target)) { event.preventDefault(); void closeDocument(store.currentDocumentId); return }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o' && !isTypingTarget(event.target)) { event.preventDefault(); void openFile(); return }
  if (event.key === 'Escape') {
    event.preventDefault()
    if (store.mode === 'focus' && store.focusedRegionId) clearRegionFocus()
    else if (store.mode === 'region-focus' || store.mode === 'focus') exitFocusMode()
    else if (store.mode === 'clean') toggleCleanMode()
    selectionToolbar.value = null
    return
  }
  if (view.value === 'reader' && event.key === 'Enter' && !isTypingTarget(event.target)) {
    event.preventDefault()
    const id = store.activeRegionId ?? readerRegions.value[0]?.id
    if (id) {
      if (store.mode === 'focus') store.setFocusedRegion(id)
      else store.focusRegion(id)
    }
    return
  }
  if (event.key.toLowerCase() === 'f' && !isTypingTarget(event.target)) { event.preventDefault(); toggleFocusMode(); return }
  if (view.value === 'reader' && (store.mode === 'region-focus' || store.mode === 'focus') && !isTypingTarget(event.target) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    if (event.repeat) return
    moveFocus(event.key === 'ArrowDown' ? 1 : -1)
  }
}

function moveFocus(delta: number) {
  const regions = readerRegions.value
  if (!regions.length) return
  const focusedIndex = regions.findIndex((region) => region.id === store.focusedRegionId)
  const activeIndex = regions.findIndex((region) => region.id === store.activeRegionId)
  const current = focusedIndex >= 0 ? focusedIndex : activeIndex >= 0 ? activeIndex : delta > 0 ? -1 : regions.length
  const nextIndex = Math.min(regions.length - 1, Math.max(0, current + delta))
  if (nextIndex === current) return
  const next = regions[nextIndex]
  if (store.mode === 'focus') store.setFocusedRegion(next.id)
  else store.focusRegion(next.id)
  focusScrollTargetId = next.id
  void nextTick(() => {
    if (focusScrollTargetId !== next.id) return
    const viewport = readerViewport.value
    const target = viewport ? [...viewport.querySelectorAll<HTMLElement>('[data-region-id]')].find((element) => element.dataset.regionId === next.id) : null
    if (!viewport) return
    if (!target && virtualizedReader.value) {
      const index = virtualLayout.value.regions.findIndex((region) => region.id === next.id)
      if (index >= 0) viewport.scrollTop = Math.max(0, virtualLayout.value.offsets[index] - Math.min(viewport.clientHeight * .34, 280))
      return
    }
    if (!target) return
    const viewportRect = viewport.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const probeOffset = Math.min(viewport.clientHeight * .34, 280)
    const targetCenter = viewport.scrollTop + targetRect.top - viewportRect.top + targetRect.height / 2
    const targetTop = targetCenter - probeOffset
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    viewport.scrollTop = Math.min(maxScroll, Math.max(0, targetTop))
  })
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
async function importOfficeDocument() {
  if (busyAction.value) return
  busyAction.value = 'pandoc'
  try {
    const file = await importDocumentWithPandoc(advancedSettings.value.defaultExtension)
    if (!file) return
    await store.addOpenedFiles([file])
    view.value = 'reader'
    await nextTick()
    restoreScroll()
    notify('文档已转换为 Markdown，内嵌媒体已保存在 .moyue-assets')
  } catch (error) {
    notify(error instanceof Error ? error.message : '文档转换失败')
  } finally { busyAction.value = null }
}
async function openFolder() {
  if (busyAction.value) return
  busyAction.value = 'folder'
  try {
    let count = 0
    if (isTauriRuntime()) {
      const folder = await selectMarkdownFolder()
      if (!folder) return
      count = await store.addOpenedFiles(await openMarkdownFolderAt(folder))
      rememberFolder(folder)
    } else {
      count = await store.importFolder()
    }
    if (count) { view.value = 'reader'; await nextTick(); restoreScroll(); notify(`已载入 ${count} 个 Markdown 文档`) }
  } catch (error) {
    notify(error instanceof Error ? error.message : '载入工作区失败')
  } finally { busyAction.value = null }
}
async function openSavedRecentFolder(folder: RecentFolder) {
  if (busyAction.value) return
  busyAction.value = 'folder'
  try {
    const files = await openMarkdownFolderAt(folder.path)
    if (!files.length) { notify('该文件夹没有 Markdown 文档'); return }
    const count = await store.addOpenedFiles(files)
    rememberFolder(folder.path)
    const firstDocument = files.map((file) => store.documents.find((document) => normalizedPath(document.path).toLowerCase() === normalizedPath(file.path).toLowerCase())).find(Boolean)
    if (firstDocument) await chooseDocument(firstDocument.id)
    else { view.value = 'reader'; await nextTick(); restoreScroll() }
    notify(count ? `已从 ${folderNameOf(folder.path)} 载入 ${count} 个 Markdown 文档` : '该文件夹中的文档已在阅读空间')
  } catch (error) {
    notify(error instanceof Error ? error.message : '无法重新打开该文件夹')
  } finally { busyAction.value = null }
}
function onDragEnter(event: DragEvent) { if (event.dataTransfer?.types.includes('Files')) draggingFiles.value = true }
function onDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement
  const next = event.relatedTarget as Node | null
  if (!next || !current.contains(next)) draggingFiles.value = false
}
async function importNativeDroppedPaths(paths: string[]) {
  const document = store.currentDocument
  const mediaPaths = paths.filter((path) => /\.(?:avif|bmp|gif|jiff?|jfif|jpe?g|png|svg|webp|mp4|webm|mov|m4v|ogv|ogg)$/i.test(path))
  if (editorOpen.value && advancedSettings.value.dropBehavior === 'insert' && document && isRealDocumentPath(document.path) && mediaPaths.length) {
    busyAction.value = 'drop'
    try {
      for (const path of mediaPaths) {
        const kind = /\.(?:mp4|webm|mov|m4v|ogv|ogg)$/i.test(path) ? 'video' : 'image'
        const url = await importMarkdownAssetFromPath(document.path, kind, path, kind === 'image' && advancedSettings.value.relativeImagePathPrefix)
        insertEditorMedia(kind, url)
      }
      notify(`已插入 ${mediaPaths.length} 个媒体文件`)
    } catch (error) { notify(error instanceof Error ? error.message : '插入拖放媒体失败') }
    finally { busyAction.value = null }
    return
  }
  const markdownPaths = paths.filter((path) => /\.(md|markdown|qmd)$/i.test(path))
  if (!markdownPaths.length) { notify('请拖入 .md、.markdown 或 .qmd 文件'); return }
  if (busyAction.value) return
  busyAction.value = 'drop'
  try {
    const files = await Promise.all(markdownPaths.map(async (path) => ({ path, source: await readMarkdownPath(path) })))
    const count = await store.addOpenedFiles(files)
    if (count) { view.value = 'reader'; notify(`已导入 ${count} 个 Markdown 文档`) }
  } catch (error) {
    notify(error instanceof Error ? error.message : '导入文档失败')
  } finally { busyAction.value = null }
}
async function onDrop(event: DragEvent) {
  if (isTauriRuntime()) return
  if (busyAction.value) return
  draggingFiles.value = false
  const droppedFiles = Array.from(event.dataTransfer?.files ?? [])
  const files = droppedFiles.filter((file) => /\.(md|markdown|qmd)$/i.test(file.name))
  if (!files.length) { notify('请拖入 .md、.markdown 或 .qmd 文件'); return }
  busyAction.value = 'drop'
  try {
    const assets = createBrowserAssetMap(droppedFiles)
    const count = await store.addOpenedFiles(await Promise.all(files.map(async (file) => ({ path: file.webkitRelativePath || file.name, source: await file.text(), assets }))))
    if (count) { view.value = 'reader'; notify(`已导入 ${count} 个 Markdown 文档`) }
  } catch (error) {
    notify(error instanceof Error ? error.message : '导入文档失败')
  } finally { busyAction.value = null }
}

async function bindNativeFileDrop() {
  if (!isTauriRuntime()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  stopNativeFileDrop = await getCurrentWindow().onDragDropEvent(({ payload }) => {
    if (payload.type === 'enter' || payload.type === 'over') draggingFiles.value = true
    if (payload.type === 'leave') draggingFiles.value = false
    if (payload.type === 'drop') {
      draggingFiles.value = false
      void importNativeDroppedPaths(payload.paths)
    }
  })
}

function showResumePromptIfNeeded(documentId: string) {
  const saved = store.progress[documentId]
  const percent = saved?.scrollPercent ?? 0
  if (percent > 0.02 && percent < 0.995) {
    resumePrompt.value = { documentId, percent }
    return true
  }
  resumePrompt.value = null
  return false
}
function resumeReading() {
  if (!resumePrompt.value || resumePrompt.value.documentId !== store.currentDocumentId) {
    resumePrompt.value = null
    return
  }
  resumePrompt.value = null
  restoreScroll()
}
async function startReadingOver() {
  if (!resumePrompt.value || resumePrompt.value.documentId !== store.currentDocumentId) {
    resumePrompt.value = null
    return
  }
  resumePrompt.value = null
  readerViewport.value?.scrollTo({ top: 0, behavior: 'smooth' })
  store.activeRegionId = null
  store.activeHeadingId = null
  await store.setProgress(0, null, null)
}
async function chooseDocument(id: string, options: { skipResumePrompt?: boolean } = {}) {
  const continueEditing = editorOpen.value && id !== editorDocumentId.value
  if (continueEditing) {
    if (!persistEditorDraft()) { notify(editorBackupError.value); return }
    editorOpen.value = false
  }
  const wasCurrent = store.currentDocumentId === id
  const keepFocusMode = store.mode === 'focus'
  await store.openDocument(id)
  if (keepFocusMode) store.setMode('focus')
  view.value = 'reader'
  await nextTick()
  invalidateRegionLayout()
  observeReaderLayout()
  if (options.skipResumePrompt || wasCurrent || !showResumePromptIfNeeded(id)) restoreScroll()
  if (continueEditing) await openEditor()
}
async function chooseSearchResult(documentId: string, regionId: string) {
  await chooseDocument(documentId, { skipResumePrompt: true })
  searchOpen.value = false
  leftPanelTab.value = 'outline'
  store.activeRegionId = regionId
  await nextTick()
  scrollToHeading(regionId)
}
async function chooseQuickOpenResult(file: FileTreeEntry) {
  quickOpenOpen.value = false
  await openFileTreeEntry(file)
}
async function refreshFileTree() {
  const path = store.currentDocument?.path
  const request = ++fileTreeRequest
  if (!path) { filesystemFiles.value = []; return }
  try {
    const files = await listDirectoryFiles(path)
    if (request === fileTreeRequest) filesystemFiles.value = files
  } catch {
    if (request === fileTreeRequest) filesystemFiles.value = []
  }
}
function displayTitle(title = '') { return title.replace(/\.(?:md|markdown|qmd)$/i, '') }
function filePathKey(path: string) { return normalizedPath(path).replace(/\/$/, '').toLowerCase() }
function setFileSyncState(state: FileSyncState) { if (store.currentDocument) fileSyncState.value = state }
function scheduleDocumentReload(path: string) {
  const key = filePathKey(path)
  const previous = documentReloadTimers.get(key)
  if (previous) window.clearTimeout(previous)
  documentReloadTimers.set(key, window.setTimeout(() => {
    documentReloadTimers.delete(key)
    void reloadDocumentFromDisk(path)
  }, 320))
}
async function reloadDocumentFromDisk(path: string) {
  const current = store.documents.find((document) => filePathKey(document.path) === filePathKey(path))
  if (!current) return
  const isCurrent = store.currentDocumentId === current.id
  if (isCurrent) setFileSyncState('syncing')
  try {
    const source = await readMarkdownPath(path)
    if (editorOpen.value && editorDocumentId.value === current.id) {
      editorConflict.value = hasSaveConflict(editorOriginalSource.value, source, editorSourceForSave.value)
      if (editorConflict.value) notify('磁盘文件已变更；正在编辑的草稿已保留，保存不会覆盖外部修改')
      if (isCurrent) setFileSyncState(editorConflict.value ? 'error' : 'idle')
      return
    }
    if (source === current.source) { if (isCurrent) setFileSyncState('idle'); return }
    await store.reloadDocument({ path, source })
    if (isCurrent && store.currentDocumentId === current.id) {
      await nextTick()
      restoreScroll()
      setFileSyncState('updated')
      notify('文件已自动更新，阅读位置已保留')
      window.setTimeout(() => { if (fileSyncState.value === 'updated') fileSyncState.value = 'idle' }, 2600)
    }
  } catch {
    if (isCurrent) { setFileSyncState('error'); notify('文件自动更新失败，请检查文件是否仍存在') }
  }
}
function stopAllDocumentWatchers() {
  for (const stop of documentWatchers.values()) stop()
  documentWatchers.clear()
  for (const timer of documentReloadTimers.values()) window.clearTimeout(timer)
  documentReloadTimers.clear()
}
async function syncDocumentWatchers() {
  const request = ++documentWatchRequest
  const documents = store.openDocuments.filter((document) => !['欢迎开始 · Moyue.md', '当前工作区'].includes(document.path))
  const paths = new Map(documents.map((document) => [filePathKey(document.path), document.path]))
  for (const [key, stop] of documentWatchers) {
    if (!paths.has(key)) { stop(); documentWatchers.delete(key) }
  }
  for (const [key, path] of paths) {
    if (documentWatchers.has(key)) continue
    try {
      const unwatch = await watchMarkdownPath(path, () => scheduleDocumentReload(path))
      if (!unwatch) continue
      if (request !== documentWatchRequest || !paths.has(key)) unwatch()
      else documentWatchers.set(key, unwatch)
    } catch {
      // Browser preview and documents without a local path do not support filesystem watching.
    }
  }
}
function fileStatus(file: { documentId?: string }) {
  if ('isDirectory' in file && file.isDirectory) return '文件夹'
  if (!file.documentId) return '点击打开'
  if (store.currentDocumentId === file.documentId) return '正在阅读'
  return `${store.documents.find((document) => document.id === file.documentId)?.regions.length ?? 0} 个阅读区域`
}
async function openFileTreeEntry(file: { path: string; name: string; documentId?: string }) {
  if (fileBrowserMode.value === 'tree') filesystemTreeTarget.value = file.path
  if (file.documentId) { await chooseDocument(file.documentId); return }
  if (!/\.(md|markdown|qmd)$/i.test(file.name)) { notify('当前只支持打开 Markdown / Quarto 文件'); return }
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
function isDeletableFile(file: FileTreeEntry) {
  return !file.isDirectory && Boolean(file.documentId) && file.path !== '欢迎开始 · Moyue.md'
}
function isBatchDeletableFile(file: FileTreeEntry) {
  return isDeletableFile(file)
}
function isFileSelected(file: FileTreeEntry) {
  return selectedFilePaths.value.includes(filePathKey(file.path))
}
function toggleFileSelection(file: FileTreeEntry) {
  if (!isBatchDeletableFile(file)) return
  const key = filePathKey(file.path)
  selectedFilePaths.value = isFileSelected(file)
    ? selectedFilePaths.value.filter((path) => path !== key)
    : [...selectedFilePaths.value, key]
}
function toggleAllFileSelection() {
  selectedFilePaths.value = allFilesSelected.value ? [] : batchDeletableFiles.value.map((file) => filePathKey(file.path))
}
function requestDeleteFiles(files: FileTreeEntry[]) {
  const deletableFiles = files.filter(isBatchDeletableFile)
  if (!deletableFiles.length || busyAction.value) return
  deleteConfirmation.value = { files: deletableFiles }
}
async function deleteFile(file: FileTreeEntry) {
  if (!isDeletableFile(file) || busyAction.value) return
  deleteConfirmation.value = { files: [file] }
}
async function confirmDeleteFile() {
  const confirmation = deleteConfirmation.value
  if (!confirmation || busyAction.value) return
  const files = confirmation.files
  deleteConfirmation.value = null
  busyAction.value = 'delete'
  try {
    for (const file of files) if (file.documentId) await store.removeDocument(file.documentId)
    selectedFilePaths.value = []
    await refreshFileTree()
    notify(files.length === 1 ? `已从阅读空间移除 ${files[0].name}` : `已从阅读空间移除 ${files.length} 个文件`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '删除文件失败')
  } finally { busyAction.value = null }
}
async function closeDocument(id: string) {
  if (editorOpen.value && editorDocumentId.value === id) {
    if (!persistEditorDraft()) { notify(editorBackupError.value); return }
    editorOpen.value = false
    clearEditorInlineAssets()
  }
  if (store.openDocumentIds.includes(id)) recentlyClosedTabs.value = [id, ...recentlyClosedTabs.value.filter((item) => item !== id)].slice(0, 8)
  await store.closeDocument(id)
  if (!store.currentDocument) { view.value = 'library'; return }
  await nextTick()
  if (!showResumePromptIfNeeded(store.currentDocument.id)) restoreScroll()
}
function invalidateRegionLayout() {
  regionLayoutDocumentId = null
  regionLayoutStateKey = null
  regionLayoutCache = []
}
function syncVirtualViewport() {
  const viewport = readerViewport.value
  if (!viewport) return
  virtualScrollTop.value = viewport.scrollTop
  virtualViewportHeight.value = viewport.clientHeight
}
function observeRenderedRegionSizes() {
  if (!regionMeasurementObserver) return
  const content = readerViewport.value?.querySelector<HTMLElement>('.reader-content')
  if (!content) return
  content.querySelectorAll<HTMLElement>('[data-region-id]').forEach((region) => regionMeasurementObserver?.observe(region))
}
function observeReaderLayout() {
  const content = readerViewport.value?.querySelector<HTMLElement>('.reader-content')
  regionLayoutObserver?.disconnect()
  regionMeasurementObserver?.disconnect()
  viewportResizeObserver?.disconnect()
  if (!content || typeof ResizeObserver === 'undefined') return
  regionLayoutObserver = new ResizeObserver(invalidateRegionLayout)
  regionLayoutObserver.observe(content)
  regionMeasurementObserver = new ResizeObserver((entries) => {
    const next = new Map(virtualMeasuredHeights.value)
    let changed = false
    for (const entry of entries) {
      const region = entry.target as HTMLElement
      const height = region.getBoundingClientRect().height
      const id = region.dataset.regionId
      if (!id || !height || Math.abs((next.get(id) ?? 0) - height) < 0.5) continue
      next.set(id, height)
      changed = true
    }
    if (changed) virtualMeasuredHeights.value = next
    invalidateRegionLayout()
  })
  viewportResizeObserver = new ResizeObserver(syncVirtualViewport)
  if (readerViewport.value) viewportResizeObserver.observe(readerViewport.value)
  observeRenderedRegionSizes()
}
function refreshRegionLayout(element: HTMLElement, documentId: string) {
  const viewportRect = element.getBoundingClientRect()
  regionLayoutCache = [...element.querySelectorAll<HTMLElement>('[data-region-id]')].map((region) => {
    const rect = region.getBoundingClientRect()
    const top = rect.top - viewportRect.top + element.scrollTop
    return { id: region.dataset.regionId ?? '', top, bottom: top + rect.height }
  }).filter((region) => region.id)
  regionLayoutDocumentId = documentId
  regionLayoutStateKey = `${documentId}:${store.mode}:${store.focusedRegionId ?? ''}`
}
function regionAtScrollPosition(element: HTMLElement, documentId: string) {
  if (virtualizedReader.value) {
    const layout = virtualLayout.value
    const target = element.scrollTop + Math.min(element.clientHeight * .34, 280)
    const index = findVirtualIndex(layout, target)
    return layout.regions[index]?.id ?? store.activeRegionId
  }
  const stateKey = `${documentId}:${store.mode}:${store.focusedRegionId ?? ''}`
  if (regionLayoutDocumentId !== documentId || regionLayoutStateKey !== stateKey || !regionLayoutCache.length) refreshRegionLayout(element, documentId)
  if (!regionLayoutCache.length) return store.activeRegionId
  const target = element.scrollTop + Math.min(element.clientHeight * .34, 280)
  let low = 0
  let high = regionLayoutCache.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (regionLayoutCache[middle].top <= target) low = middle
    else high = middle - 1
  }
  const containingRegion = regionLayoutCache[low]
  if (containingRegion && target >= containingRegion.top && target <= containingRegion.bottom) return containingRegion.id
  const candidates = [low - 1, low, low + 1].filter((index) => index >= 0 && index < regionLayoutCache.length)
  const bestIndex = candidates.sort((left, right) => {
    const leftRegion = regionLayoutCache[left]
    const rightRegion = regionLayoutCache[right]
    return Math.abs((leftRegion.top + leftRegion.bottom) / 2 - target) - Math.abs((rightRegion.top + rightRegion.bottom) / 2 - target)
  })[0]
  return bestIndex === undefined ? store.activeRegionId : regionLayoutCache[bestIndex].id
}
function restoreScroll() {
  const viewport = readerViewport.value
  if (!viewport) return
  const percent = currentProgress.value?.scrollPercent ?? 0
  readerScrollPercent.value = percent
  viewport.scrollTop = percent * (viewport.scrollHeight - viewport.clientHeight)
  virtualScrollTop.value = viewport.scrollTop
  virtualViewportHeight.value = viewport.clientHeight
}
function currentViewportPercent() {
  const viewport = readerViewport.value
  return viewport && viewport.scrollHeight > viewport.clientHeight ? viewport.scrollTop / (viewport.scrollHeight - viewport.clientHeight) : currentProgress.value?.scrollPercent ?? 0
}
function restoreViewportPercent(percent: number) {
  nextTick(() => {
    const viewport = readerViewport.value
    if (viewport) {
      readerScrollPercent.value = percent
      viewport.scrollTop = percent * Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      virtualScrollTop.value = viewport.scrollTop
      virtualViewportHeight.value = viewport.clientHeight
    }
  })
}
function onReaderWheel(event: WheelEvent) {
  const viewport = readerViewport.value
  const isFocusMode = store.mode === 'region-focus' || store.mode === 'focus'
  if (!viewport || event.deltaY === 0) return
  if ((event.ctrlKey || event.metaKey) && view.value === 'reader' && !editorOpen.value && !isTypingTarget(event.target)) {
    event.preventDefault()
    const now = performance.now()
    if (now - readerZoomWheelAt < 60) return
    readerZoomWheelAt = now
    changeReaderZoom(event.deltaY > 0 ? -1 : 1)
    return
  }
  if (!isFocusMode || event.ctrlKey || event.metaKey) return
  event.preventDefault()
  const now = performance.now()
  if (now - focusWheelAt < 180) return
  focusWheelAt = now
  moveFocus(event.deltaY > 0 ? 1 : -1)
}
function onReaderPointerDown() { focusScrollTargetId = null }
function onReaderScroll() {
  if (scrollFrame !== null) return
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = null
    const element = readerViewport.value
    const document = store.currentDocument
    if (!element || !document) return
    virtualScrollTop.value = element.scrollTop
    virtualViewportHeight.value = element.clientHeight
    const percent = element.scrollHeight <= element.clientHeight ? 0 : element.scrollTop / (element.scrollHeight - element.clientHeight)
    readerScrollPercent.value = percent
    const regionId = regionAtScrollPosition(element, document.id)
    const isFocusMode = store.mode === 'region-focus' || store.mode === 'focus'
    const isNavigating = isFocusMode && focusScrollTargetId !== null && regionId !== focusScrollTargetId
    const effectiveRegionId = isNavigating ? store.focusedRegionId ?? regionId : regionId
    if (!isNavigating && focusScrollTargetId === regionId) {
      focusScrollTargetId = null
    }
    store.activeRegionId = effectiveRegionId ?? store.activeRegionId
    if (!isNavigating && isFocusMode && effectiveRegionId && effectiveRegionId !== store.focusedRegionId) {
      if (store.mode === 'focus') store.setFocusedRegion(effectiveRegionId)
      else store.focusRegion(effectiveRegionId)
    }
    syncActiveHeading(effectiveRegionId)
    pendingProgress = { documentId: document.id, scrollPercent: percent, regionId: effectiveRegionId ?? null, headingId: headingIdForRegion(effectiveRegionId) }
    if (progressTimer === null) {
      progressTimer = window.setTimeout(() => {
        progressTimer = null
        const next = pendingProgress
        pendingProgress = null
        if (next && store.currentDocumentId === next.documentId) {
          void store.setProgress(next.scrollPercent, next.regionId, next.headingId)
            .then(() => { saveFailed.value = false })
            .catch(() => { saveFailed.value = true; notify('阅读位置保存失败，请检查本地存储权限') })
        }
      }, 180)
    }
  })
}

function focusRegion(region: ReaderRegion) {
  selectionToolbar.value = null
  focusScrollTargetId = null
  if (store.mode === 'focus') {
    store.setFocusedRegion(region.id)
    return
  }
  store.focusRegion(region.id)
}
function toggleFocusMode() {
  if (store.mode === 'focus') {
    exitFocusMode()
    return
  }
  const regionId = store.activeRegionId ?? readerRegions.value[0]?.id
  if (regionId) store.setFocusedRegion(regionId)
  store.setMode('focus')
  view.value = 'reader'
}
function toggleCleanMode() {
  const percent = currentViewportPercent()
  store.setMode(store.mode === 'clean' ? 'normal' : 'clean')
  view.value = 'reader'
  restoreViewportPercent(percent)
  notify(store.mode === 'clean' ? '已进入纯净阅读，按 Esc 退出' : '已恢复完整阅读界面')
}
function setViewerZoom(value: number) { viewerZoom.value = Math.min(3, Math.max(.1, Number(value.toFixed(2)))) }
function resetViewerView() { viewerZoom.value = 1; viewerPan.value = { x: 0, y: 0 } }
function openViewer(region: ReaderRegion) {
  const language = String(region.metadata?.language ?? 'text')
  const asciiDiagramCandidate = region.type === 'code' && /^(?:text|plaintext|markdown|md)$/i.test(language)
  const generatedTree = asciiDiagramCandidate ? asciiTreeToTree(region.textContent) : null
  const generatedDiagram = asciiDiagramCandidate ? asciiDiagramToMermaid(region.textContent) : null
  if (generatedTree) {
    viewer.value = {
      type: 'tree',
      region: { ...region, metadata: { ...(region.metadata ?? {}), sourceCode: region.textContent, autoTree: true } },
    }
  } else if (generatedDiagram) {
    viewer.value = {
      type: 'mermaid',
      region: { ...region, metadata: { ...(region.metadata ?? {}), code: generatedDiagram, sourceCode: region.textContent, autoDiagram: true } },
    }
  } else {
    viewer.value = { type: region.type === 'code' ? 'code' : region.type === 'image' ? 'image' : region.type === 'table' ? 'table' : 'mermaid', region }
  }
  viewerImageNaturalSize.value = { width: 0, height: 0 }
  resetViewerView(); viewerTab.value = 'preview'; viewerFullscreen.value = false
  void nextTick(() => requestAnimationFrame(fitViewer))
}
function closeViewer() { viewer.value = null; viewerDragging.value = false; viewerImageNaturalSize.value = { width: 0, height: 0 }; resetViewerView(); viewerFullscreen.value = false }
function viewerKind(type: ViewerType) {
  return type === 'mermaid' ? '图表' : type === 'tree' ? '目录树' : type === 'image' ? '图片' : type === 'code' ? '代码' : '表格'
}
function viewerTitle(type: ViewerType, region: ReaderRegion) {
  if (type === 'image') return region.textContent || '原图预览'
  if (type === 'code') return String(region.metadata?.language ?? 'text').toUpperCase()
  if (type === 'tree') return '目录树'
  if (type === 'table') return '数据表'
  return region.metadata?.autoDiagram ? '自动流程图' : 'Mermaid 图表'
}
function viewerSubtitle(type: ViewerType, region: ReaderRegion) {
  if (type === 'image') return '原始尺寸预览 · 滚轮缩放 · 拖动查看'
  if (type === 'code') return `${region.textContent.split(/\r?\n/).length} 行 · 可复制代码`
  if (type === 'tree') return '从文本树自动生成 · 支持展开与折叠'
  if (type === 'table') return '完整表格 · 支持横向滚动'
  return region.metadata?.autoDiagram ? '从文本框图自动生成 · 可缩放画布 · 支持导出' : '可缩放画布 · 支持源码与结构查看'
}
function fitViewer() {
  if (!viewerCanPan.value) return
  viewerPan.value = { x: 0, y: 0 }
  requestAnimationFrame(() => {
    const stage = viewerStage.value
    const image = stage?.querySelector<HTMLImageElement>('.image-viewer img')
    if (stage && image) {
      const stageStyle = getComputedStyle(stage)
      const paddingX = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight)
      const paddingY = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom)
      const availableWidth = Math.max(stage.clientWidth - paddingX, 160)
      const availableHeight = Math.max(stage.clientHeight - paddingY, 160)
      const naturalWidth = Math.max(image.naturalWidth || image.clientWidth, 1)
      const naturalHeight = Math.max(image.naturalHeight || image.clientHeight, 1)
      if (image.naturalWidth && image.naturalHeight) viewerImageNaturalSize.value = { width: naturalWidth, height: naturalHeight }
      setViewerZoom(Math.min(1, Math.max(.1, Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight))))
      return
    }
    const diagram = stage?.querySelector<HTMLElement>('.mermaid-block')
    if (!stage || !diagram) return
    const availableWidth = Math.max(stage.clientWidth - 80, 160)
    const availableHeight = Math.max(stage.clientHeight - 80, 160)
    const naturalWidth = Math.max(diagram.scrollWidth, 1)
    const naturalHeight = Math.max(diagram.scrollHeight, 1)
    setViewerZoom(Math.min(3, Math.max(.1, Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight))))
  })
}
function toggleViewerFullscreen() {
  viewerFullscreen.value = !viewerFullscreen.value
  void nextTick(() => requestAnimationFrame(fitViewer))
}
function mermaidSource() {
  return viewer.value?.type === 'mermaid' ? String(viewer.value.region.metadata?.sourceCode ?? viewer.value.region.metadata?.code ?? viewer.value.region.textContent) : ''
}
async function copyViewerSource() {
  const source = mermaidSource()
  if (!source) return
  try {
    await navigator.clipboard.writeText(source)
    notify('Mermaid 源码已复制')
  } catch {
    notify('复制失败，请检查剪贴板权限')
  }
}
function cleanSvgForClipboard(svg: SVGSVGElement) {
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const cleanElement = (element: Element) => {
    if (['script', 'foreignobject'].includes(element.localName.toLowerCase())) {
      element.remove()
      return
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && /^\s*javascript:/i.test(attribute.value))) element.removeAttribute(attribute.name)
    }
  }
  cleanElement(copy)
  copy.querySelectorAll('*').forEach(cleanElement)
  return copy.outerHTML
}
async function copyViewerHtml() {
  const svg = viewerStage.value?.querySelector<SVGSVGElement>('svg')
  if (!svg) {
    notify('请先等待图表渲染完成')
    return
  }
  const html = cleanSvgForClipboard(svg)
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([mermaidSource()], { type: 'text/plain' }),
      })])
    } else {
      await navigator.clipboard.writeText(html)
    }
    notify('图表 HTML 已复制')
  } catch {
    notify('复制失败，请检查剪贴板权限')
  }
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
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
function exportViewer(format: 'svg' | 'png' = 'svg') {
  if (!viewer.value) return
  const svg = viewer.value.type === 'mermaid' ? document.querySelector<SVGSVGElement>('.viewer-stage svg') : null
  const source = svg?.outerHTML ?? viewer.value.region.textContent
  if (!source) { notify('当前内容暂时没有可导出的数据'); return }
  if (format === 'png' && svg) {
    const svgText = source.includes('xmlns=') ? source : source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      const viewBox = svg.viewBox.baseVal
      const width = Math.max(1, viewBox.width || Number.parseFloat(svg.getAttribute('width') ?? '') || svg.clientWidth)
      const height = Math.max(1, viewBox.height || Number.parseFloat(svg.getAttribute('height') ?? '') || svg.clientHeight)
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(width * scale)
      canvas.height = Math.ceil(height * scale)
      const context = canvas.getContext('2d')
      if (!context) { URL.revokeObjectURL(svgUrl); notify('PNG 导出失败'); return }
      const shell = document.querySelector<HTMLElement>('.app-shell')
      context.fillStyle = getComputedStyle(shell ?? document.documentElement).getPropertyValue('--surface').trim() || '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(svgUrl)
        if (!blob) { notify('PNG 导出失败'); return }
        downloadBlob(blob, 'moyue-mermaid.png')
        notify('PNG 已导出')
      }, 'image/png')
    }
    image.onerror = () => { URL.revokeObjectURL(svgUrl); notify('PNG 导出失败') }
    image.src = svgUrl
    return
  }
  const extension = viewer.value.type === 'mermaid' ? 'svg' : 'txt'
  downloadBlob(new Blob([source], { type: extension === 'svg' ? 'image/svg+xml' : 'text/plain' }), `moyue-${viewer.value.region.type}.${extension}`)
  notify('内容已导出')
}

async function copyRegionAsImage(region: ReaderRegion) {
  const root = document.querySelector<HTMLElement>(`[data-region-id="${region.id}"]`)
  const target = root?.querySelector<HTMLElement>('svg, .math-block')
  if (!target) { notify('当前内容还没有可复制的图像'); return }
  const bounds = target.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(bounds.width))
  const height = Math.max(1, Math.ceil(bounds.height))
  const markup = target instanceof SVGElement
    ? target.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;padding:12px;background:white;color:#17211f;font-size:18px">${target.innerHTML}</div></foreignObject></svg>`
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height * 2
    const context = canvas.getContext('2d')
    if (!context) { URL.revokeObjectURL(url); notify('复制图片失败'); return }
    context.scale(2, 2)
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    canvas.toBlob(async (blob) => {
      URL.revokeObjectURL(url)
      if (!blob) { notify('复制图片失败'); return }
      try {
        await invoke('write_clipboard_snapshot', { kind: 'image', text: null, bytes: [...new Uint8Array(await blob.arrayBuffer())] })
        notify('已复制为图片')
      } catch { notify('复制图片失败，请检查剪贴板权限') }
    }, 'image/png')
  }
  image.onerror = () => { URL.revokeObjectURL(url); notify('复制图片失败') }
  image.src = url
}

async function deleteViewerDiagram() {
  const document = store.currentDocument
  const region = viewer.value?.region
  if (!document || !region || viewer.value?.type !== 'mermaid' || !window.confirm('从文档中删除这张 Mermaid 图表？')) return
  const nextSource = `${document.source.slice(0, region.sourceStart)}${document.source.slice(region.sourceEnd)}`.replace(/\n{3,}/g, '\n\n')
  try {
    if (isRealDocumentPath(document.path)) await writeMarkdownFile(document.path, nextSource, document.source)
    await store.replaceDocumentSource(document.id, nextSource)
    closeViewer()
    notify('图表已删除')
  } catch (error) { notify(error instanceof Error ? error.message : '删除图表失败') }
}
function scrollToHeading(regionId: string) {
  syncActiveHeading(regionId, true)
  const readerDocument = store.currentDocument
  const element = document.querySelector(`[data-region-id="${regionId}"]`)
  if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
  if (virtualizedReader.value) {
    const index = virtualLayout.value.regions.findIndex((region) => region.id === regionId)
    if (index >= 0) {
      readerViewport.value?.scrollTo({ top: virtualLayout.value.offsets[index], behavior: 'smooth' })
      return
    }
  }
  const first = readerDocument?.regions[0]
  if (first?.id === regionId && readerRegions.value[0]?.id !== regionId) readerViewport.value?.scrollTo({ top: 0, behavior: 'smooth' })
}
function jumpToCurrentHeading() {
  if (currentHeading.value) scrollToHeading(currentHeading.value.regionId)
  else scrollToTop()
}
function scrollToTop() {
  readerScrollPercent.value = 0
  readerViewport.value?.scrollTo({ top: 0, behavior: 'smooth' })
}
function scrollToBottom() {
  const viewport = readerViewport.value
  if (!viewport) return
  readerScrollPercent.value = 1
  viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
}
function headingRailPosition(index: number) {
  const count = store.currentDocument?.headings.length ?? 0
  return count <= 1 ? '50%' : `${(index / (count - 1)) * 100}%`
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
function exitFocusMode() {
  focusScrollTargetId = null
  store.setMode('normal')
}
function clearRegionFocus() {
  focusScrollTargetId = null
  if (store.mode === 'focus') store.clearFocusedRegion()
  else store.clearFocus()
}
function headingIdForRegion(regionId: string | null) {
  return regionId ? headingIdByRegion.value.get(regionId) ?? null : null
}
function syncActiveHeading(regionId: string | null, ensureVisible = false) {
  const headingId = headingIdForRegion(regionId)
  const changed = store.activeHeadingId !== headingId
  store.activeHeadingId = headingId
  if (!headingId || (!changed && !ensureVisible)) return
  nextTick(() => document.querySelector<HTMLElement>(`[data-outline-id="${headingId}"]`)?.scrollIntoView({ behavior: ensureVisible ? 'smooth' : 'auto', block: 'nearest' }))
}
function focusHeading(regionId: string) { scrollToHeading(regionId) }

function copyableSelectionHtml(range: Range) {
  const host = document.createElement('div')
  host.append(range.cloneContents())
  host.querySelectorAll('.inline-view-action, .region-more, .code-toolbar').forEach((element) => element.remove())
  host.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name === 'style' || attribute.name === 'class' || attribute.name === 'contenteditable' || attribute.name.startsWith('data-') || attribute.name.startsWith('on')) element.removeAttribute(attribute.name)
    }
  })
  return host.innerHTML.trim()
}

async function captureSelection(event: MouseEvent) {
  await nextTick()
  const selection = window.getSelection()
  const text = selection?.toString().trim()
  if (!text) return
  const anchor = (event.target as HTMLElement).closest('[data-region-id]') as HTMLElement | null
  if (!anchor) return
  const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null
  const range = selectedRange?.getBoundingClientRect() ?? null
  if (!range || !selectedRange) return
  selectionToolbar.value = { text, html: copyableSelectionHtml(selectedRange), regionId: anchor.dataset.regionId ?? '', rect: { top: range.top, left: range.left, width: range.width, height: range.height } }
  await nextTick()
  const toolbar = document.querySelector('.selection-toolbar') as HTMLElement | null
  if (toolbar) {
    const { computePosition, flip, offset, shift } = await import('@floating-ui/dom')
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
async function copySelectionMarkdown() {
  if (!selectionToolbar.value) return
  const markdown = selectionToolbar.value.text.split(/\r?\n/).map((line) => `> ${line}`).join('\n')
  try {
    await navigator.clipboard.writeText(markdown)
    notify('已复制 Markdown 引用')
  } catch {
    notify('当前环境不允许访问剪贴板')
  }
  selectionToolbar.value = null
}
async function copySelectionHtml() {
  if (!selectionToolbar.value) return
  const { text: plain, html } = selectionToolbar.value
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })])
    } else await navigator.clipboard.writeText(plain)
    notify('已复制 HTML（不带主题样式）')
  } catch { notify('当前环境不允许访问剪贴板') }
  selectionToolbar.value = null
}
async function copySelectionMathMl() {
  if (!selectionToolbar.value) return
  const selected = selectionToolbar.value
  const region = store.currentDocument?.regions.find((item) => item.id === selected.regionId)
  const mathml = renderMathMl(region?.type === 'math' ? region.textContent : selected.text, region?.type === 'math')
  try {
    await navigator.clipboard.writeText(mathml)
    notify('已复制 MathML')
  } catch { notify('当前环境不允许访问剪贴板') }
  selectionToolbar.value = null
}
async function copyDocumentHtml() {
  const document = store.currentDocument
  if (!document) return
  const html = await exportHtmlSource(document, false)
  const plain = document.regions.map((region) => region.textContent).filter(Boolean).join('\n\n')
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })])
      notify('已复制整篇 HTML（不带主题）')
    } else {
      await navigator.clipboard.writeText(plain)
      notify('当前环境不支持 HTML 剪贴板，已复制整篇纯文本')
    }
  } catch { notify('当前环境不允许访问剪贴板') }
}
async function copyDocumentPlain() {
  const document = store.currentDocument
  if (!document) return
  try {
    await navigator.clipboard.writeText(document.regions.map((region) => region.textContent).filter(Boolean).join('\n\n'))
    notify('已复制整篇纯文本')
  } catch { notify('当前环境不允许访问剪贴板') }
}
function searchSelection() {
  if (!selectionToolbar.value) return
  query.value = selectionToolbar.value.text
  searchNeedle.value = selectionToolbar.value.text.toLowerCase()
  selectionToolbar.value = null
  openSearch('current')
}
async function highlightSelection() {
  if (!selectionToolbar.value || !store.currentDocument) return
  const selected = selectionToolbar.value
  const existing = store.annotations.filter((annotation) => annotation.documentId === store.currentDocument?.id && annotation.regionId === selected.regionId && annotation.selectedText.trim() === selected.text.trim())
  if (existing.length) {
    for (const annotation of existing) await store.removeAnnotation(annotation)
    selectionToolbar.value = null
    notify('已取消高亮')
    return
  }
  await store.addAnnotation({ id: `highlight_${Date.now()}`, documentId: store.currentDocument.id, regionId: selected.regionId, selectedText: selected.text, color: annotationColor.value, note: '', createdAt: Date.now() })
  selectionToolbar.value = null
  notify('已高亮并保存阅读标记')
}
function selectionIsHighlighted() {
  if (!selectionToolbar.value || !store.currentDocument) return false
  return store.annotations.some((annotation) => annotation.documentId === store.currentDocument?.id && annotation.regionId === selectionToolbar.value?.regionId && annotation.selectedText.trim() === selectionToolbar.value?.text.trim())
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
function applyReaderTheme(theme: Parameters<typeof store.applyTheme>[0]) { store.applyTheme(theme, true); notify(`已切换到「${theme.manifest.name}」`) }

function changeSetting(key: 'fontSize' | 'lineHeight' | 'width', value: number) { store.updateSettings({ [key]: value }) }
function changeReaderZoom(delta: number) {
  const nextSize = Math.min(24, Math.max(15, store.readerSettings.fontSize + delta))
  if (nextSize !== store.readerSettings.fontSize) {
    changeSetting('fontSize', nextSize)
    notify(`阅读字号 ${nextSize}px`)
  }
}
async function requestFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen?.()
  } catch {
    notify('当前窗口不支持全屏操作')
  }
}
</script>

<template>
  <div class="app-shell" :aria-busy="booting || busyAction !== null" :class="{ 'is-focus': store.mode === 'focus', 'is-clean': store.mode === 'clean', 'is-editor-studio': editorOpen, 'is-region-focus': store.mode === 'region-focus', 'has-focus-region': Boolean(store.focusedRegionId), 'is-dragging': draggingFiles, 'nav-collapsed': navCollapsed, [`theme-${store.activeThemeId}`]: true }" :style="store.mode === 'focus' ? focusThemeStyles : undefined" @dragover.prevent @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
    <aside class="global-nav">
      <div class="brand-mark"><img class="brand-mark-logo" :src="logoAsset" alt="墨阅 Moyue" /></div>
      <button class="nav-collapse-toggle" type="button" :aria-label="navCollapsed ? '展开侧栏' : '收起侧栏'" :title="navCollapsed ? '展开侧栏' : '收起侧栏'" @click="toggleNavCollapsed"><AppIcon name="chevron-right" :size="15" /></button>
      <nav>
        <span class="nav-section-label">我的空间</span>
        <button class="nav-item" :class="{ active: view === 'library' && libraryTab === 'home' }" type="button" title="我的空间" aria-label="我的空间" @click="openLibrary('home')"><span class="nav-icon"><AppIcon name="home" /></span><span>我的空间</span></button>
        <button class="nav-item" :class="{ active: view === 'library' && libraryTab === 'all' }" type="button" title="全部文档" aria-label="全部文档" @click="openLibrary('all')"><span class="nav-icon"><AppIcon name="library" /></span><span>全部文档</span></button>
        <button class="nav-item" :class="{ active: view === 'reader' }" type="button" title="最近阅读" aria-label="最近阅读" @click="view = 'reader'"><span class="nav-icon"><AppIcon name="history" /></span><span>最近阅读</span></button>
        <button class="nav-item" :class="{ active: view === 'clipboard' }" type="button" title="剪贴板" aria-label="剪贴板" @click="view = 'clipboard'"><span class="nav-icon"><AppIcon name="clipboard" /></span><span>剪贴板</span></button>
        <button class="nav-item" type="button" title="收藏夹" aria-label="收藏夹" @click="notify('收藏夹将在下一阶段接入')"><span class="nav-icon"><AppIcon name="star" /></span><span>收藏夹</span></button>
        <button class="nav-item" type="button" title="AI 知识库" aria-label="AI 知识库" @click="notify('AI 知识库将在适配器完成后接入')"><span class="nav-icon"><AppIcon name="sparkle" /></span><span>AI 知识库</span></button>
        <button class="nav-item" type="button" title="个人笔记" aria-label="个人笔记" @click="notify('个人笔记将在下一阶段接入')"><span class="nav-icon"><AppIcon name="note" /></span><span>个人笔记</span></button>
        <span class="nav-section-label nav-section-gap">探索</span>
        <button class="nav-item nav-explore-item" :class="{ active: view === 'themes' }" type="button" title="主题中心" aria-label="主题中心" @click="view = 'themes'"><span class="nav-icon"><AppIcon name="palette" /></span><span>主题中心</span></button>
        <button class="nav-item nav-explore-item" type="button" title="插件中心" aria-label="插件中心" @click="notify('插件市场将在下一阶段接入')"><span class="nav-icon"><AppIcon name="plugin" /></span><span>插件中心</span></button>
      </nav>
      <div class="nav-bottom">
        <button class="nav-item" :class="{ active: view === 'settings' }" type="button" title="设置" aria-label="设置" @click="view = 'settings'"><span class="nav-icon"><AppIcon name="settings" /></span><span>设置</span></button>
        <p class="nav-motto">阅读<br />是灵魂的远行</p>
        <div class="profile-chip"><span class="profile-avatar">M</span><span><b>墨阅本地</b><small>离线工作区</small></span></div>
      </div>
    </aside>

    <main class="main-shell">
      <header class="topbar" :class="{ faded: store.mode === 'focus' }">
        <div class="crumbs"><strong>{{ view === 'reader' ? displayTitle(store.currentDocument?.title) : view === 'themes' ? '主题空间' : view === 'clipboard' ? '剪贴板' : view === 'settings' ? '偏好设置' : '我的文档' }}</strong></div>
        <button class="command-trigger" type="button" title="搜索：Ctrl/Cmd + K；快速打开：Ctrl/Cmd + P" @click="openSearch('all')"><span>搜索文档、标题、内容</span><kbd>⌘ K</kbd></button>
        <div class="top-actions">
          <IconButton icon="focus" label="专注阅读" :active="store.mode === 'focus'" @click="toggleFocusMode" />
          <IconButton icon="palette" label="切换主题" @click="view = 'themes'" />
          <IconButton icon="fullscreen" :active="fullscreenActive" :label="fullscreenActive ? '退出全屏' : '全屏'" @click="requestFullscreen" />
        </div>
      </header>

      <section v-if="view === 'library'" class="page library-page">
        <div class="library-hero reveal-1">
          <div><p class="section-kicker">本地阅读</p><h1>让想法停留得更久。</h1><p class="hero-copy">离线打开、安静阅读，所有内容都留在你的设备上。</p></div>
          <button v-if="store.currentDocument" class="hero-continue" type="button" @click="chooseDocument(store.currentDocument.id)"><span>继续阅读</span><strong>{{ displayTitle(store.currentDocument.title) }}</strong><small>{{ Math.round((currentProgress?.scrollPercent ?? 0) * 100) }}% 已读 · 约 {{ store.currentDocument.estimatedReadMinutes }} 分钟</small><AppIcon name="chevron-right" :size="16" /></button>
        </div>
        <div class="page-toolbar reveal-2"><div class="library-toolbar-heading"><div><h2>最近阅读 <span>{{ filteredLibraryDocuments.length }}<i v-if="librarySearchQuery.trim()"> / {{ store.documents.length }}</i></span></h2></div><div class="library-search"><AppIcon name="search" :size="14" /><input v-model="librarySearchQuery" type="search" placeholder="搜索已打开的 Markdown…" aria-label="按名称搜索已打开的 Markdown" /><button v-if="librarySearchQuery" type="button" aria-label="清空搜索" @click="librarySearchQuery = ''"><AppIcon name="close" :size="12" /></button></div></div><div class="toolbar-actions">
          <details class="library-more-menu"><summary class="ghost-button"><AppIcon name="copy" :size="14" />更多导入</summary><div class="library-more-popover"><button type="button" :disabled="busyAction !== null" @click="importOfficeDocument">{{ busyAction === 'pandoc' ? '转换中…' : '导入 Word / EPUB…' }}</button><button type="button" :disabled="busyAction !== null" @click="() => pasteFromClipboard()">{{ busyAction === 'paste' ? '格式化中…' : '粘贴并格式化' }}</button><button type="button" :disabled="busyAction !== null" @click="() => pasteImageFromClipboard()">{{ busyAction === 'paste-image' ? '读取中…' : '粘贴图片' }}</button><button type="button" :disabled="busyAction !== null" @click="() => pasteFromClipboard(true)">{{ busyAction === 'paste-save' ? '保存中…' : '粘贴并保存' }}</button></div></details>
          <details v-if="isTauriRuntime() && orderedRecentFolders.length" class="library-more-menu recent-folders-menu"><summary class="ghost-button"><AppIcon name="history" :size="14" />最近文件夹</summary><div class="library-more-popover recent-folders-popover"><div v-for="folder in orderedRecentFolders" :key="folder.path" class="recent-folder-row"><button class="recent-folder-open" type="button" :title="folder.path" :disabled="busyAction !== null" @click="openSavedRecentFolder(folder)"><strong>{{ folderNameOf(folder.path) }}</strong><small>{{ folder.path }}</small></button><button class="recent-folder-action" type="button" :title="folder.pinned ? '取消置顶' : '置顶文件夹'" @click="toggleRecentFolderPin(folder.path)">{{ folder.pinned ? '取消置顶' : '置顶' }}</button><button class="recent-folder-action" type="button" title="移除最近文件夹" @click="removeSavedRecentFolder(folder.path)">移除</button></div></div></details>
          <button class="ghost-button" type="button" :disabled="busyAction !== null" @click="openFolder"><AppIcon name="folder" :size="14" />{{ busyAction === 'folder' ? '扫描中…' : '打开文件夹' }}</button><button class="primary-button" type="button" :disabled="busyAction !== null" @click="openFile"><AppIcon name="plus" :size="14" />{{ busyAction === 'file' ? '打开中…' : '导入 Markdown' }}</button></div></div>
        <div class="document-grid reveal-3">
          <div v-if="librarySearchQuery.trim() && !filteredLibraryDocuments.length" class="library-empty"><AppIcon name="search" :size="20" /><strong>没有找到匹配的文档</strong><span>试试搜索其他 Markdown 名称</span></div>
          <button v-for="document in filteredLibraryDocuments" :key="document.id" class="document-card" type="button" @click="chooseDocument(document.id)"><div class="card-topline"><span class="file-badge">MD</span><span>{{ document.id === store.documents[0]?.id ? '刚刚' : '本地文档' }}</span></div><h3>{{ displayTitle(document.title) }}</h3><p>{{ document.regions.length }} 个阅读区域 · {{ document.estimatedReadMinutes }} 分钟</p><div class="card-footer"><span>{{ document.path }}</span><span class="arrow"><AppIcon name="external" :size="14" /></span></div></button>
          <button class="import-card" type="button" :disabled="busyAction !== null" @click="openFile"><span class="import-plus"><AppIcon name="plus" :size="22" /></span><span>{{ busyAction === 'file' ? '正在打开…' : '拖入 Markdown' }}<br /><small>或从本地打开</small></span></button>
          <button class="import-card" type="button" :disabled="busyAction !== null" @click="() => pasteFromClipboard()"><span class="import-plus"><AppIcon name="copy" :size="22" /></span><span>{{ busyAction === 'paste' ? '正在格式化…' : '粘贴内容' }}<br /><small>自动整理成 Markdown</small></span></button>
        </div>
        <div class="library-note reveal-4"><span class="note-line" /> <span>当前工作区完全离线运行 · 阅读位置会自动保存</span></div>
      </section>

      <section v-else-if="view === 'reader'" class="reader-page">
        <div class="reader-tabbar" aria-label="已打开文档">
          <div class="reader-tab-scroll" role="tablist" aria-label="已打开文档">
            <div v-for="document in store.openDocuments" :key="document.id" class="reader-tab" :class="{ active: store.currentDocumentId === document.id }" role="tab" :aria-selected="store.currentDocumentId === document.id" :aria-label="`打开 ${document.title}`" :title="`${document.title}\n${document.path}`" tabindex="0" @click="chooseDocument(document.id)" @contextmenu.prevent="openTabContextMenu($event, document.id)" @auxclick="onTabAuxClick($event, document.id)" @keydown.enter="chooseDocument(document.id)" @keydown.space.prevent="chooseDocument(document.id)">
              <span><AppIcon name="reader" :size="15" /></span>
              <strong>{{ tabLabel(document) }}</strong>
              <IconButton icon="close" size="sm" :label="`关闭 ${document.title}`" @click.stop="closeDocument(document.id)" />
            </div>
          </div>
          <div class="reader-tab-actions">
            <IconButton class="reader-new-tab" icon="plus" size="sm" label="打开新文档" :disabled="busyAction !== null" @click="openFile" />
            <div class="reader-tab-list-wrap">
              <IconButton class="reader-tab-list-trigger" icon="chevron-down" size="sm" :active="tabListOpen" :label="`查看全部标签（${store.openDocuments.length}）`" :aria-expanded="tabListOpen" @click.stop="toggleTabList" />
              <div v-if="tabListOpen" class="tab-list-popover" role="menu" @click.stop>
                <div class="tab-list-heading"><span>已打开文档</span><small>{{ store.openDocuments.length }}</small></div>
                <label v-if="store.openDocuments.length > 3" class="tab-list-search"><AppIcon name="search" :size="13" /><input v-model="tabSearchQuery" type="search" placeholder="搜索已打开标签…" aria-label="搜索已打开标签" /></label>
                <button v-for="document in filteredOpenDocuments" :key="document.id" class="tab-list-item" :class="{ active: store.currentDocumentId === document.id }" type="button" role="menuitem" @click="chooseDocument(document.id); closeTabMenus()">
                  <AppIcon name="reader" :size="14" />
                  <span class="tab-list-copy"><strong>{{ tabLabel(document) }}</strong><small :title="document.path">{{ document.path }}</small></span>
                  <AppIcon v-if="store.currentDocumentId === document.id" name="check" :size="13" />
                </button>
                <div v-if="!filteredOpenDocuments.length" class="tab-list-empty">没有匹配的标签</div>
                <button class="tab-reopen-button" type="button" role="menuitem" :disabled="!recentlyClosedTabs.length" @click="reopenLastClosedTab"><AppIcon name="history" :size="13" />重新打开上一个标签</button>
              </div>
            </div>
          </div>
          <div class="reader-tab-status" :class="{ 'is-error': saveFailed || fileSyncState === 'error', 'is-syncing': fileSyncState === 'syncing' }"><span><AppIcon :name="saveFailed || fileSyncState === 'error' ? 'info' : fileSyncState === 'updated' ? 'check' : 'sync'" :size="13" /></span><span>{{ store.currentDocument?.wordCount }} 字</span><span><AppIcon name="history" :size="13" /> {{ fileSyncState === 'syncing' ? '正在同步' : fileSyncState === 'updated' ? '已自动更新' : saveFailed ? '保存失败' : '自动保存' }}</span></div>
        </div>
        <Teleport to="body">
          <div v-if="tabContextMenu" class="tab-context-menu" :style="{ top: `${tabContextMenu.y}px`, left: `${tabContextMenu.x}px` }" role="menu" @click.stop>
            <div class="tab-context-title">{{ tabLabel(store.documents.find((document) => document.id === tabContextMenu?.documentId) ?? { title: '文档', path: '' }) }}</div>
            <button type="button" role="menuitem" @click="runTabMenuAction('close')">关闭标签</button>
            <button type="button" role="menuitem" :disabled="store.openDocuments.length < 2" @click="runTabMenuAction('close-others')">关闭其他标签</button>
            <button type="button" role="menuitem" :disabled="!hasTabsToRight(tabContextMenu.documentId)" @click="runTabMenuAction('close-right')">关闭右侧标签</button>
            <button type="button" role="menuitem" :disabled="!recentlyClosedTabs.length" @click="runTabMenuAction('reopen')">重新打开上一个标签</button>
          </div>
        </Teleport>
        <Teleport to="body">
          <div v-if="fileContextMenu" ref="fileContextMenuElement" class="file-context-menu" :style="{ top: `${fileContextMenu.y}px`, left: `${fileContextMenu.x}px` }" role="menu" @click.stop>
            <div class="file-context-title">{{ fileContextMenu.file.isDirectory ? '文件夹 · ' : '' }}{{ fileContextMenu.file.name }}</div>
            <template v-if="fileContextMenu.file.isDirectory">
              <button type="button" role="menuitem" @click="openFileContextEntry"><AppIcon :name="filesystemNodeExpanded(fileContextMenu.file.path) ? 'chevron-down' : 'chevron-right'" :size="13" />{{ filesystemNodeExpanded(fileContextMenu.file.path) ? '收起文件夹' : '展开文件夹' }}</button>
            </template>
            <template v-else>
              <button type="button" role="menuitem" :disabled="!isMarkdownEntry(fileContextMenu.file)" :title="isMarkdownEntry(fileContextMenu.file) ? undefined : '当前只支持打开 Markdown 文件'" @click="openFileContextEntry"><AppIcon name="reader" :size="13" />打开文件</button>
              <button type="button" role="menuitem" :disabled="!isMarkdownEntry(fileContextMenu.file)" :title="isMarkdownEntry(fileContextMenu.file) ? undefined : '当前只支持打开 Markdown 文件'" @click="openFileContextNewTab"><AppIcon name="external" :size="13" />{{ fileContextMenu.file.documentId && store.openDocumentIds.includes(fileContextMenu.file.documentId) ? '转到已打开标签' : '在新标签中打开' }}</button>
              <button v-if="fileContextMenu.file.documentId && isMarkdownEntry(fileContextMenu.file)" type="button" role="menuitem" @click="reloadFileContextEntry"><AppIcon name="sync" :size="13" />重新载入</button>
            </template>
            <div class="file-context-divider" />
            <button type="button" role="menuitem" :disabled="!canCreateInContext(fileContextMenu.file)" :title="canCreateInContext(fileContextMenu.file) ? undefined : '请在桌面端的真实文件夹中使用'" @click="createFileContextFile"><AppIcon name="plus" :size="13" />新建文件</button>
            <button type="button" role="menuitem" :disabled="!canCreateInContext(fileContextMenu.file)" :title="canCreateInContext(fileContextMenu.file) ? undefined : '请在桌面端的真实文件夹中使用'" @click="createFileContextFolder"><AppIcon name="folder" :size="13" />新建文件夹</button>
            <button v-if="isMarkdownEntry(fileContextMenu.file)" type="button" role="menuitem" @click="searchFileContextEntry"><AppIcon name="search" :size="13" />搜索</button>
            <div class="file-context-divider" />
            <button type="button" role="menuitem" @click="showDocumentList"><AppIcon name="file" :size="13" />文档列表</button>
            <button type="button" role="menuitem" @click="showDocumentTreeForEntry(fileContextMenu.file)"><AppIcon name="library" :size="13" />文档树</button>
            <div class="file-context-divider" />
            <button v-if="canManageMarkdownEntry(fileContextMenu.file)" type="button" role="menuitem" @click="renameFileContextEntry"><AppIcon name="edit" :size="13" />重命名</button>
            <button v-if="canManageMarkdownEntry(fileContextMenu.file)" type="button" role="menuitem" @click="moveFileContextEntry"><AppIcon name="folder" :size="13" />移动到目录</button>
            <button v-if="canManageMarkdownEntry(fileContextMenu.file)" type="button" role="menuitem" @click="duplicateFileContextEntry"><AppIcon name="copy" :size="13" />创建副本</button>
            <button v-if="isTauriRuntime() && hasRealFilesystemPath(fileContextMenu.file.path)" type="button" role="menuitem" @click="openFileContextDirectory"><AppIcon name="folder" :size="13" />{{ fileContextMenu.file.isDirectory ? '打开文件夹' : '打开所在目录' }}</button>
            <button type="button" role="menuitem" @click="copyFileContextValue('name')"><AppIcon name="copy" :size="13" />复制名称</button>
            <button type="button" role="menuitem" @click="copyFileContextValue('file')"><AppIcon name="copy" :size="13" />复制路径</button>
            <button type="button" role="menuitem" :disabled="!hasRealFilesystemPath(contextDirectoryPath(fileContextMenu.file))" title="只对真实系统目录提供目录路径" @click="copyFileContextValue('directory')"><AppIcon name="copy" :size="13" />复制目录路径</button>
            <button type="button" role="menuitem" @click="showFileProperties"><AppIcon name="info" :size="13" />属性</button>
            <button v-if="isDeletableFile(fileContextMenu.file)" type="button" role="menuitem" class="file-context-danger" @click="deleteContextFile"><AppIcon name="trash" :size="13" />从阅读空间移除</button>
          </div>
        </Teleport>
        <Teleport to="body">
          <div v-if="fileProperties" class="overlay file-properties-overlay" @click.self="fileProperties = null">
            <div class="file-properties-dialog" role="dialog" aria-modal="true" aria-label="文件属性">
              <div class="file-properties-heading"><div><span class="section-kicker">文件信息</span><h2>{{ fileProperties.name }}</h2></div><IconButton icon="close" size="sm" label="关闭文件属性" @click="fileProperties = null" /></div>
              <dl class="file-properties-list"><div><dt>位置</dt><dd>{{ fileProperties.path }}</dd></div><div><dt>类型</dt><dd>{{ fileProperties.isDirectory ? '文件夹' : 'Markdown 文档' }}</dd></div><div><dt>状态</dt><dd>{{ fileStatus(fileProperties) }}</dd></div><div><dt>当前目录</dt><dd>{{ contextDirectoryPath(fileProperties) || '当前工作区' }}</dd></div></dl>
              <div class="file-properties-actions"><button class="ghost-button" type="button" @click="fileProperties = null">关闭</button><button class="primary-button" type="button" @click="copyFilePropertiesPath"><AppIcon name="copy" :size="13" />复制文件路径</button></div>
            </div>
          </div>
        </Teleport>
        <Teleport to="body">
          <div v-if="deleteConfirmation" class="overlay file-delete-overlay" @click.self="deleteConfirmation = null">
            <div class="file-properties-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-file-title">
              <div class="file-properties-heading"><div><span class="section-kicker">移除文件</span><h2 id="delete-file-title">从阅读空间移除？</h2></div><IconButton icon="close" size="sm" label="取消移除" @click="deleteConfirmation = null" /></div>
              <p v-if="deleteConfirmation.files.length === 1" class="file-delete-message">确定从 Moyue 阅读空间移除“{{ deleteConfirmation.files[0].name }}”？不会删除本地文件。</p>
              <p v-else class="file-delete-message">确定从 Moyue 阅读空间移除 {{ deleteConfirmationSummary }}？不会删除本地文件。</p>
              <div class="file-properties-actions"><button class="ghost-button" type="button" @click="deleteConfirmation = null">取消</button><button class="primary-button file-delete-confirm" type="button" @click="confirmDeleteFile">确认移除</button></div>
            </div>
          </div>
        </Teleport>
        <div class="reader-layout" :class="{ 'focus-layout': store.mode === 'focus', 'clean-layout': store.mode === 'clean', 'split-layout': readerDisplayMode === 'split', 'context-open': contextPanelOpen, 'is-resizing-outline': outlinePanelResizing }" :style="{ '--outline-panel-width': `${outlinePanelWidth}px` }">
          <aside v-if="store.mode !== 'focus' && store.mode !== 'clean'" class="outline-panel">
            <div class="outline-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整文档侧栏宽度" :aria-valuemin="outlinePanelMinWidth" :aria-valuemax="outlinePanelMaxWidth" :aria-valuenow="outlinePanelWidth" title="拖动调整侧栏宽度" @pointerdown="startOutlinePanelResize" @keydown="onOutlinePanelResizeKeydown" />
            <div class="panel-heading panel-switcher">
              <div class="panel-tabs" role="tablist" aria-label="阅读侧栏">
            <button type="button" :class="{ active: leftPanelTab === 'files' }" @click="leftPanelTab = 'files'">文件 <span>{{ currentDirectoryFiles.length }}</span></button>
                <button type="button" :class="{ active: leftPanelTab === 'outline' }" @click="leftPanelTab = 'outline'">大纲</button>
              </div>
              <button class="text-button" type="button" @click="toggleCleanMode">收起</button>
            </div>
            <div v-if="leftPanelTab === 'files'" class="file-browser-panel">
              <div class="file-location" :title="fileBrowserMode === 'tree' ? filesystemTree?.path : currentDirectory"><AppIcon :name="fileBrowserMode === 'tree' ? 'library' : 'folder'" :size="13" /><span>{{ fileBrowserMode === 'tree' ? filesystemTreeScope === 'system' ? '文档树' : '工作区文档树' : currentDirectoryLabel }}</span><small>{{ fileBrowserMode === 'tree' ? filesystemTreeScope === 'system' ? '当前目录' : '已授权文件' : '所在目录' }}</small><button v-if="fileBrowserMode === 'tree'" type="button" class="file-tree-back" aria-label="返回当前目录文件列表" @click="showDocumentList">返回</button></div>
              <div class="file-filter-toolbar" aria-label="文件侧栏筛选">
                <select v-model="sidebarFilter" aria-label="文件筛选方式"><option value="markdown">Markdown 文件</option><option value="hidden">包含隐藏文件</option><option value="all">全部文件</option><option value="glob">自定义 glob</option></select>
                <input v-if="sidebarFilter === 'glob'" v-model="sidebarGlob" aria-label="自定义 glob" placeholder="例如 *.md" />
                <select v-model="fileSort" aria-label="文件排序方式"><option value="name">名称</option><option value="natural">自然顺序</option><option value="created">创建时间</option><option value="modified">修改时间</option><option value="size">文件大小</option></select>
                <label v-if="fileBrowserMode === 'tree'" class="file-tree-mix"><input v-model="fileTreeMixFolders" type="checkbox" />混排</label>
              </div>
              <div v-if="fileBrowserMode === 'tree'" class="filesystem-tree-panel">
                <div v-if="filesystemTree" class="filesystem-tree" :aria-label="filesystemTreeScope === 'system' ? '当前目录文档树' : '工作区文档树'"><FileSystemTree :node="filesystemTree" :selected-path="filesystemTreeTarget" @toggle="toggleFilesystemNode" @open="openFilesystemTreeNode" @contextmenu="openFilesystemContextMenu" /></div>
                <p v-else class="file-browser-note"><AppIcon name="info" :size="13" />右键文件选择“文档树”以打开文件层级</p>
              </div>
              <div v-else class="file-list-shell">
                <div v-if="batchDeletableFiles.length" class="file-list-toolbar">
                  <label class="file-select-all"><input type="checkbox" :checked="allFilesSelected" :indeterminate="selectedFiles.length > 0 && !allFilesSelected" aria-label="全选可移除文档" @change="toggleAllFileSelection" /><span>全选</span></label>
                  <div class="file-list-actions"><span v-if="selectedFiles.length" class="file-selection-count" aria-live="polite">已选 {{ selectedFiles.length }}</span><button v-if="selectedFiles.length" type="button" class="file-batch-delete" :disabled="busyAction !== null" @click="requestDeleteFiles(selectedFiles)"><AppIcon name="trash" :size="12" />删除</button></div>
                </div>
                <nav class="file-list" :aria-label="sidebarFilter === 'markdown' ? '当前文件夹中的 Markdown 文件' : '当前文件夹中的文件'">
                  <div v-for="file in currentDirectoryFiles" :key="file.path" class="file-item" :class="{ active: store.currentDocumentId === file.documentId, selected: isFileSelected(file), 'is-unloaded': !file.documentId }">
                    <label v-if="batchDeletableFiles.length && isBatchDeletableFile(file)" class="file-select" :aria-label="`选择 ${file.name}`"><input type="checkbox" :checked="isFileSelected(file)" @click.stop @change="toggleFileSelection(file)" /></label><span v-else-if="batchDeletableFiles.length" class="file-select-spacer" aria-hidden="true" />
                    <button type="button" class="file-item-open" :aria-label="file.documentId ? `打开 ${file.name}` : `载入 ${file.name}`" :title="file.name" @click="openFileTreeEntry(file)" @contextmenu.prevent="openFileContextMenu($event, file)"><AppIcon name="file" :size="14" /><span class="file-item-copy"><strong>{{ file.name }}</strong><small>{{ fileStatus(file) }}</small></span><i v-if="store.currentDocumentId === file.documentId" class="file-active-mark" /></button><IconButton v-if="isDeletableFile(file)" class="file-delete" icon="trash" size="sm" :label="`删除 ${file.name}`" :disabled="busyAction !== null" @click="deleteFile(file)" />
                  </div>
                </nav>
              </div>
            </div>
            <div v-else class="outline-view">
              <label class="outline-search"><AppIcon name="search" :size="13" /><input v-model="outlineQuery" type="search" placeholder="筛选章节…" aria-label="筛选章节" /><button v-if="outlineQuery" type="button" aria-label="清除章节筛选" @click="outlineQuery = ''"><AppIcon name="close" :size="11" /></button></label>
              <div v-if="store.currentDocument?.headings.length" class="outline-actions" aria-label="大纲展开控制">
                <div class="outline-action-group">
                  <button type="button" title="展开全部章节" @click="setOutlineExpansion(true)"><AppIcon name="chevron-down" :size="11" />全部展开</button>
                  <button type="button" title="折叠全部章节" @click="setOutlineExpansion(false)"><AppIcon name="chevron-right" :size="11" />全部折叠</button>
                </div>
              </div>
              <nav class="outline-list" aria-label="当前文档大纲">
                <div v-for="row in outlineRows" :key="row.heading.id" class="outline-row" :class="[`outline-depth-${Math.min(row.heading.depth, 3)}`, { active: store.activeHeadingId === row.heading.id }]" :style="{ paddingLeft: `${6 + (row.heading.depth - 1) * 14}px` }">
                  <button v-if="row.hasChildren" class="outline-toggle" type="button" :aria-expanded="!row.collapsed" :aria-label="`${row.collapsed ? '展开' : '折叠'} ${row.heading.text}`" @click="toggleOutlineHeading(row.heading.id)"><AppIcon :name="row.collapsed ? 'chevron-right' : 'chevron-down'" :size="12" /></button>
                  <span v-else class="outline-toggle-spacer" aria-hidden="true" />
                  <button class="outline-heading-button" :data-outline-id="row.heading.id" type="button" :class="{ active: store.activeHeadingId === row.heading.id }" :aria-current="store.activeHeadingId === row.heading.id ? 'location' : undefined" @click="scrollToHeading(row.heading.regionId)">{{ row.heading.text }}</button>
                </div>
                <p v-if="!outlineRows.length" class="outline-empty">没有匹配的章节</p>
              </nav>
            </div>
          </aside>
          <div class="reader-column">
            <div class="reader-meta">
              <div class="reader-meta-document">
                <span class="section-kicker reader-path" :title="store.currentDocument?.path"><AppIcon name="file" :size="13" /><span class="reader-path-value">{{ displayTitle(store.currentDocument?.title) }}</span></span>
                <span class="reader-stat">{{ (editorOpen ? editorPreviewDocument : store.currentDocument)?.wordCount ?? 0 }} 字 · 约 {{ (editorOpen ? editorPreviewDocument : store.currentDocument)?.estimatedReadMinutes ?? 0 }} 分钟</span>
              </div>
              <div v-if="!editorOpen" class="reader-meta-tools">
                <div class="reader-edit-actions">
                  <button type="button" :class="{ active: editorOpen }" @click="editorOpen ? closeEditor() : openEditor()">{{ editorOpen ? '阅读' : '编辑' }}</button>
                  <details class="reader-more-menu">
                    <summary>更多</summary>
                    <div class="reader-more-popover">
                      <FontPicker compact label="正文字体" :model-value="store.readerSettings.fontFamily" :fallback-family="store.activeTheme.tokens.reader.fontFamily" @update:model-value="store.updateSettings({ fontFamily: $event })" />
                      <button type="button" @click="toggleCleanMode">纯净阅读</button>
                      <button type="button" :class="{ active: contextPanelOpen }" @click="contextPanelOpen = !contextPanelOpen">{{ contextPanelOpen ? '收起阅读信息' : '查看阅读信息' }}</button>
                      <button type="button" @click="wordCountOpen = true">字数统计</button>
                      <button type="button" @click="exportDocument('markdown')">导出 Markdown</button>
                      <button type="button" @click="exportDocument('html')">导出 HTML</button>
                      <button type="button" @click="exportDocument('html-clean')">导出无样式 HTML</button>
                      <button type="button" @click="copyDocumentHtml">复制整篇 HTML</button>
                      <button type="button" @click="copyDocumentPlain">复制整篇纯文本</button>
                      <button type="button" @click="exportDocument('image')">导出 PNG 长图</button>
                      <button type="button" @click="exportDocument('docx')">导出 DOCX</button>
                      <button type="button" @click="exportDocument('epub')">导出 EPUB</button>
                      <button type="button" @click="exportDocument('latex')">导出 LaTeX</button>
                      <button type="button" @click="exportDocument('odt')">导出 ODT</button>
                      <button type="button" @click="exportDocument('rtf')">导出 RTF</button>
                      <button type="button" @click="exportDocument('mediawiki')">导出 MediaWiki</button>
                      <button type="button" @click="exportPdfDocument()">导出 PDF</button>
                      <button type="button" @click="printDocument">打印</button>
                    </div>
                  </details>
                </div>
                <div class="reader-display-switch" role="tablist" aria-label="阅读视图">
                  <button type="button" role="tab" :aria-selected="readerDisplayMode === 'markdown'" :class="{ active: readerDisplayMode === 'markdown' }" @click="readerDisplayMode = 'markdown'">Markdown</button>
                  <button type="button" role="tab" :aria-selected="readerDisplayMode === 'mindmap'" :class="{ active: readerDisplayMode === 'mindmap' }" @click="readerDisplayMode = 'mindmap'">思维导图</button>
                  <button type="button" role="tab" :aria-selected="readerDisplayMode === 'split'" :class="{ active: readerDisplayMode === 'split' }" @click="readerDisplayMode = 'split'; leftPanelTab = 'outline'">并排</button>
                </div>
                <div class="reader-navigation" aria-label="阅读位置与跳转">
                  <span class="reader-progress-label" aria-live="polite">阅读到 {{ Math.round(readerScrollPercent * 100) }}%</span>
                  <button v-if="store.mode === 'clean' && currentHeading" type="button" @click="jumpToCurrentHeading">本章开头</button>
                  <button type="button" :disabled="readerAtTop" @click="scrollToTop">回到顶部</button>
                  <button type="button" :disabled="readerAtBottom" @click="scrollToBottom">到文末</button>
                </div>
              </div>
              <div v-else class="reader-editing-meta">
                <span class="section-kicker">写作模式</span>
                <strong>编辑中</strong>
                <span>{{ editorDirty ? '未保存更改' : '已保存' }}</span>
                <button type="button" @click="closeEditor">退出编辑</button>
              </div>
            </div>
            <div ref="readerViewport" class="reader-viewport" @scroll="onReaderScroll" @wheel="onReaderWheel" @pointerdown="onReaderPointerDown" @mouseup="captureSelection">
              <div v-if="exportError || exporting" class="editor-safety-notice" :role="exportError ? 'alert' : 'status'"><span>{{ exportError || '正在生成完整导出文件…' }}</span><button v-if="exportError" type="button" @click="exportError = ''">关闭</button></div>
              <div v-if="editorOpen" class="editor-surface" :class="{ 'editor-calm-mode': editorCalmMode, 'editor-typewriter-mode': advancedSettings.typewriterMode }" @contextmenu="openEditorContextMenu">
                <div v-if="editorBackupError || editorConflict" class="editor-safety-notice" role="alert"><span>{{ editorBackupError || '原文件有外部修改：草稿已保留，不会直接覆盖' }}</span><button type="button" @click="saveEditorCopy">另存草稿副本</button></div>
                <div v-if="!editorCalmMode" class="editor-toolbar" aria-label="Markdown 编辑工具栏">
                  <div class="editor-toolbar-group" aria-label="文字格式">
                    <button class="editor-tool-button" type="button" title="查找替换草稿（Ctrl/Cmd+F / Ctrl+H）" @click="openEditorFind">查找</button>
                    <button class="editor-tool-button" type="button" title="撤销（Ctrl/Cmd+Z）" :disabled="!editorUndoAvailable" @click="restoreEditorHistory(-1)">撤销</button>
                    <button class="editor-tool-button" type="button" title="重做（Ctrl/Cmd+Shift+Z / Ctrl+Y）" :disabled="!editorRedoAvailable" @click="restoreEditorHistory(1)">重做</button>
                    <button class="editor-tool-button" type="button" title="粗体（Ctrl/Cmd+B）" @click="wrapEditorSelection('**', '**', '粗体')"><b>B</b></button>
                    <button class="editor-tool-button" type="button" title="斜体（Ctrl/Cmd+I）" @click="wrapEditorSelection('*', '*', '斜体')"><i>I</i></button>
                    <button class="editor-tool-button" type="button" title="删除线 ~~文字~~" @click="wrapEditorSelection('~~', '~~', '删除线')"><s>S</s></button>
                    <button class="editor-tool-button" type="button" title="行内代码" @click="wrapEditorSelection('`', '`', '代码')">行内码</button>
                    <button class="editor-tool-button" type="button" title="高亮 ==文字==" @click="wrapEditorSelection('==', '==', '高亮')">高亮</button>
                    <button class="editor-tool-button" type="button" title="下标 ~文字~" @click="wrapEditorSelection('~', '~', '下标')">X₂</button>
                    <button class="editor-tool-button" type="button" title="上标 ^文字^" @click="wrapEditorSelection('^', '^', '上标')">X²</button>
                    <button class="editor-tool-button" type="button" title="链接（Ctrl/Cmd+K）" @click="insertEditorLink">链接</button>
                  </div>
                  <div class="editor-toolbar-group" aria-label="块格式">
                    <button class="editor-tool-button" type="button" title="一级标题" @click="prefixEditorLines('# ')">H1</button>
                    <button class="editor-tool-button" type="button" title="引用" @click="prefixEditorLines('> ')">引用</button>
                    <button class="editor-tool-button" type="button" title="无序列表" @click="prefixEditorLines('- ')">列表</button>
                    <button class="editor-tool-button" type="button" title="任务列表" @click="prefixEditorLines('- [ ] ')">任务</button>
                    <input v-model="editorCodeLanguage" class="editor-language-input" list="editor-code-languages" aria-label="代码语言" placeholder="语言" />
                    <datalist id="editor-code-languages"><option v-for="language in ['text', 'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'sql', 'bash', 'json', 'yaml', 'mermaid', 'gas', 'url']" :key="language" :value="language" /></datalist>
                    <button class="editor-tool-button" type="button" title="插入带语言的代码块" @click="insertEditorCodeBlock">代码</button>
                    <button class="editor-tool-button" type="button" title="将当前段落或选中行切换为 GitHub Alert" @click="toggleEditorAlert('NOTE')">警告框</button>
                    <button class="editor-tool-button" type="button" title="插入自动目录 [toc]" @click="insertEditorToc">目录</button>
                    <button class="editor-tool-button" type="button" title="表格" @click="insertEditorTable">表格</button>
                    <button class="editor-tool-button" type="button" :disabled="editorMode === 'preview'" title="原地表格可直接编辑，也可打开详细编辑工具" @click="openDraftTableEditor">编辑表格</button>
                    <button class="editor-tool-button" type="button" title="图片" @click="insertEditorImage">图片</button>
                    <button class="editor-tool-button" type="button" title="通过 PicList 上传图片" @click="uploadEditorImage">上传</button>
                    <button class="editor-tool-button" type="button" title="导入视频" @click="insertEditorVideo">视频</button>
                    <button class="editor-tool-button" type="button" title="移动本地图片和视频到 .moyue-assets" @click="organizeEditorMedia">整理媒体</button>
                    <button class="editor-tool-button" type="button" title="图片管理" @click="imageManagerOpen = true">图片管理</button>
                    <button v-if="lastMediaAction" class="editor-tool-button" type="button" title="撤销上一次图片操作" @click="undoLastMediaAction">撤销图片</button>
                    <button class="editor-tool-button" type="button" title="分隔线" @click="insertEditorDivider">分隔线</button>
                  </div>
                  <div class="editor-toolbar-group" aria-label="段落移动">
                    <button class="editor-tool-button icon-only" type="button" title="上移当前段落（Alt+↑）" aria-label="上移当前段落" @click="moveEditorLine(-1)"><AppIcon name="arrow-up" :size="14" /></button>
                    <button class="editor-tool-button icon-only" type="button" title="下移当前段落（Alt+↓）" aria-label="下移当前段落" @click="moveEditorLine(1)"><AppIcon name="arrow-down" :size="14" /></button>
                  </div>
                  <span class="editor-toolbar-spacer" />
                  <div class="editor-toolbar-actions">
                    <div class="editor-mode-switch" role="tablist" aria-label="编辑模式">
                      <button type="button" role="tab" :aria-selected="editorMode === 'write'" :class="{ active: editorMode === 'write' }" @click="setEditorMode('write')">写作</button>
                      <button type="button" role="tab" :aria-selected="editorMode === 'split'" :class="{ active: editorMode === 'split' }" @click="setEditorMode('split')">并排</button>
                      <button type="button" role="tab" :aria-selected="editorMode === 'rich'" :class="{ active: editorMode === 'rich' }" @click="setEditorMode('rich')">所见即所得</button>
                      <button type="button" role="tab" :aria-selected="editorMode === 'preview'" :class="{ active: editorMode === 'preview' }" @click="setEditorMode('preview')">预览</button>
                    </div>
                    <button class="editor-calm-toggle" type="button" :class="{ active: editorCalmMode }" :aria-pressed="editorCalmMode" @click="toggleEditorCalmMode">静写</button>
                    <button class="editor-calm-toggle" type="button" :aria-pressed="editorFocusMode" @click="editorFocusMode = !editorFocusMode">专注</button>
                    <EditorExportMenu :disabled="exporting" @export="exportDocument" @pdf="exportPdfDocument" />
                    <button class="editor-calm-toggle" type="button" :class="{ active: advancedSettings.typewriterMode }" :aria-pressed="advancedSettings.typewriterMode" @click="toggleTypewriterMode">打字机</button>
                    <kbd>⌘/Ctrl + S</kbd>
                    <button class="primary-button editor-save-button" type="button" :disabled="!editorDirty || editorSaving" @click="saveEditor">{{ editorSaving ? '保存中…' : '保存' }}</button>
                  </div>
                </div>
                <div v-if="editorCalmMode" class="editor-quiet-controls"><span>墨写</span><button type="button" @click="openEditorFind">查找</button><button type="button" @click="editorFocusMode = !editorFocusMode" :aria-pressed="editorFocusMode">专注</button><button type="button" @click="toggleTypewriterMode" :aria-pressed="advancedSettings.typewriterMode">打字机</button><button type="button" @click="setEditorMode(editorMode === 'rich' ? 'write' : 'rich')">{{ editorMode === 'rich' ? '源码' : '墨写' }}</button><button type="button" @click="toggleEditorCalmMode">工具</button><EditorExportMenu :disabled="exporting" @export="exportDocument" @pdf="exportPdfDocument" /><button type="button" :disabled="!editorDirty || editorSaving" @click="saveEditor">保存</button></div>
                <section v-if="editorFindOpen" class="editor-find-panel" aria-label="草稿查找替换" @keydown.esc.prevent.stop="closeEditorFind">
                  <div class="editor-find-row">
                    <input ref="editorFindInput" v-model="editorFindQuery" aria-label="查找草稿内容" placeholder="查找当前草稿…" :aria-invalid="!!editorFindResult.error" @keydown.enter.prevent="navigateEditorFind($event.shiftKey ? -1 : 1)" />
                    <span aria-live="polite">{{ editorFindIndex < 0 ? 0 : editorFindIndex + 1 }} / {{ editorFindResult.matches.length }}</span>
                    <button class="editor-tool-button" type="button" :disabled="!editorFindResult.matches.length" title="上一个（Shift+F3）" @click="navigateEditorFind(-1)">上一个</button>
                    <button class="editor-tool-button" type="button" :disabled="!editorFindResult.matches.length" title="下一个（F3）" @click="navigateEditorFind(1)">下一个</button>
                    <button class="editor-tool-button" type="button" aria-label="关闭草稿查找" @click="closeEditorFind">关闭</button>
                  </div>
                  <div class="editor-find-row">
                    <input v-model="editorFindReplacement" aria-label="草稿替换内容" placeholder="替换为…（留空则删除匹配）" @keydown.enter.prevent="replaceEditorFind(false)" />
                    <button class="editor-tool-button" type="button" :disabled="!editorFindResult.matches.length" @click="replaceEditorFind(false)">替换一处</button>
                    <button class="editor-tool-button" type="button" :disabled="!editorFindResult.matches.length" @click="replaceEditorFind(true)">全部替换</button>
                  </div>
                  <div class="editor-find-options">
                    <label><input v-model="editorFindOptions.caseSensitive" type="checkbox" />区分大小写</label>
                    <label><input v-model="editorFindOptions.wholeWord" type="checkbox" />整词</label>
                    <label><input v-model="editorFindOptions.regex" type="checkbox" />正则</label>
                    <button class="editor-tool-button" type="button" :aria-pressed="!!editorFindScope" @click="toggleEditorFindScope">{{ editorFindScope ? '取消选区范围' : '仅在选区查找' }}</button>
                    <small>只修改草稿，不写入文件</small>
                  </div>
                  <p v-if="editorFindResult.error" role="alert" class="search-error">{{ editorFindResult.error }}</p>
                </section>
                <div class="editor-workspace" :class="[`editor-mode-${editorMode}`, { 'is-resizing-split': editorSplitResizing }]" :style="editorMode === 'split' ? { '--editor-split-ratio': `${editorSplitRatio}%` } : undefined">
                  <section v-show="editorMode !== 'preview'" class="editor-main-pane" :class="editorMode === 'rich' ? 'editor-rich-pane' : 'editor-source-pane'">
                    <MarkdownEditor ref="editorTextarea" v-model="editorSource" :live="editorMode === 'rich'" :spellcheck="advancedSettings.spellcheck" :typewriter="advancedSettings.typewriterMode" :focus-mode="editorFocusMode" :resolve-url="url => resolveMarkdownAssetUrl(editorDocumentPath, url, editorInlineAssets)" @keydown="onEditorKeydown" @paste="onEditorPaste" @copy="onEditorLineClipboard($event, false)" @cut="onEditorLineClipboard($event, true)" @caret="updateEditorCursor" @history="editorUndoAvailable = $event.undo; editorRedoAvailable = $event.redo" @message="notify" @link="openExternalLink" />
                    <div v-if="editorEmojiSuggestions.length" class="editor-emoji-menu" role="listbox" aria-label="Emoji 建议"><button v-for="emoji in editorEmojiSuggestions" :key="emoji.code" type="button" @click="insertEditorEmoji(emoji.value)"><span>{{ emoji.value }}</span>:{{ emoji.code }}:</button></div>
                  </section>
                  <div v-if="editorMode === 'split'" class="editor-split-divider" role="separator" tabindex="0" aria-orientation="vertical" :aria-valuemin="36" :aria-valuemax="70" :aria-valuenow="Math.round(editorSplitRatio)" aria-label="调整源码与预览宽度" @pointerdown="startEditorSplitResize" @keydown="onEditorSplitResizeKeydown"><span /></div>
                  <section v-if="editorMode === 'split' || editorMode === 'preview'" class="editor-preview-pane" aria-label="实时阅读预览">
                    <div class="editor-pane-heading">
                      <span class="editor-pane-title"><i class="editor-pane-dot editor-pane-dot-preview" />阅读预览</span>
                      <span class="editor-pane-heading-actions">
                        <small>{{ editorMode === 'preview' ? '仅阅读预览' : editorHeadings.length ? `${editorHeadings.length} 个章节` : '无标题结构' }}</small>
                        <button v-if="editorMode === 'preview'" type="button" @click="setEditorMode('split')">显示源码</button>
                      </span>
                    </div>
                    <div ref="editorPreview" class="editor-preview-scroll">
                      <nav v-if="editorHeadings.length" class="editor-outline" aria-label="编辑中的文档结构">
                        <span class="editor-outline-label">章节导航</span>
                        <button v-for="(heading, index) in editorHeadings" :key="heading.id" type="button" :style="{ paddingLeft: `${8 + (heading.depth - 1) * 12}px` }" @click="jumpToEditorHeading(index)">{{ heading.text }}</button>
                      </nav>
                      <article class="editor-preview" v-html="editorPreviewHtml" @click="openEditorPreviewImage" />
                    </div>
                  </section>
                </div>
                <div class="editor-statusbar">
                  <span>{{ editorMode === 'write' ? '源码写作' : editorMode === 'rich' ? '所见即所得' : editorMode === 'preview' ? '阅读预览' : '边写边读' }}</span>
                  <span :class="{ 'editor-dirty': editorDirty }">{{ editorBackupError ? '备份失败' : editorDirty ? '草稿已备份 · 未写入文件' : '已保存' }}</span>
                  <span>Ln {{ editorCursor.line }}, Col {{ editorCursor.column }}</span>
                  <span class="editor-status-spacer" />
                  <span>支持 Markdown / GFM / 数学公式</span>
                  <span>Alt+↑↓ 移动当前段落</span>
                </div>
              </div>
              <nav v-if="!editorOpen && store.mode === 'clean' && (store.currentDocument?.headings.length ?? 0) > 0" class="reading-progress-rail" aria-label="阅读进度导航"><span class="reading-progress-rail-caption">{{ Math.round((currentProgress?.scrollPercent ?? 0) * 100) }}%</span><div class="reading-progress-rail-track"><span class="reading-progress-rail-fill" :style="{ height: `${(currentProgress?.scrollPercent ?? 0) * 100}%` }" /><button v-for="(heading, index) in store.currentDocument?.headings" :key="heading.id" type="button" class="reading-progress-marker" :class="{ active: store.activeHeadingId === heading.id }" :style="{ top: headingRailPosition(index) }" :aria-label="`跳转到 ${heading.text}`" :title="heading.text" @click.stop="scrollToHeading(heading.regionId)"><i /><span>{{ heading.text }}</span></button></div></nav>
              <div v-if="!editorOpen" class="reader-content" :class="`reader-display-${readerDisplayMode}`">
                <div v-if="readerDisplayMode !== 'mindmap'" class="reader-markdown"><h1 class="reader-title">{{ displayTitle(store.currentDocument?.title) }}</h1><div class="reader-rule" />
                <div class="regions-stack" :class="{ virtualized: virtualizedReader }">
                <div v-if="virtualRange.before" class="virtual-spacer" :style="{ height: `${virtualRange.before}px` }" aria-hidden="true" />
                <div class="virtual-regions">
                  <RegionBlock v-for="region in virtualRange.regions" v-memo="[region.id, store.currentDocument?.sourceHash, store.activeRegionId === region.id, store.focusedRegionId === region.id, focusDistanceByRegion.get(region.id), store.mode, store.activeThemeId, currentAnnotationsByRegion.get(region.id)]" :key="region.id" :region="region" :annotations="currentAnnotationsByRegion.get(region.id)" :focused="store.focusedRegionId === region.id" :active="store.activeRegionId === region.id" :focus-distance="focusDistanceByRegion.get(region.id)" :theme-mode="store.activeTheme?.manifest.mode" :theme-key="`${store.mode}-${store.activeThemeId}`" @focus="focusRegion(region)" @open-viewer="openViewer(region)" @open-link="openExternalLink" @code-copied="notify('代码已复制')" @math-copied="notify('MathML 已复制')" @math-copy-failed="notify('复制 MathML 失败，请检查剪贴板权限')" @copy-image="copyRegionAsImage(region)" @toggle-task="toggleTask(region)" />
                </div>
                <div v-if="virtualRange.after" class="virtual-spacer" :style="{ height: `${virtualRange.after}px` }" aria-hidden="true" />
                </div></div>
                <div v-if="readerDisplayMode !== 'markdown'" class="reader-mindmap">
                  <div class="reader-mindmap-heading"><span class="section-kicker">文章结构</span><strong>章节脉络</strong><small>{{ currentMindmap ? (readerDisplayMode === 'split' ? '章节默认收起；点击 + 查看摘要，点击时间跳转视频' : '章节卡片默认展开，深层分支默认收起；点击 − / + 查看下一层') : '这篇文档还没有可识别的标题' }}</small></div>
                  <TreeDiagram v-if="currentMindmap" :node="currentMindmap" root :compact="readerDisplayMode === 'split'" @open-link="openExternalLink" />
                  <p v-else class="reader-mindmap-empty">请使用 Markdown 标题或独立加粗小标题来生成思维导图。</p>
                </div>
              </div>
            </div>
          </div>
          <Teleport to="body">
            <div v-if="editorContextMenu" class="editor-context-menu" :style="{ top: `${editorContextMenu.y}px`, left: `${editorContextMenu.x}px` }" role="menu">
              <button type="button" role="menuitem" @click="wrapEditorSelection('**', '**', '粗体'); closeEditorContextMenu()">粗体</button>
              <button type="button" role="menuitem" @click="wrapEditorSelection('*', '*', '斜体'); closeEditorContextMenu()">斜体</button>
              <button type="button" role="menuitem" @click="wrapEditorSelection('~~', '~~', '删除线'); closeEditorContextMenu()">删除线</button>
              <button type="button" role="menuitem" @click="wrapEditorSelection('`', '`', '代码'); closeEditorContextMenu()">行内代码</button>
              <button type="button" role="menuitem" @click="wrapEditorSelection('==', '==', '高亮'); closeEditorContextMenu()">高亮</button>
              <button type="button" role="menuitem" @click="wrapEditorSelection('~', '~', '下标'); closeEditorContextMenu()">下标</button>
              <button type="button" role="menuitem" @click="wrapEditorSelection('^', '^', '上标'); closeEditorContextMenu()">上标</button>
              <button type="button" role="menuitem" @click="insertEditorLink(); closeEditorContextMenu()">链接</button>
              <button type="button" role="menuitem" @click="prefixEditorLines('# '); closeEditorContextMenu()">一级标题</button>
              <button type="button" role="menuitem" @click="prefixEditorLines('- '); closeEditorContextMenu()">无序列表</button>
              <button type="button" role="menuitem" @click="prefixEditorLines('1. '); closeEditorContextMenu()">有序列表</button>
              <button type="button" role="menuitem" @click="prefixEditorLines('- [ ] '); closeEditorContextMenu()">任务列表</button>
              <button type="button" role="menuitem" @click="prefixEditorLines('> '); closeEditorContextMenu()">引用</button>
              <button type="button" role="menuitem" @click="insertEditorCodeBlock(); closeEditorContextMenu()">代码块</button>
              <button type="button" role="menuitem" @click="toggleEditorAlert('NOTE'); closeEditorContextMenu()">警告框</button>
              <button type="button" role="menuitem" @click="selectEditorLine(); closeEditorContextMenu()">选中当前行</button>
              <button type="button" role="menuitem" @click="cutEditorLine(); closeEditorContextMenu()">剪切当前行</button>
              <button type="button" role="menuitem" @click="deleteEditorLine(); closeEditorContextMenu()">删除当前行</button>
            </div>
          </Teleport>
        <aside v-if="contextPanelOpen && store.mode !== 'focus' && store.mode !== 'clean'" class="context-panel">
          <div class="context-top"><span class="section-kicker">阅读上下文</span><button class="text-button" type="button" @click="view = 'themes'">主题 <AppIcon name="external" :size="12" /></button></div>
          <div class="context-card current-context"><span class="section-kicker">当前章节</span><strong>{{ currentHeading?.text || '开篇' }}</strong><small>{{ store.currentDocument?.regions.length ?? 0 }} 个阅读区域 · {{ currentAnnotations.length }} 条批注</small></div>
          <div class="context-actions"><button type="button" @click="toggleFocusMode"><AppIcon name="focus" :size="13" />进入专注</button><button type="button" @click="toggleCleanMode"><AppIcon name="eye" :size="13" />纯净阅读</button></div>
          <div v-if="currentAnnotations.length" class="annotation-panel"><div class="annotation-heading"><span class="section-kicker">批注</span><span>{{ currentAnnotations.length }}</span></div><button v-for="annotation in currentAnnotations.slice(0, 4)" :key="annotation.id" class="annotation-item" type="button" @click="jumpToAnnotation(annotation)"><span class="annotation-dot" :style="{ background: annotation.color }" /><span><b>{{ annotation.note || '高亮标记' }}</b><small>{{ annotation.selectedText }}</small></span></button></div>
        </aside>
         <aside v-if="store.mode === 'focus'" class="focus-sidebar"><div class="focus-sidebar-head"><div><span class="section-kicker">阅读模式</span><strong>专注阅读</strong><small class="focus-document-label">{{ displayTitle(store.currentDocument?.title) || '当前文档' }}</small></div><button class="ghost-button" type="button" @click="exitFocusMode"><AppIcon name="close" :size="13" />退出</button></div><div class="focus-session-meta"><span><i />{{ focusRunning ? '专注进行中' : '准备开始' }}</span><span>{{ Math.round((currentProgress?.scrollPercent ?? 0) * 100) }}% 已读</span></div><div class="focus-timer-card"><div class="focus-timer-ring" :style="{ '--focus-progress': `${focusProgress * 360}deg` }"><strong>{{ focusTimeLabel }}</strong><span>{{ focusRunning ? '专注中' : focusRemaining === 0 ? '已完成' : '准备开始' }}</span></div><div class="focus-timer-actions"><button type="button" @click="resetFocusTimer">重置</button><button class="primary-button" type="button" @click="toggleFocusTimer">{{ focusRunning ? '暂停' : '开始' }}</button></div></div><FocusAmbiencePicker :themes="focusThemes" :selected-theme-id="store.activeThemeId" @select="applyReaderTheme" /><div class="focus-card focus-outline"><div class="focus-card-heading"><span>内容导航</span><small>{{ store.currentDocument?.headings.length ?? 0 }} 章 · {{ Math.round((currentProgress?.scrollPercent ?? 0) * 100) }}%</small></div><nav v-if="store.currentDocument?.headings.length"><button v-for="heading in store.currentDocument.headings" :key="heading.id" :data-focus-outline-id="heading.id" type="button" :class="{ active: store.activeHeadingId === heading.id }" @click="focusHeading(heading.regionId)"><i />{{ heading.text }}</button></nav><p v-else class="focus-outline-empty">这篇文档还没有章节标题</p></div></aside>
        </div>
        <div v-if="resumePrompt?.documentId === store.currentDocumentId" class="resume-prompt" role="dialog" aria-label="继续阅读">
          <div class="resume-prompt-copy">
            <span class="section-kicker">继续阅读</span>
            <strong>继续阅读到 <span class="resume-percent">{{ Math.round((resumePrompt?.percent ?? 0) * 100) }}%</span></strong>
            <small>{{ displayTitle(store.currentDocument?.title) }}</small>
          </div>
          <div class="resume-prompt-actions">
            <button class="ghost-button" type="button" @click="startReadingOver">从头开始</button>
            <button class="primary-button" type="button" @click="resumeReading">继续阅读</button>
          </div>
        </div>
        <div v-if="store.mode === 'region-focus'" class="focus-hud" role="status"><span v-if="focusPosition" class="focus-hud-position">{{ focusPosition }}</span><span class="focus-hud-shortcut"><kbd>↑</kbd><kbd>↓</kbd>切换</span><button type="button" @click="clearRegionFocus"><kbd>Esc</kbd>退出聚焦</button></div>
        <div v-if="store.mode === 'clean'" class="clean-mode-hud"><span><AppIcon name="eye" :size="13" />纯净阅读</span><button type="button" @click="toggleCleanMode">退出 <kbd>Esc</kbd></button></div>
        <div v-if="selectionToolbar" class="selection-toolbar"><span class="selection-label">{{ selectionToolbar.text.slice(0, 28) }}{{ selectionToolbar.text.length > 28 ? '…' : '' }}</span><button type="button" @click="highlightSelection">{{ selectionIsHighlighted() ? '取消高亮' : '高亮' }}</button><button type="button" @click="beginAnnotation">批注</button><button type="button" @click="searchSelection">搜索</button><button type="button" @click="assist('translate')">翻译</button><button type="button" @click="copySelectionMarkdown">复制 Markdown</button><button type="button" @click="copySelectionHtml">复制 HTML</button><button type="button" @click="copySelectionMathMl">复制 MathML</button><button type="button" @click="copySelection">复制纯文本</button></div>
        <div v-if="wordCountOpen && store.currentDocument" class="overlay file-properties-overlay" @click.self="wordCountOpen = false"><div class="file-properties-dialog" role="dialog" aria-modal="true" aria-labelledby="word-count-title"><div class="file-properties-heading"><div><span class="section-kicker">文档统计</span><h2 id="word-count-title">{{ displayTitle(store.currentDocument.title) }}</h2></div><IconButton icon="close" size="sm" label="关闭字数统计" @click="wordCountOpen = false" /></div><dl class="file-properties-list"><div><dt>正文字符</dt><dd>{{ wordCountStats.characters }}</dd></div><div><dt>中英文词</dt><dd>{{ wordCountStats.words }}</dd></div><div><dt>源文件行</dt><dd>{{ wordCountStats.lines }}</dd></div><div><dt>正文块</dt><dd>{{ wordCountStats.blocks }}</dd></div><div><dt>标题</dt><dd>{{ wordCountStats.headings }}</dd></div></dl><div class="file-properties-actions"><button class="ghost-button" type="button" @click="wordCountOpen = false">完成</button></div></div></div>
      </section>

      <ThemeCenter v-else-if="view === 'themes'" :themes="store.themes" :active-theme-id="store.activeThemeId" :active-theme="store.activeTheme" @apply="applyReaderTheme" @install="store.installTheme" @notify="notify" />

        <section v-else-if="view === 'settings'" class="page settings-page"><div class="page-heading"><div><p class="section-kicker">偏好设置</p><h1>把阅读，调成<br /><em>自己的样子。</em></h1></div><button class="ghost-button" type="button" @click="notify('设置已保存在本地')"><AppIcon name="check" :size="14" />保存设置</button></div><div class="settings-tabs"><button :class="{ active: settingsTab === 'reading' }" type="button" @click="settingsTab = 'reading'">阅读偏好</button><button :class="{ active: settingsTab === 'editing' }" type="button" @click="settingsTab = 'editing'">编辑与导出</button><button :class="{ active: settingsTab === 'shortcuts' }" type="button" @click="settingsTab = 'shortcuts'">快捷键</button><button :class="{ active: settingsTab === 'extensions' }" type="button" @click="settingsTab = 'extensions'">插件扩展</button><button type="button" @click="notify('文件关联设置将在桌面端接入')">文件关联</button><button type="button" @click="notify('同步与备份暂不启用')">同步与备份</button></div><div class="settings-grid">
        <div v-show="settingsTab === 'reading'" class="settings-card font-settings-card">
          <div class="font-settings-heading"><div><span class="section-kicker">阅读偏好</span><h2>字体与排版</h2></div><span>自动保存</span></div>
          <FontPicker label="正文字体" :model-value="store.readerSettings.fontFamily" :fallback-family="store.activeTheme.tokens.reader.fontFamily" @update:model-value="store.updateSettings({ fontFamily: $event })" />
          <div class="interface-font-setting">
            <FontPicker compact label="界面字体" default-label="系统默认" :model-value="store.readerSettings.interfaceFontFamily" :fallback-family="interfaceFont" @update:model-value="store.updateSettings({ interfaceFontFamily: $event })" />
            <p>用于菜单、侧栏与按钮。正文单独设置，代码保持等宽。</p>
          </div>
        </div>
        <div v-show="settingsTab === 'editing'" class="settings-card settings-card-wide"><span class="section-kicker">写作</span><h2>编辑器行为</h2><div class="setting-form-grid"><label class="setting-input">默认扩展名<select v-model="advancedSettings.defaultExtension"><option value="md">.md</option><option value="markdown">.markdown</option></select></label><label class="setting-input">默认代码语言<input v-model="advancedSettings.defaultCodeLanguage" list="editor-code-languages" /></label><label class="setting-input">文件拖放<select v-model="advancedSettings.dropBehavior"><option value="insert">编辑时插入媒体</option><option value="open">只打开 Markdown</option></select></label></div><label class="setting-check"><input v-model="advancedSettings.rememberCodeLanguage" type="checkbox" />记住上次代码语言</label><label class="setting-check"><input v-model="advancedSettings.emojiAutocomplete" type="checkbox" />输入 : 时显示 Emoji 建议</label><label class="setting-check"><input v-model="advancedSettings.spellcheck" type="checkbox" />启用系统拼写检查</label><label class="setting-check"><input v-model="advancedSettings.editorAutoSave" type="checkbox" />每 60 秒自动保存文件（遇到外部修改时停止）</label><p class="muted-copy">无论是否启用自动保存，编辑草稿都会即时备份；再次编辑同一文档会自动恢复。</p><label class="setting-check"><input v-model="advancedSettings.typewriterMode" type="checkbox" />打字时让光标保持在屏幕中央</label><label class="setting-check"><input v-model="advancedSettings.rememberRecent" type="checkbox" />保存最近打开的文档</label></div>
        <div v-show="settingsTab === 'editing'" class="settings-card"><span class="section-kicker">输入辅助</span><h2>链接识别</h2><label class="setting-check"><input v-model="advancedSettings.autoLink" type="checkbox" />自动把裸网址渲染为链接</label><p class="muted-copy">关闭后，仍保留明确写出的 Markdown 链接。</p></div>
        <div v-show="settingsTab === 'editing'" class="settings-card"><span class="section-kicker">图片上传</span><h2>PicList</h2><label class="setting-input">服务地址<input v-model="advancedSettings.picListEndpoint" placeholder="http://127.0.0.1:36677/upload" /></label><label class="setting-input">接口密钥<input v-model="advancedSettings.picListKey" type="password" placeholder="可选" /></label><p class="muted-copy">仅连接本机 PicList 服务；图片不会经过墨阅服务器。</p></div>
        <div v-show="settingsTab === 'editing'" class="settings-card"><span class="section-kicker">图片路径</span><h2>相对路径</h2><label class="setting-check"><input v-model="advancedSettings.relativeImagePathPrefix" type="checkbox" />新插入的本地图片路径以 <code>./</code> 开头</label><p class="muted-copy">应用于导入、粘贴、拖入、下载、整理和重命名；已有引用保持不变。</p></div>
        <div v-show="settingsTab === 'editing'" class="settings-card"><span class="section-kicker">远程图片</span><h2>兼容与隐私</h2><label class="setting-check"><input v-model="advancedSettings.remoteImagePrivacy" type="checkbox" />不向图片服务发送来源信息</label><p class="muted-copy">默认采用浏览器标准策略，兼容需要来源信息的图床；启用后会以 no-referrer 请求远程图片。</p></div>
        <div v-show="settingsTab === 'editing'" class="settings-card"><span class="section-kicker">导出</span><h2>电子书与打印</h2><p class="muted-copy">HTML / EPUB / PDF / 长图跟随当前主题与排版；桌面端 DOCX / LaTeX 使用 Pandoc；EPUB 内嵌图像、视频和字幕，保留公式、脚注和链接。</p><label class="setting-input">Word 样式模板（可选 .docx）<input :value="advancedSettings.referenceDocx" readonly placeholder="使用 Pandoc 默认样式" /></label><div class="setting-actions"><button class="ghost-button" type="button" @click="chooseDocxReference">选择模板</button><button v-if="advancedSettings.referenceDocx" class="ghost-button" type="button" @click="advancedSettings.referenceDocx = ''">恢复默认</button></div><label class="setting-row"><span>EPUB 目录层级 <b>H{{ advancedSettings.epubChapterDepth }}</b></span><input v-model.number="advancedSettings.epubChapterDepth" type="range" min="1" max="6" /></label><div class="setting-form-grid"><label class="setting-input">纸张<select v-model="advancedSettings.printPageSize"><option value="A4">A4</option><option value="Letter">Letter</option></select></label><label class="setting-input">页边距（mm）<input v-model.number="advancedSettings.printMargin" type="number" min="8" max="40" /></label><label class="setting-input">页眉<input v-model="advancedSettings.printHeader" /></label><label class="setting-input">页脚<input v-model="advancedSettings.printFooter" /></label></div><label class="setting-check"><input v-model="advancedSettings.printBackground" type="checkbox" />打印主题背景</label></div>
        <div v-show="settingsTab === 'reading'" class="settings-card"><span class="section-kicker">阅读</span><h2>阅读偏好</h2><label class="setting-row"><span>正文宽度 <b>{{ store.readerSettings.width }}px</b></span><input :value="store.readerSettings.width" type="range" min="620" max="1280" step="10" @input="changeSetting('width', Number(($event.target as HTMLInputElement).value))" /></label><label class="setting-row"><span>字号 <b>{{ store.readerSettings.fontSize }}px</b></span><input :value="store.readerSettings.fontSize" type="range" min="15" max="24" step="1" @input="changeSetting('fontSize', Number(($event.target as HTMLInputElement).value))" /></label><label class="setting-row"><span>行距 <b>{{ store.readerSettings.lineHeight }}</b></span><input :value="store.readerSettings.lineHeight" type="range" min="1.4" max="2.2" step=".05" @input="changeSetting('lineHeight', Number(($event.target as HTMLInputElement).value))" /></label><div class="setting-toggle-row"><span>显示阅读进度</span><i class="toggle-on" /></div><div class="setting-toggle-row"><span>启用专注模式</span><i class="toggle-on" /></div></div><div v-show="settingsTab === 'reading'" class="settings-card"><span class="section-kicker">辅助功能</span><h2>翻译与解释</h2><p class="muted-copy">使用适配器连接你自己的翻译或解释服务；配置后可从划词工具栏调用。</p><label class="setting-input">服务标识<input v-model="customProvider" placeholder="例如：local-llm / my-translator" /></label><button class="primary-button" type="button" @click="notify(customProvider ? '适配器标识已保存' : '保持未配置状态')"><AppIcon name="check" :size="14" />保存配置</button></div><div v-show="settingsTab === 'shortcuts'" class="settings-card shortcuts-card"><span class="section-kicker">快捷操作</span><h2>快捷键</h2><div class="shortcut-row"><span>全局搜索</span><kbd>Ctrl / Cmd + K</kbd></div><div class="shortcut-row"><span>当前文档搜索</span><kbd>Ctrl / Cmd + F</kbd></div><div class="shortcut-row"><span>阅读缩放</span><kbd>Ctrl / Cmd + + / -</kbd></div><div class="shortcut-row"><span>专注模式</span><kbd>F</kbd></div><div class="shortcut-row"><span>退出聚焦</span><kbd>Esc</kbd></div><div class="shortcut-row"><span>切换区域</span><kbd>↑ ↓</kbd></div></div><div v-show="settingsTab === 'extensions'" class="settings-card extensions-card"><div class="extensions-head"><div><span class="section-kicker">插件中心</span><h2>插件扩展</h2></div><button class="ghost-button" type="button" @click="notify('插件运行时将在后续版本启用')"><AppIcon name="plugin" :size="14" />打开插件目录</button></div><div class="extension-filter"><AppIcon name="search" :size="14" /><span>按需扩展阅读能力</span></div><div class="extension-list"><div class="extension-item"><span class="extension-icon purple"><AppIcon name="sparkle" :size="17" /></span><span><b>AI 阅读助手</b><small>总结、解释与问答适配器</small></span><button type="button" @click="notify('请先在翻译与解释中配置服务')">配置</button></div><div class="extension-item"><span class="extension-icon green"><AppIcon name="download" :size="17" /></span><span><b>导出增强</b><small>为阅读内容准备更多导出格式</small></span><button type="button" @click="notify('导出增强将在下一阶段接入')">安装</button></div><div class="extension-item"><span class="extension-icon pink"><AppIcon name="components" :size="17" /></span><span><b>思维导图</b><small>把长文转换为结构化视图</small></span><button type="button" @click="notify('插件运行时暂未启用')">安装</button></div></div></div></div></section>
      <ClipboardManager v-show="view === 'clipboard'" @notify="notify" />
    </main>

    <div v-if="quickOpenOpen" class="overlay search-overlay" @click.self="quickOpenOpen = false">
      <div class="search-dialog quick-open-dialog" role="dialog" aria-modal="true" aria-label="快速打开文件">
        <div class="search-input-row">
          <AppIcon name="search" :size="17" />
          <input v-model="quickOpenQuery" autofocus placeholder="按文件名或文件夹路径快速打开…" aria-label="按文件名或路径快速打开" @keydown.esc="quickOpenOpen = false" />
          <kbd>ESC</kbd>
        </div>
        <div class="search-scope-row quick-open-meta">
          <strong>快速打开</strong>
          <span>{{ quickOpenResults.length }} 个文件</span>
          <small>Ctrl/Cmd + P · 支持模糊路径</small>
        </div>
        <div v-if="quickOpenResults.length" class="search-results quick-open-results">
          <button v-for="(result, index) in quickOpenResults" :key="result.path" type="button" :class="{ selected: quickOpenIndex === index }" @click="chooseQuickOpenResult(result)">
            <span class="result-kind">{{ result.documentId ? '已打开' : '文件' }}</span>
            <span><b>{{ result.name }}</b><small class="quick-open-path">{{ result.path }}</small></span>
            <AppIcon name="external" :size="14" />
          </button>
        </div>
        <div v-else class="empty-search">{{ quickOpenQuery ? '没有匹配的 Markdown 文档' : '输入文件名或文件夹路径；当前文件夹与已打开文档均可快速打开。' }}</div>
      </div>
    </div>

    <div v-if="searchOpen" class="overlay search-overlay" @click.self="searchOpen = false"><div class="search-dialog"><div class="search-input-row"><AppIcon name="search" :size="17" /><input v-model="query" autofocus :placeholder="searchScope === 'current' ? '搜索当前文档…' : '搜索文档、标题、内容…'" aria-label="搜索内容" @keydown.esc="searchOpen = false" /><kbd>ESC</kbd></div><div class="search-scope-row"><div class="search-scope-tabs" role="tablist" aria-label="搜索范围"><button type="button" :class="{ active: searchScope === 'all' }" @click="searchScope = 'all'">全部文档</button><button type="button" :class="{ active: searchScope === 'current' }" :disabled="!store.currentDocument" @click="searchScope = 'current'">当前文档</button><button type="button" :class="{ active: replaceOpen }" @click="replaceOpen = !replaceOpen">查找替换</button></div><span>{{ searchResults.reduce((total, result) => total + result.matchCount, 0) }} 个匹配</span><small>Ctrl/Cmd + F 搜当前文档</small></div><div v-if="replaceOpen" class="replace-row"><input v-model="replaceValue" placeholder="替换为…" aria-label="替换内容" /><label><input v-model="searchRegex" type="checkbox" /> 正则</label><button type="button" :disabled="!searchPattern || searchPatternError" @click="replaceSearchMatches">全部替换</button></div><p v-if="searchPatternError" class="search-error">正则表达式无效</p><div v-if="searchResults.length" class="search-results"><button v-for="(result, index) in searchResults" :key="`${result.document.id}-${result.region.id}`" type="button" :class="{ selected: searchIndex === index }" @click="chooseSearchResult(result.document.id, result.region.id)"><span class="result-kind">{{ result.region.type }}</span><span><b>{{ displayTitle(result.document.title) }}</b><small>{{ result.region.textContent.slice(0, 100) }} · {{ result.matchCount }} 处匹配</small></span><AppIcon name="external" :size="14" /></button></div><div v-else class="empty-search">{{ query ? '没有找到相关内容' : searchScope === 'current' ? '输入关键词，搜索当前文档' : '输入关键词，搜索你的阅读空间' }}</div></div></div>

    <div v-if="tableBuilderOpen" class="overlay editor-dialog-overlay" @click.self="tableBuilderOpen = false"><div class="editor-dialog" role="dialog" aria-modal="true" aria-label="插入表格"><span class="section-kicker">表格工具</span><h2>插入可编辑表格</h2><div class="setting-form-grid"><label class="setting-input">行数<input v-model.number="tableBuilder.rows" type="number" min="2" max="20" /></label><label class="setting-input">列数<input v-model.number="tableBuilder.columns" type="number" min="1" max="12" /></label><label class="setting-input">对齐<select v-model="tableBuilder.alignment"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label></div><div class="note-actions"><button class="ghost-button" type="button" @click="tableBuilderOpen = false">取消</button><button class="primary-button" type="button" @click="confirmInsertEditorTable">插入表格</button></div></div></div>
      <dialog v-if="tableEditor" ref="tableEditorDialog" class="editor-dialog table-editor-dialog" aria-label="编辑表格" @cancel.prevent="closeTableEditor" @keydown="onTableEditorDialogKeydown">
        <fieldset class="table-editor-fields" :disabled="tableEditorSaving">
        <div class="extensions-head"><div><h2>编辑表格</h2><small>{{ tableEditor.draft ? '应用到草稿，可撤销；不会自动写入文件' : '保存后更新当前文档' }}</small></div><div><button class="ghost-button" type="button" :disabled="tableEditor.rows.length >= 500" @click="addTableEditorRow">增加行</button><button class="ghost-button" type="button" :disabled="tableEditor.alignments.length >= 12" @click="addTableEditorColumn">增加列</button></div></div>
        <div class="table-alignment-actions" aria-label="表格编辑历史">
          <button type="button" :disabled="tableEditorHistory.index === 0 || tableEditorSaving" @click="restoreTableEditorHistory(-1)">撤销表格修改</button>
          <button type="button" :disabled="tableEditorHistory.index === tableEditorHistory.entries.length - 1 || tableEditorSaving" @click="restoreTableEditorHistory(1)">重做表格修改</button>
        </div>
        <p v-if="tableEditorMessage" role="alert" class="search-error">{{ tableEditorMessage }}</p>
        <div class="table-alignment-actions" aria-label="当前行列操作">
          <span>{{ tableEditor.row === 0 ? '表头' : `数据行 ${tableEditor.row}` }} / 第 {{ tableEditor.column + 1 }} 列</span>
          <button type="button" :disabled="tableEditor.row <= 1" @click="changeTableStructure('up')">上移行</button>
          <button type="button" :disabled="tableEditor.row === 0 || tableEditor.row === tableEditor.rows.length - 1" @click="changeTableStructure('down')">下移行</button>
          <button type="button" :disabled="tableEditor.row === 0" @click="changeTableStructure('delete-row')">删除行</button>
          <button type="button" :disabled="tableEditor.column === 0" @click="changeTableStructure('left')">左移列</button>
          <button type="button" :disabled="tableEditor.column === tableEditor.alignments.length - 1" @click="changeTableStructure('right')">右移列</button>
          <button type="button" :disabled="tableEditor.alignments.length <= 1" @click="changeTableStructure('delete-column')">删除列</button>
        </div>
        <div class="table-alignment-actions" aria-label="统一设置列对齐"><span>{{ tableEditor.selectedColumns.length ? `已选 ${tableEditor.selectedColumns.length} 列：` : '全部列：' }}</span><button type="button" @click="setTableEditorAlignment('left')">左</button><button type="button" @click="setTableEditorAlignment('center')">中</button><button type="button" @click="setTableEditorAlignment('right')">右</button></div>
        <div class="table-column-selection" aria-label="选择需要对齐的列"><span>选择列：</span><button v-for="(_, column) in tableEditor.alignments" :key="`column-${column}`" type="button" :class="{ active: tableEditor.selectedColumns.includes(column) }" @click="toggleTableEditorColumn(column)">第 {{ column + 1 }} 列</button><small>不选择时作用于全部列</small></div>
        <div class="table-editor-grid" :style="{ gridTemplateColumns: `repeat(${tableEditor.alignments.length}, minmax(120px, 1fr))` }">
          <template v-for="(_, column) in tableEditor.alignments" :key="`alignment-${column}`"><select v-model="tableEditor.alignments[column]" :aria-label="`第 ${column + 1} 列对齐方式`"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></template>
          <template v-for="(row, rowIndex) in tableEditor.rows" :key="`row-${rowIndex}`"><textarea v-for="(_, column) in tableEditor.alignments" :key="`${rowIndex}-${column}`" v-model="row[column]" :rows="Math.min(4, Math.max(1, row[column].split(/\r?\n/).length))" :data-table-cell="`${rowIndex}-${column}`" :class="{ 'table-header-input': rowIndex === 0 }" :aria-label="`第 ${rowIndex + 1} 行第 ${column + 1} 列`" :disabled="tableEditorSaving" @focus="onTableCellFocus(rowIndex, column)" @click="tableEditorHistory.group = ''" @beforeinput="onTableCellBeforeInput($event, rowIndex, column)" @keydown="onTableCellKeydown($event, rowIndex, column)" @paste="onTableCellPaste($event, rowIndex, column)" /></template>
        </div>
        <p>Tab 切换单元格，Enter 向下，Shift+Enter 换行；末尾自动增行。支持粘贴表格数据和 Ctrl/Cmd+Z 撤销。</p>
        <div class="note-actions"><button class="ghost-button" type="button" :disabled="tableEditorSaving" @click="closeTableEditor">取消</button><button class="primary-button" type="button" :disabled="tableEditorSaving" @click="saveTableEditor">{{ tableEditorSaving ? '正在保存…' : tableEditor.draft ? '应用到草稿' : '保存表格' }}</button></div>
        </fieldset>
      </dialog>
    <div v-if="imageManagerOpen" class="overlay editor-dialog-overlay" @click.self="imageManagerOpen = false"><div class="editor-dialog image-manager-dialog" role="dialog" aria-modal="true" aria-label="图片管理"><div class="extensions-head"><div><span class="section-kicker">文档资源</span><h2>图片管理</h2></div><button class="ghost-button" type="button" @click="downloadAllEditorImages">下载全部远程图片</button></div><div v-if="editorImages.length" class="image-manager-list"><div v-for="image in editorImages" :key="`${image.index}-${image.url}`" class="image-manager-row"><img :src="resolveMarkdownAssetUrl(store.currentDocument?.path ?? '', image.url, editorInlineAssets)" :alt="image.alt" /><span><b>{{ image.alt }}</b><small>{{ image.url }}</small></span><button v-if="!image.remote" type="button" @click="renameEditorImage(image.url)">重命名</button><button v-if="!image.remote" class="danger-button" type="button" @click="deleteEditorImage(image.url)">删除</button></div></div><p v-else class="empty-search">当前文档没有图片。</p><div class="note-actions"><button class="ghost-button" type="button" @click="imageManagerOpen = false">完成</button></div></div></div>
    <div v-if="viewer" class="overlay viewer-overlay" :class="{ 'is-viewer-fullscreen': viewerFullscreen }" @click.self="closeViewer">
      <div class="viewer-shell" role="dialog" aria-modal="true" :aria-label="`${viewerKind(viewer.type)}独立查看`" :class="{ 'is-fullscreen': viewerFullscreen }">
        <header class="viewer-header">
          <div class="viewer-heading">
            <span class="viewer-kicker"><i /> 独立查看 <b>/</b> {{ viewerKind(viewer.type) }}</span>
            <div class="viewer-title-row"><strong>{{ viewerTitle(viewer.type, viewer.region) }}</strong><span class="viewer-title-badge">独立查看</span></div>
            <small>{{ viewerSubtitle(viewer.type, viewer.region) }}</small>
          </div>
          <div class="viewer-actions">
            <button v-if="viewer.type === 'mermaid' && viewerTab === 'preview'" class="viewer-fit-button" type="button" title="适应窗口" @click="fitViewer"><AppIcon name="expand" :size="13" />适应</button>
            <div v-if="viewerCanZoom" class="viewer-zoom-group">
              <IconButton icon="minus" size="sm" variant="surface" label="缩小" @click="setViewerZoom(viewerZoom - .1)" />
              <input v-if="viewerTab === 'preview'" v-model.number="viewerZoom" class="viewer-zoom-slider" type="range" min=".1" max="3" step=".05" :aria-label="viewer.type === 'image' ? '图片缩放' : '图表缩放'" />
              <button class="viewer-zoom-value" type="button" title="还原到 100%" @click="resetViewerView">{{ Math.round(viewerZoom * 100) }}%</button>
              <IconButton icon="plus" size="sm" variant="surface" label="放大" @click="setViewerZoom(viewerZoom + .1)" />
            </div>
            <span class="viewer-action-divider" />
            <IconButton icon="fullscreen" size="sm" variant="surface" :label="viewerFullscreen ? '退出全屏' : '全屏查看'" @click="toggleViewerFullscreen" />
            <IconButton icon="close" size="sm" variant="surface" label="关闭查看器" @click="closeViewer" />
          </div>
        </header>
        <nav v-if="viewer.type === 'mermaid'" class="viewer-tabs" aria-label="图表查看方式">
          <button type="button" :class="{ active: viewerTab === 'preview' }" @click="viewerTab = 'preview'">图表预览</button>
          <button type="button" :class="{ active: viewerTab === 'source' }" @click="viewerTab = 'source'">源代码</button>
          <button type="button" :class="{ active: viewerTab === 'data' }" @click="viewerTab = 'data'">结构</button>
        </nav>
        <div ref="viewerStage" class="viewer-stage" :class="{ 'is-pan-enabled': viewerCanPan, 'is-dragging': viewerDragging }" :style="viewerStageStyle" @wheel="onViewerWheel" @pointerdown="onViewerPointerDown" @pointermove="onViewerPointerMove" @pointerup="onViewerPointerUp" @pointercancel="onViewerPointerUp" @dblclick="onViewerDoubleClick">
          <TreeDiagram v-if="viewer.type === 'tree' && activeViewerTree" :node="activeViewerTree" root @open-link="openExternalLink" />
          <MermaidBlock v-else-if="viewer.type === 'mermaid' && viewerTab === 'preview'" :code="String(viewer.region.metadata?.code ?? viewer.region.textContent)" :native-labels="Boolean(viewer.region.metadata?.autoDiagram)" large @rendered="fitViewer" />
          <div v-else-if="viewer.type === 'mermaid' && viewerTab === 'source'" class="viewer-source-panel">
            <div class="viewer-source-toolbar"><span>Mermaid 源码</span><button type="button" @click="copyViewerSource"><AppIcon name="copy" :size="13" />复制源码</button></div>
            <pre class="viewer-source">{{ mermaidSource() }}</pre>
          </div>
          <div v-else-if="viewer.type === 'mermaid'" class="viewer-source-panel">
            <div class="viewer-source-toolbar"><span>图表结构</span></div>
            <pre class="viewer-source">{{ JSON.stringify(viewer.region.metadata ?? {}, null, 2) }}</pre>
          </div>
          <div v-else-if="viewer.type === 'image'" class="image-viewer"><img :src="String(viewer.region.metadata?.url ?? '')" :alt="viewer.region.textContent" :style="viewerImageStyle" decoding="async" :referrerpolicy="advancedSettings.remoteImagePrivacy ? 'no-referrer' : undefined" @load="fitViewer" /></div>
          <ViewerCode v-else-if="viewer.type === 'code'" :region="viewer.region" :theme-mode="store.activeTheme?.manifest.mode" @copied="notify('代码已复制')" />
          <div v-else class="code-viewer table-viewer" v-html="viewer.region.html" />
        </div>
        <footer class="viewer-footer">
          <div class="viewer-footer-hint"><kbd>ESC</kbd><span>{{ viewerCanPan ? (viewer.type === 'image' ? '滚轮缩放 · 拖动查看 · 双击还原' : '滚轮缩放 · 拖动查看 · 双击还原 · +/- 调整') : '返回正文' }}</span></div>
          <div class="viewer-footer-actions">
            <button v-if="viewer.type === 'mermaid'" type="button" @click="copyViewerSource"><AppIcon name="copy" :size="14" />复制源码</button>
            <button v-if="viewer.type === 'mermaid' && viewerTab === 'preview'" type="button" @click="copyViewerHtml"><AppIcon name="copy" :size="14" />复制 HTML</button>
            <button v-if="viewer.type === 'mermaid'" type="button" @click="exportViewer('svg')"><AppIcon name="download" :size="14" />导出 SVG</button>
            <button v-if="viewer.type === 'mermaid'" type="button" @click="exportViewer('png')"><AppIcon name="download" :size="14" />导出 PNG</button>
            <button v-if="viewer.type === 'mermaid'" type="button" @click="copyRegionAsImage(viewer.region)"><AppIcon name="copy" :size="14" />复制为图片</button>
            <button v-if="viewer.type === 'mermaid'" class="danger-button" type="button" @click="deleteViewerDiagram">删除图表</button>
            <button v-if="viewer.type === 'code' || viewer.type === 'tree' || viewer.type === 'table'" type="button" @click="exportViewer()"><AppIcon name="download" :size="14" />导出文本</button>
            <button v-if="viewer.type === 'table'" type="button" @click="openTableEditor(viewer.region)">编辑表格</button>
          </div>
        </footer>
      </div>
    </div>
    <div v-if="annotationEditor" class="overlay note-overlay" @click.self="annotationEditor = null"><div class="note-dialog"><span class="section-kicker">批注</span><h2>留下一个记号</h2><blockquote>{{ annotationEditor.text }}</blockquote><textarea v-model="annotationNote" autofocus placeholder="记录你的思考……" /><div class="note-colors"><button v-for="color in ['#e1a85b', '#a78bfa', '#76c893', '#75b7d5', '#e98282']" :key="color" type="button" :class="{ selected: annotationColor === color }" :style="{ background: color }" @click="annotationColor = color" /></div><div class="note-actions"><button class="ghost-button" type="button" @click="annotationEditor = null">取消</button><button class="primary-button" type="button" @click="saveCurrentAnnotation">保存批注</button></div></div></div>
    <div v-if="booting" class="app-loading startup-loading" role="status" aria-live="polite">
      <div class="startup-card">
        <div class="startup-stage" aria-hidden="true"><div class="startup-paper startup-paper-back"></div><div class="startup-paper startup-paper-mid"></div><div class="startup-paper startup-paper-main"><b></b><i></i><i></i><i></i><em></em></div><span class="startup-bookmark"></span></div>
        <div class="startup-title-row"><strong>正在恢复阅读空间</strong><span class="startup-dots">...</span></div>
        <small>把文档、位置与阅读状态准备好</small>
        <div class="startup-steps" aria-hidden="true"><span class="startup-step">读取文档</span><span class="startup-step">恢复位置</span><span class="startup-step">准备界面</span></div>
        <div class="startup-progress" aria-hidden="true"><i></i></div>
      </div>
    </div>
    <div v-if="draggingFiles" class="drop-overlay" aria-live="polite"><span><AppIcon name="plus" :size="26" /></span><strong>释放以导入 Markdown</strong><small>支持 .md / .markdown 文件</small></div>
    <div v-if="toast" class="toast" role="status" aria-live="polite">{{ toast }}</div>
  </div>
</template>
