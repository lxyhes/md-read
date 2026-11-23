// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { listFileSystemEntries, moveFilePath } from './fileService'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))
vi.mock('@tauri-apps/api/core', async importOriginal => ({
  ...await importOriginal<typeof import('@tauri-apps/api/core')>(),
  isTauri: () => true,
  invoke: vi.fn(async (command, args) => command === 'tracked_directory' ? args.path : []),
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn().mockResolvedValue({}) }) },
}))
vi.mock('./fileService', async importOriginal => ({
  ...await importOriginal<typeof import('./fileService')>(),
  listDirectoryFiles: vi.fn().mockResolvedValue([]),
  listFileSystemEntries: vi.fn(),
  moveFilePath: vi.fn(),
  watchDirectoryPath: vi.fn(),
  watchMarkdownPath: vi.fn(),
}))

it('moves an open file from the tree into a collapsed folder and keeps the tree rooted', async () => {
  const root = 'E:/notes'
  const source = `${root}/draft.md`
  const folder = `${root}/archive`
  const destination = `${folder}/draft.md`
  let moved = false
  vi.mocked(listFileSystemEntries).mockImplementation(async path => {
    const file = { path: moved ? destination : source, name: 'draft.md', isDirectory: false }
    if (path === root) return [{ path: folder, name: 'archive', isDirectory: true }, ...(moved ? [] : [file])]
    return path === folder && moved ? [file] : []
  })
  vi.mocked(moveFilePath).mockImplementation(async () => { moved = true; return null })

  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: source, source: '# Draft' }], { persist: false })
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp(App).use(pinia)
  app.mount(host)
  const row = (path: string) => host.querySelector<HTMLButtonElement>(`[data-filesystem-path="${path}"]`)
  const pointer = (element: HTMLElement, type: string, clientX: number) => {
    element.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerType: 'mouse', pointerId: 1, clientX }))
  }
  try {
    await vi.waitFor(() => expect(row(source)).not.toBeNull())
    const tree = host.querySelector<HTMLElement>('.filesystem-tree')!
    tree.setPointerCapture = vi.fn()
    const hitTest = vi.spyOn(document, 'elementFromPoint').mockReturnValue(row(folder))

    pointer(row(source)!, 'pointerdown', 10)
    pointer(tree, 'pointermove', 12)
    pointer(tree, 'pointerup', 12)
    expect(moveFilePath).not.toHaveBeenCalled()

    pointer(row(source)!, 'pointerdown', 10)
    pointer(tree, 'pointermove', 30)
    await nextTick()
    expect(row(folder)?.classList.contains('drop-target')).toBe(true)
    pointer(tree, 'pointercancel', 30)
    await nextTick()
    expect(row(folder)?.classList.contains('drop-target')).toBe(false)
    expect(moveFilePath).not.toHaveBeenCalled()

    hitTest.mockReturnValue(row(root))
    pointer(row(source)!, 'pointerdown', 10)
    pointer(tree, 'pointermove', 30)
    await nextTick()
    expect(row(root)?.classList.contains('drop-target')).toBe(false)
    pointer(tree, 'pointerup', 30)
    expect(moveFilePath).not.toHaveBeenCalled()

    hitTest.mockReturnValue(row(folder))
    pointer(row(source)!, 'pointerdown', 10)
    pointer(tree, 'pointermove', 30)
    pointer(tree, 'pointerup', 40)

    await vi.waitFor(() => {
      expect(moveFilePath).toHaveBeenCalledExactlyOnceWith(source, destination)
      expect(store.currentDocument?.path).toBe(destination)
      expect(row(source)).toBeNull()
      expect(row(root)).not.toBeNull()
      expect(row(destination)?.classList.contains('selected')).toBe(true)
    })
  } finally {
    app.unmount()
    host.remove()
    vi.restoreAllMocks()
    localStorage.clear()
  }
})
