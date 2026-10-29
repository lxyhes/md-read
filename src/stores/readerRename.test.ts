import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { parseMarkdown } from '../parser'
import { useReaderStore } from './reader'
import { saveDocument, deleteDocument, loadAnnotations, loadDocumentSnapshots, loadDocumentSnapshotsAsync, saveDocumentSnapshot, getProgress } from '../persistence'
import { createRemoteAssetMap } from '../fileService'

vi.mock('../persistence', () => ({
  deleteAnnotation: vi.fn(), deleteDocument: vi.fn(), getLocalProgress: vi.fn(),
  getProgress: vi.fn(), loadAnnotations: vi.fn(() => []), loadDocumentSnapshots: vi.fn(() => []), loadDocumentSnapshotsAsync: vi.fn(async () => []),
  saveAnnotation: vi.fn(), saveDocument: vi.fn(), saveDocumentSnapshot: vi.fn(), saveProgress: vi.fn(),
}))
vi.mock('../fileService', () => ({
  authorizeMarkdownAssets: vi.fn(), createRemoteAssetMap: vi.fn(), createTauriAssetMap: vi.fn(),
  openMarkdownFile: vi.fn(), openMarkdownFolder: vi.fn(), resolveMarkdownAssetUrl: (_path: string, url: string, assets?: Record<string, string>) => assets?.[url] ?? url,
}))

beforeEach(() => {
  vi.resetAllMocks()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  vi.mocked(getProgress).mockResolvedValue(null)
  vi.mocked(saveDocument).mockResolvedValue()
  vi.mocked(loadAnnotations).mockReturnValue([])
  setActivePinia(createPinia())
})

describe('path-only document rename', () => {
  it('keeps browser image assets available to the editor through rename and clears them on removal', async () => {
    const store = useReaderStore()
    await store.addOpenedFiles([{ path: 'photo.md', source: '![image](cover.png)', assets: { 'cover.png': 'blob:cover' } }])
    const id = store.currentDocumentId!
    expect(store.getDocumentAssets(id)['cover.png']).toBe('blob:cover')
    const renamed = await store.renameDocument(id, 'renamed.md')
    expect(store.getDocumentAssets(id)).toEqual({})
    expect(store.getDocumentAssets(renamed!.id)['cover.png']).toBe('blob:cover')
    await store.removeDocument(renamed!.id)
    expect(store.getDocumentAssets(renamed!.id)).toEqual({})
  })

  it('updates all paths and the current tab before a failed database write settles', async () => {
    const store = useReaderStore()
    const first = parseMarkdown('C:/旧目录/first.md', '# First\n\n![image](https://mmbiz.qpic.cn/example)')
    const current = parseMarkdown('C:/旧目录/current.md', '# Current')
    store.documents = [first, current]
    store.openDocumentIds = [first.id, current.id]
    store.currentDocumentId = current.id
    let rejectWrite!: (error: Error) => void
    vi.mocked(saveDocument).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject }))

    const results = Promise.allSettled([
      store.renameDocument(first.id, 'C:/新目录/first.md'),
      store.renameDocument(current.id, 'C:/新目录/current.md'),
    ])

    expect(store.documents.map(item => item.path)).toEqual(['C:/新目录/first.md', 'C:/新目录/current.md'])
    expect(store.currentDocument?.path).toBe('C:/新目录/current.md')
    expect(store.openDocuments).toHaveLength(2)
    expect(createRemoteAssetMap).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(rejectWrite).toBeTypeOf('function'))
    rejectWrite(new Error('database unavailable'))
    expect((await results).map(item => item.status)).toEqual(['rejected', 'fulfilled'])
    expect(deleteDocument).not.toHaveBeenCalledWith(first.id)
  })

  it('does not delete the saved document when its path is unchanged', async () => {
    const store = useReaderStore()
    const current = parseMarkdown('C:/目录/current.md', '# Current')
    store.documents = [current]
    store.currentDocumentId = current.id
    await store.renameDocument(current.id, current.path)
    expect(deleteDocument).not.toHaveBeenCalled()
  })

  it('keeps reading references and loaded image blobs after a directory rename', async () => {
    const store = useReaderStore()
    const current = parseMarkdown('C:/旧目录/current.md', '# Current\n\n![image](https://mmbiz.qpic.cn/example)', () => 'blob:cached-image')
    store.documents = [current]
    store.currentDocumentId = current.id
    store.activeRegionId = current.regions[0]!.id
    store.focusedRegionId = current.regions[0]!.id
    store.activeHeadingId = current.headings[0]!.id
    store.progress[current.id] = { documentId: current.id, regionId: current.regions[0]!.id, headingId: current.headings[0]!.id, scrollPercent: 42, readingTime: 10, updatedAt: 1 }
    vi.mocked(loadAnnotations).mockReturnValue([{ id: 'annotation', documentId: current.id, regionId: current.regions[0]!.id, selectedText: 'Current', color: 'yellow', note: '', createdAt: 1 }])

    const renamed = await store.renameDocument(current.id, 'C:/新目录/current.md')
    expect(store.activeRegionId).toBe(renamed!.regions[0]!.id)
    expect(store.focusedRegionId).toBe(renamed!.regions[0]!.id)
    expect(store.activeHeadingId).toBe(renamed!.headings[0]!.id)
    expect(store.progress[renamed!.id]?.regionId).toBe(renamed!.regions[0]!.id)
    expect(store.progress[renamed!.id]?.scrollPercent).toBe(42)
    expect(store.annotations[0]?.regionId).toBe(renamed!.regions[0]!.id)
    expect(renamed!.regions[1]!.metadata?.url).toBe('blob:cached-image')
  })
})


describe('restoring saved reader documents', () => {
  it('opens a dragged document even when persistence hits a storage quota', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(saveDocumentSnapshot).mockRejectedValueOnce(new Error('quota exceeded'))
    try {
      const store = useReaderStore()
      await expect(store.addOpenedFiles([{ path: 'dropped.md', source: '# Dropped' }])).resolves.toBe(1)
      expect(store.currentDocument?.path).toBe('dropped.md')
    } finally {
      warn.mockRestore()
    }
  })

  it('rebuilds stale HTML and image URLs before displaying each restored tab', async () => {
    vi.stubGlobal('document', {
      documentElement: { style: { setProperty: vi.fn() } },
      getElementById: () => ({ textContent: '' }),
    })
    const first = parseMarkdown('first.md', '# First\n\n| Label | Value |\n| --- | --- |\n| Direction | **Software** |')
    first.regions[1]!.html = '<table>HTML 已隐藏</table>'
    const imageUrl = 'https://example.com/image.png'
    const second = parseMarkdown('second.md', `# Second\n\n![image](${imageUrl})`, () => 'blob:expired-session')
    vi.mocked(loadDocumentSnapshotsAsync).mockResolvedValue([first, second])
    vi.mocked(createRemoteAssetMap).mockResolvedValue({ [imageUrl]: 'blob:current-session' })
    const store = useReaderStore()

    await store.bootstrap()
    expect(store.currentDocument?.regions[1]?.html).toContain('<strong>Software</strong>')
    expect(store.currentDocument?.regions[1]?.html).not.toContain('HTML 已隐藏')
    expect(createRemoteAssetMap).not.toHaveBeenCalled()

    const opening = store.openDocument(second.id)
    expect(store.currentDocument?.id).toBe(first.id)
    await opening
    expect(store.currentDocument?.id).toBe(second.id)
    expect(store.currentDocument?.regions[1]?.html).toContain('blob:current-session')
    expect(store.currentDocument?.regions[1]?.html).not.toContain('blob:expired-session')
    expect(saveDocumentSnapshot).toHaveBeenCalledTimes(2)
    await store.openDocument(second.id)
    expect(createRemoteAssetMap).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
