import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { deleteAnnotation, deleteDocument, getLocalProgress, getProgress, loadAnnotations, loadDocumentSnapshots, loadDocumentSnapshotsAsync, saveAnnotation, saveDocument, saveDocumentSnapshot, saveProgress } from '../persistence'
import { authorizeMarkdownAssets, createRemoteAssetMap, createTauriAssetMap, downloadMarkdownImages, openMarkdownFile, openMarkdownFolder, resolveMarkdownAssetUrl, writeMarkdownFile, type OpenedFile } from '../fileService'
import { builtInThemes, cssVariables, defaultTokens } from '../themes'
import { interfaceFont } from '../fonts'
import { parseMarkdown } from '../parser'
const SESSION_KEY = 'moyue:reader-session'
const THEME_KEY = 'moyue:theme'
const THEME_STYLE_ID = 'moyue-active-theme'
const DEFAULT_THEME_ID = 'paper-white'
const READER_WIDTH_VERSION_KEY = 'moyue:reader-width-v2'

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
  const documents = shallowRef<ReaderDocument[]>([])
  const documentAssets = new Map<string, Record<string, string>>()
  const restoredDocumentIds = new Set<string>()
  let openDocumentRequest = 0
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
  const savedTheme = savedThemeId ? builtInThemes.find((theme) => theme.manifest.id === savedThemeId) : null
  const activeThemeId = ref(savedTheme?.manifest.id ?? DEFAULT_THEME_ID)
  if (savedThemeId && !savedTheme) localStorage.setItem(THEME_KEY, DEFAULT_THEME_ID)
  const savedSettings = readSettings()
  const readerSettings = ref({ fontSize: savedSettings.fontSize, lineHeight: savedSettings.lineHeight, width: savedSettings.width, fontFamily: savedSettings.fontFamily, interfaceFontFamily: savedSettings.interfaceFontFamily })
  const currentDocument = computed(() => documents.value.find((document) => document.id === currentDocumentId.value) ?? null)
  const activeTheme = computed(() => themes.value.find((theme) => theme.manifest.id === activeThemeId.value) ?? themes.value[0])

  function persistSession() {
    try {
      const settings = JSON.parse(localStorage.getItem('moyue:advanced-settings') ?? '{}') as { rememberRecent?: boolean }
      if (settings.rememberRecent === false) { localStorage.removeItem(SESSION_KEY); return }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ openDocumentIds: openDocumentIds.value, currentDocumentId: currentDocumentId.value }))
    } catch (error) {
      // A full browser store must not prevent the current document from opening.
      console.warn('无法保存阅读会话，本次仍继续打开文档', error)
    }
  }

  function applyTheme(theme: MoyueTheme, adoptReaderSettings = false) {
    const existing = themes.value.some((item) => item.manifest.id === theme.manifest.id)
    themes.value = existing
      ? themes.value.map((item) => item.manifest.id === theme.manifest.id ? theme : item)
      : [...themes.value, theme]
    activeThemeId.value = theme.manifest.id
    localStorage.setItem(THEME_KEY, theme.manifest.id)
    if (adoptReaderSettings) {
      const { width, fontSize, lineHeight } = theme.tokens.reader
      readerSettings.value = { ...readerSettings.value, width, fontSize, lineHeight, fontFamily: '' }
      localStorage.setItem('moyue:reader-settings', JSON.stringify(readerSettings.value))
    }
    const variables = cssVariables(theme)
    variables['--reader-width'] = `${readerSettings.value.width}px`
    variables['--reader-size'] = `${readerSettings.value.fontSize}px`
    variables['--reader-leading'] = String(readerSettings.value.lineHeight)
    variables['--reader-gap'] = `${defaultTokens.reader.paragraphGap}px`
    variables['--reader-font'] = readerSettings.value.fontFamily || defaultTokens.reader.fontFamily
    variables['--ui-font'] = readerSettings.value.interfaceFontFamily || interfaceFont
    variables['--shell-font'] = readerSettings.value.interfaceFontFamily || interfaceFont
    const themeRoots = [document.documentElement, document.body].filter((element): element is HTMLElement => Boolean(element))
    for (const root of themeRoots) for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value)
    let style = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = THEME_STYLE_ID
      document.head.append(style)
    }
    style.textContent = [theme.componentsCss, theme.codeCss, theme.mermaidCss].filter(Boolean).join('\n')
  }

  async function parseOpenedFile(file: OpenedFile) {
    const { parseMarkdown } = await import('../parser')
    try { await authorizeMarkdownAssets(file.path) } catch { /* binary loading below does not require the asset protocol */ }
    const urls: string[] = []
    const firstDocument = parseMarkdown(file.path, file.source, (url) => { urls.push(url); return url })
    const hasImage = firstDocument.regions.some((region) => region.type === 'image' || /<img\b/i.test(region.html))
    if (!hasImage) { documentAssets.delete(firstDocument.id); return firstDocument }
    const assets = { ...documentAssets.get(firstDocument.id), ...await createTauriAssetMap(file.path, urls), ...await createRemoteAssetMap(urls), ...file.assets }
    documentAssets.set(firstDocument.id, assets)
    const hasPotentialLocalAsset = urls.some((url) => {
      const value = url.trim()
      return Boolean(value) && !value.startsWith('#') && !/^(?:https?:|mailto:|tel:|data:|blob:|\/\/)/i.test(value)
    })
    if (!Object.keys(assets).length && !hasPotentialLocalAsset) return firstDocument
    return parseMarkdown(file.path, file.source, (url) => resolveMarkdownAssetUrl(file.path, url, assets))
  }

  async function addOpenedFiles(files: OpenedFile[], options: { persist?: boolean } = {}) {
    if (!files.length) return 0
    const openedIds: string[] = []
    for (const originalFile of files) {
      let file = originalFile
      const normalizedPath = file.path.replace(/\\/g, '/')
      const hasSavedDirectory = normalizedPath.startsWith('/') || /^[A-Za-z]:\//.test(normalizedPath)
      if (hasSavedDirectory) {
        try {
          const relativePathPrefix = (() => {
            try { return JSON.parse(localStorage.getItem('moyue:advanced-settings') ?? '{}').relativeImagePathPrefix === true }
            catch { return false }
          })()
          const localized = await downloadMarkdownImages(file.path, file.source, relativePathPrefix)
          if (localized.count) {
            await writeMarkdownFile(file.path, localized.source, file.source)
            file = { ...file, source: localized.source }
          }
        } catch (error) {
          console.warn(`导入时无法将远程图片保存到 Markdown 同目录：${file.path}`, error)
        }
      }
      const document = await parseOpenedFile(file)
      documents.value = [...documents.value.filter((item) => item.id !== document.id), document]
      openedIds.push(document.id)
      if (options.persist !== false) {
        try { await saveDocumentSnapshot(document) }
        catch (error) { console.warn('无法持久化 Markdown 快照，本次仍继续打开文档', error) }
        try { await saveDocument({ id: document.id, path: document.path, title: document.title, sourceHash: document.sourceHash, updatedAt: document.updatedAt, source: document.source }) }
        catch (error) { console.warn('无法持久化 Markdown 元数据，本次仍继续打开文档', error) }
      }
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

  async function replaceDocumentSource(id: string, source: string) {
    const existing = documents.value.find((item) => item.id === id)
    if (!existing) return null
    const document = await parseOpenedFile({ path: existing.path, source })
    documents.value = [...documents.value.filter((item) => item.id !== id), document]
    await saveDocumentSnapshot(document)
    await saveDocument({ id: document.id, path: document.path, title: document.title, sourceHash: document.sourceHash, updatedAt: document.updatedAt, source: document.source })
    if (currentDocumentId.value === id) {
      annotations.value = loadAnnotations(id)
      activeRegionId.value = progress.value[id]?.regionId ?? null
      activeHeadingId.value = progress.value[id]?.headingId ?? null
    }
    return document
  }

  async function renameDocument(id: string, nextPath: string, nextSource?: string) {
    const existing = documents.value.find((item) => item.id === id)
    if (!existing) return null
    // A path-only change must not wait for image downloads or a database read.
    const document = nextSource === undefined
      ? parseMarkdown(nextPath, existing.source, url => resolveMarkdownAssetUrl(nextPath, url))
      : await parseOpenedFile({ path: nextPath, source: nextSource })
    const previousProgress = progress.value[id] ?? (nextSource === undefined ? getLocalProgress(id) : await getProgress(id))
    const regionIds = new Map(existing.regions.map((region, index) => [region.id, document.regions[index]?.id]))
    const headingIds = new Map(existing.headings.map((heading, index) => [heading.id, document.headings[index]?.id]))
    const previousAnnotations = loadAnnotations(id).map(annotation => ({
      ...annotation, regionId: regionIds.get(annotation.regionId) ?? annotation.regionId,
    }))
    if (nextSource === undefined) {
      const previousAssets = documentAssets.get(id)
      if (previousAssets) documentAssets.set(document.id, previousAssets)
      // Keep already loaded image blobs while rebasing local assets to the new directory.
      document.regions.forEach((region, index) => {
        const previous = existing.regions[index]
        if (region.type === 'image' && previous && String(previous.metadata?.url).startsWith('blob:')) {
          region.html = previous.html
          region.metadata = previous.metadata
        }
      })
    }
    if (id !== document.id) documentAssets.delete(id)
    const wasCurrent = currentDocumentId.value === id
    documents.value = [...documents.value.filter((item) => item.id !== id && item.id !== document.id), document]
    openDocumentIds.value = openDocumentIds.value.map((item) => item === id ? document.id : item)
    if (wasCurrent) {
      currentDocumentId.value = document.id
      annotations.value = previousAnnotations.map((item) => ({ ...item, documentId: document.id }))
      activeRegionId.value = regionIds.get(activeRegionId.value ?? '') ?? null
      focusedRegionId.value = regionIds.get(focusedRegionId.value ?? '') ?? null
      activeHeadingId.value = headingIds.get(activeHeadingId.value ?? '') ?? null
    }
    persistSession()
    await saveDocumentSnapshot(document)
    if (nextSource === undefined) {
      try { await authorizeMarkdownAssets(nextPath) } catch { /* Keep the path update even if asset authorization fails. */ }
    }
    if (previousProgress) {
      const nextProgress = {
        ...previousProgress, documentId: document.id,
        regionId: regionIds.get(previousProgress.regionId ?? '') ?? null,
        headingId: headingIds.get(previousProgress.headingId ?? '') ?? null,
      }
      delete progress.value[id]
      progress.value[document.id] = nextProgress
      await saveProgress(nextProgress)
    }
    for (const annotation of previousAnnotations) await saveAnnotation({ ...annotation, documentId: document.id })
    await saveDocument({ id: document.id, path: document.path, title: document.title, sourceHash: document.sourceHash, updatedAt: document.updatedAt, source: document.source })
    if (id !== document.id) await deleteDocument(id)
    persistSession()
    return document
  }

  async function bootstrap() {
    applyTheme(activeTheme.value)
    const saved = await (typeof loadDocumentSnapshotsAsync === 'function' ? loadDocumentSnapshotsAsync() : loadDocumentSnapshots())
    const session = readSession()
    if (saved.length) {
      documents.value = saved.map((document) => {
        if (document.regions.length || !document.source) return document
        try { return parseMarkdown(document.path, document.source) }
        catch { return document }
      })
      saved.forEach((document) => restoredDocumentIds.add(document.id))
    }
    else {
      const { parseMarkdown } = await import('../parser')
      documents.value = [parseMarkdown('欢迎开始 · Moyue.md', sample)]
    }
    const availableIds = new Set(documents.value.map((document) => document.id))
    openDocumentIds.value = (session.openDocumentIds ?? []).filter((id) => availableIds.has(id))
    if (!openDocumentIds.value.length) openDocumentIds.value = [documents.value[0].id]
    const initialId = session.currentDocumentId && openDocumentIds.value.includes(session.currentDocumentId) ? session.currentDocumentId : openDocumentIds.value[0]
    await openDocument(initialId, { deferProgress: true })
  }

  async function importFiles() { return addOpenedFiles(await openMarkdownFile()) }
  async function importFolder() { return addOpenedFiles(await openMarkdownFolder()) }

  async function openDocument(id: string, options: { deferProgress?: boolean } = {}) {
    const document = documents.value.find((item) => item.id === id)
    if (!document) return
    const request = ++openDocumentRequest
    const needsRestoreRefresh = restoredDocumentIds.has(id)
    if (needsRestoreRefresh && !options.deferProgress) {
      restoredDocumentIds.delete(id)
      try {
        const refreshed = await parseOpenedFile({ path: document.path, source: document.source })
        if (documents.value.includes(document)) {
          documents.value = documents.value.map((item) => item.id === id ? refreshed : item)
          await saveDocumentSnapshot(refreshed)
        }
      } catch {
        // Keep the persisted snapshot available when a local asset cannot be refreshed.
      }
      if (request !== openDocumentRequest) return
    }
    const keepCleanMode = mode.value === 'clean'
    if (!openDocumentIds.value.includes(id)) openDocumentIds.value.push(id)
    currentDocumentId.value = id
    persistSession()
    mode.value = keepCleanMode ? 'clean' : 'normal'
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
    } else if (options.deferProgress) {
      void getProgress(id).then((saved) => {
        if (currentDocumentId.value === id && !getLocalProgress(id)) applyProgress(saved)
      }).catch(() => {})
    } else {
      applyProgress(await getProgress(id))
    }
    if (needsRestoreRefresh && options.deferProgress) {
      restoredDocumentIds.delete(id)
      try {
        const refreshed = await parseOpenedFile({ path: document.path, source: document.source })
        const latest = documents.value.find((item) => item.id === id)
        if (latest && latest.sourceHash === document.sourceHash) {
          documents.value = documents.value.map((item) => item.id === id ? refreshed : item)
          await saveDocumentSnapshot(refreshed)
        }
      } catch {
        // Keep the persisted snapshot visible when a local asset cannot be refreshed.
      }
    }
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
    documentAssets.delete(id)
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

  return { documents, openDocuments, openDocumentIds, currentDocumentId, currentDocument, mode, activeRegionId, focusedRegionId, activeHeadingId, selection, progress, annotations, themes, activeThemeId, activeTheme, readerSettings, bootstrap, importFiles, importFolder, addOpenedFiles, reloadDocument, replaceDocumentSource, renameDocument, openDocument, closeDocument, removeDocument, setProgress, setFocusedRegion, clearFocusedRegion, focusRegion, clearFocus, setMode, addAnnotation, removeAnnotation, applyTheme, installTheme, updateSettings, getDocumentAssets: (id: string) => documentAssets.get(id) ?? {} }
})

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('moyue:reader-settings') ?? '{}') as Partial<typeof defaultTokens.reader> & { interfaceFontFamily?: string }
    const legacyDefaultReaderFonts = new Set(['Iowan Old Style, Palatino Linotype, Georgia, serif'])
    const savedReaderFont = typeof saved?.fontFamily === 'string' ? saved.fontFamily.trim() : ''
    if (!localStorage.getItem(READER_WIDTH_VERSION_KEY)) {
      if (typeof saved.width === 'number') saved.width = Math.min(1280, saved.width + 240)
      localStorage.setItem(READER_WIDTH_VERSION_KEY, '1')
      localStorage.setItem('moyue:reader-settings', JSON.stringify(saved))
    }
    return { ...defaultTokens.reader, ...saved,
      fontFamily: savedReaderFont && savedReaderFont !== defaultTokens.reader.fontFamily && !legacyDefaultReaderFonts.has(savedReaderFont) ? savedReaderFont : '',
      interfaceFontFamily: typeof saved?.interfaceFontFamily === 'string' ? saved.interfaceFontFamily : '',
    }
  } catch {
    return { ...defaultTokens.reader, fontFamily: '', interfaceFontFamily: '' }
  }
}
