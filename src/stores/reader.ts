import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { deleteAnnotation, deleteDocument, getLocalProgress, getProgress, loadAnnotations, loadDocumentSnapshots, saveAnnotation, saveDocument, saveDocumentSnapshot, saveProgress } from '../persistence'
import { authorizeMarkdownAssets, createTauriAssetMap, openMarkdownFile, openMarkdownFolder, resolveMarkdownAssetUrl, type OpenedFile } from '../fileService'
import { builtInThemes, cssVariables, defaultTokens } from '../themes'
import { interfaceFont } from '../fonts'
const SESSION_KEY = 'moyue:reader-session'
const THEME_KEY = 'moyue:theme'
const DEFAULT_THEME_ID = 'paper-white'

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') as { openDocumentIds?: string[]; currentDocumentId?: string | null }
  } catch {
    return {}
  }
}
import type { Annotation, MoyueTheme, ReaderDocument, ReaderMode, ReaderSelection, ReadingProgress, ViewerState } from '../types'

const sample = `# 一次安静的阅读\n\n墨阅把 Markdown 变成一个可以停留的空间。点击任意段落，进入区域聚焦。\n\n> 阅读不是把文字扫过去，而是给一个想法足够的时间。\n\n## Region Focus\n\n当你点击一个内容区域，其他内容会退到背景里。你可以用方向键在区域之间移动，按 Escape 回到整篇文档。\n\n\`\u0060\u0060typescript\ninterface ReadingRegion {\n  id: string\n  focus(): void\n}\n\`\u0060\u0060\n\n## 一张图表\n\n\`\u0060\u0060mermaid\nflowchart LR\n  A[打开文档] --> B[选择区域]\n  B --> C[沉浸阅读]\n  C --> D[回到正文]\n\`\u0060\u0060\n\n![一块留白](https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80)\n\n## 最后\n\n主题、图表和辅助信息都应该在需要时出现，不需要时安静地退场。`

export const useReaderStore = defineStore('reader', () => {
  const documents = ref<ReaderDocument[]>([])
  const openDocumentIds = ref<string[]>([])
  const currentDocumentId = ref<string | null>(null)
  const mode = ref<ReaderMode>('normal')
  const activeRegionId = ref<string | null>(null)
  const focusedRegionId = ref<string | null>(null)
  const activeHeadingId = ref<string | null>(null)
  const selection = ref<ReaderSelection | null>(null)
  const progress = ref<Record<string, ReadingProgress>>({})
  const annotations = ref<Annotation[]>([])
  const themes = ref<MoyueTheme[]>([...builtInThemes])
  const savedThemeId = localStorage.getItem(THEME_KEY)
  const activeThemeId = ref(savedThemeId && builtInThemes.some((theme) => theme.manifest.id === savedThemeId) ? savedThemeId : DEFAULT_THEME_ID)
  const savedSettings = readSettings()
  const readerSettings = ref({ fontSize: savedSettings.fontSize, lineHeight: savedSettings.lineHeight, width: savedSettings.width, fontFamily: savedSettings.fontFamily, interfaceFontFamily: savedSettings.interfaceFontFamily })
  const currentDocument = computed(() => documents.value.find((document) => document.id === currentDocumentId.value) ?? null)
  const activeTheme = computed(() => themes.value.find((theme) => theme.manifest.id === activeThemeId.value) ?? themes.value[0])

  function persistSession() {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ openDocumentIds: openDocumentIds.value, currentDocumentId: currentDocumentId.value }))
  }

  function applyTheme(theme: MoyueTheme) {
    activeThemeId.value = theme.manifest.id
    localStorage.setItem(THEME_KEY, theme.manifest.id)
    const variables = cssVariables(theme)
    variables['--reader-width'] = `${readerSettings.value.width}px`
    variables['--reader-size'] = `${readerSettings.value.fontSize}px`
    variables['--reader-leading'] = String(readerSettings.value.lineHeight)
    variables['--reader-font'] = readerSettings.value.fontFamily || theme.tokens.reader.fontFamily || defaultTokens.reader.fontFamily
    variables['--ui-font'] = readerSettings.value.interfaceFontFamily || interfaceFont
    variables['--shell-font'] = readerSettings.value.interfaceFontFamily || interfaceFont
    for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value)
  }

  async function parseOpenedFile(file: OpenedFile) {
    const { parseMarkdown } = await import('../parser')
    try { await authorizeMarkdownAssets(file.path) } catch { /* binary loading below does not require the asset protocol */ }
    const urls: string[] = []
    parseMarkdown(file.path, file.source, (url) => { urls.push(url); return url })
    const assets = { ...await createTauriAssetMap(file.path, urls), ...file.assets }
    return parseMarkdown(file.path, file.source, (url) => resolveMarkdownAssetUrl(file.path, url, assets))
  }

  async function addOpenedFiles(files: OpenedFile[]) {
    if (!files.length) return 0
    const openedIds: string[] = []
    for (const file of files) {
      const document = await parseOpenedFile(file)
      documents.value = [...documents.value.filter((item) => item.id !== document.id), document]
      openedIds.push(document.id)
      await saveDocumentSnapshot(document)
      await saveDocument({ id: document.id, path: document.path, title: document.title, sourceHash: document.sourceHash, updatedAt: document.updatedAt, source: document.source })
    }
    openDocumentIds.value = [...new Set([...openDocumentIds.value, ...openedIds])]
    await openDocument(openedIds[openedIds.length - 1])
    return files.length
  }

  async function reloadDocument(file: OpenedFile) {
    const document = await parseOpenedFile(file)
    documents.value = [...documents.value.filter((item) => item.id !== document.id), document]
    await saveDocumentSnapshot(document)
    await saveDocument({ id: document.id, path: document.path, title: document.title, sourceHash: document.sourceHash, updatedAt: document.updatedAt, source: document.source })
    if (currentDocumentId.value === document.id) {
      activeRegionId.value = progress.value[document.id]?.regionId ?? null
      activeHeadingId.value = progress.value[document.id]?.headingId ?? null
    }
    return document
  }

  async function renameDocument(id: string, nextPath: string) {
    const existing = documents.value.find((item) => item.id === id)
    if (!existing) return null
    const document = await parseOpenedFile({ path: nextPath, source: existing.source })
    const previousProgress = progress.value[id] ?? await getProgress(id)
    const previousAnnotations = loadAnnotations(id)
    const wasCurrent = currentDocumentId.value === id
    documents.value = [...documents.value.filter((item) => item.id !== id && item.id !== document.id), document]
    openDocumentIds.value = openDocumentIds.value.map((item) => item === id ? document.id : item)
    if (wasCurrent) {
      currentDocumentId.value = document.id
      annotations.value = previousAnnotations.map((item) => ({ ...item, documentId: document.id }))
    }
    if (previousProgress) {
      const nextProgress = { ...previousProgress, documentId: document.id }
      delete progress.value[id]
      progress.value[document.id] = nextProgress
      await saveProgress(nextProgress)
    }
    for (const annotation of previousAnnotations) await saveAnnotation({ ...annotation, documentId: document.id })
    await saveDocumentSnapshot(document)
    await saveDocument({ id: document.id, path: document.path, title: document.title, sourceHash: document.sourceHash, updatedAt: document.updatedAt, source: document.source })
    await deleteDocument(id)
    persistSession()
    return document
  }

  async function bootstrap() {
    const saved = loadDocumentSnapshots()
    if (saved.length) {
      const needsAssetRefresh = (document: ReaderDocument) => document.regions.some((region) => region.type === 'image' && String(region.metadata?.url ?? '').startsWith('blob:'))
      const stale = saved.filter(needsAssetRefresh)
      if (!stale.length) documents.value = saved
      else {
        const refreshed = await Promise.all(stale.map((document) => parseOpenedFile({ path: document.path, source: document.source })))
        const refreshedById = new Map(refreshed.map((document) => [document.id, document]))
        documents.value = saved.map((document) => refreshedById.get(document.id) ?? document)
        for (const document of refreshed) await saveDocumentSnapshot(document)
      }
    }
    else {
      const { parseMarkdown } = await import('../parser')
      documents.value.push(parseMarkdown('欢迎开始 · Moyue.md', sample))
    }
    const session = readSession()
    const availableIds = new Set(documents.value.map((document) => document.id))
    openDocumentIds.value = (session.openDocumentIds ?? []).filter((id) => availableIds.has(id))
    if (!openDocumentIds.value.length) openDocumentIds.value = [documents.value[0].id]
    applyTheme(activeTheme.value)
    const initialId = session.currentDocumentId && openDocumentIds.value.includes(session.currentDocumentId) ? session.currentDocumentId : openDocumentIds.value[0]
    await openDocument(initialId, { deferProgress: true })
  }

  async function importFiles() { return addOpenedFiles(await openMarkdownFile()) }
  async function importFolder() { return addOpenedFiles(await openMarkdownFolder()) }

  async function openDocument(id: string, options: { deferProgress?: boolean } = {}) {
    const document = documents.value.find((item) => item.id === id)
    if (!document) return
    if (!openDocumentIds.value.includes(id)) openDocumentIds.value.push(id)
    currentDocumentId.value = id
    persistSession()
    mode.value = 'normal'
    activeRegionId.value = null
    activeHeadingId.value = null
    focusedRegionId.value = null
    selection.value = null
    annotations.value = loadAnnotations(id)
    const localProgress = getLocalProgress(id)
    const applyProgress = (saved: ReadingProgress | null) => {
      if (!saved) return
      progress.value[id] = saved
      activeRegionId.value = saved.regionId
      activeHeadingId.value = saved.headingId
    }
    if (localProgress) {
      applyProgress(localProgress)
      return
    }
    if (options.deferProgress) {
      void getProgress(id).then((saved) => {
        if (currentDocumentId.value === id && !getLocalProgress(id)) applyProgress(saved)
      }).catch(() => {})
      return
    }
    applyProgress(await getProgress(id))
  }

  async function closeDocument(id: string) {
    const index = openDocumentIds.value.indexOf(id)
    if (index < 0) return
    const wasCurrent = currentDocumentId.value === id
    openDocumentIds.value = openDocumentIds.value.filter((item) => item !== id)
    if (!wasCurrent) { persistSession(); return }
    const nextId = openDocumentIds.value[index] ?? openDocumentIds.value[index - 1] ?? null
    if (nextId) await openDocument(nextId)
    else {
      currentDocumentId.value = null
      mode.value = 'normal'
      focusedRegionId.value = null
      annotations.value = []
      persistSession()
    }
  }

  async function removeDocument(id: string) {
    const documentIndex = documents.value.findIndex((item) => item.id === id)
    if (documentIndex < 0) return
    const openIndex = openDocumentIds.value.indexOf(id)
    const wasCurrent = currentDocumentId.value === id
    documents.value = documents.value.filter((item) => item.id !== id)
    openDocumentIds.value = openDocumentIds.value.filter((item) => item !== id)
    await deleteDocument(id)
    if (!wasCurrent) {
      persistSession()
      return
    }
    const nextId = openDocumentIds.value[openIndex] ?? openDocumentIds.value[openIndex - 1] ?? null
    if (nextId) await openDocument(nextId)
    else {
      currentDocumentId.value = null
      mode.value = 'normal'
      focusedRegionId.value = null
      annotations.value = []
      persistSession()
    }
  }

  async function setProgress(scrollPercent: number, regionId: string | null, headingId: string | null) {
    if (!currentDocumentId.value) return
    const value = { documentId: currentDocumentId.value, regionId, headingId, scrollPercent, readingTime: progress.value[currentDocumentId.value]?.readingTime ?? 0, updatedAt: Date.now() }
    progress.value[currentDocumentId.value] = value
    await saveProgress(value)
  }

  function setFocusedRegion(id: string) { focusedRegionId.value = id; activeRegionId.value = id }
  function clearFocusedRegion() { focusedRegionId.value = null }
  function focusRegion(id: string) { setFocusedRegion(id); mode.value = 'region-focus' }
  function clearFocus() { focusedRegionId.value = null; activeRegionId.value = null; mode.value = 'normal' }
  function setMode(value: ReaderMode) {
    mode.value = value
    if (value === 'focus' && !focusedRegionId.value && activeRegionId.value) setFocusedRegion(activeRegionId.value)
    if (value !== 'focus' && value !== 'region-focus') focusedRegionId.value = null
  }
  async function addAnnotation(annotation: Annotation) { annotations.value.push(annotation); await saveAnnotation(annotation) }
  async function removeAnnotation(annotation: Annotation) { annotations.value = annotations.value.filter((item) => item.id !== annotation.id); await deleteAnnotation(annotation) }
  function installTheme(theme: MoyueTheme) { themes.value = [...themes.value.filter((item) => item.manifest.id !== theme.manifest.id), theme] }
  function updateSettings(settings: Partial<typeof readerSettings.value>) {
    readerSettings.value = { ...readerSettings.value, ...settings }
    localStorage.setItem('moyue:reader-settings', JSON.stringify(readerSettings.value))
    applyTheme(activeTheme.value)
  }

  const openDocuments = computed(() => openDocumentIds.value.map((id) => documents.value.find((document) => document.id === id)).filter((document): document is ReaderDocument => Boolean(document)))

  return { documents, openDocuments, openDocumentIds, currentDocumentId, currentDocument, mode, activeRegionId, focusedRegionId, activeHeadingId, selection, progress, annotations, themes, activeThemeId, activeTheme, readerSettings, bootstrap, importFiles, importFolder, addOpenedFiles, reloadDocument, renameDocument, openDocument, closeDocument, removeDocument, setProgress, setFocusedRegion, clearFocusedRegion, focusRegion, clearFocus, setMode, addAnnotation, removeAnnotation, applyTheme, installTheme, updateSettings }
})

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('moyue:reader-settings') ?? '{}') as Partial<typeof defaultTokens.reader> & { interfaceFontFamily?: string }
    return { ...defaultTokens.reader, ...saved,
      fontFamily: typeof saved?.fontFamily === 'string' && saved.fontFamily !== defaultTokens.reader.fontFamily ? saved.fontFamily : '',
      interfaceFontFamily: typeof saved?.interfaceFontFamily === 'string' ? saved.interfaceFontFamily : '',
    }
  } catch {
    return { ...defaultTokens.reader, fontFamily: '', interfaceFontFamily: '' }
  }
}
