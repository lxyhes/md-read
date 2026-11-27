// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { createMarkdownFile, listFileSystemEntries, readMarkdownPath } from './fileService'
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
  createMarkdownFile: vi.fn(),
  readMarkdownPath: vi.fn(),
  listDirectoryFiles: vi.fn().mockResolvedValue([]),
  listFileSystemEntries: vi.fn(),
  watchDirectoryPath: vi.fn(),
  watchMarkdownPath: vi.fn(),
}))

it('selects the new Markdown in a collapsed folder and opens a writable editor', async () => {
  const root = 'E:/notes'
  const folder = `${root}/project`
  const originalPath = `${root}/index.md`
  const newPath = `${folder}/draft.md`
  const originalSource = '# Index'
  const newSource = '# draft\n\n'
  const entry = (path: string, isDirectory: boolean) => ({ path, name: path.split('/').pop()!, isDirectory })
  let created = false
  vi.mocked(listFileSystemEntries).mockImplementation(async path => {
    if (path === root) return [entry(folder, true), entry(originalPath, false)]
    return path === folder && created ? [entry(newPath, false)] : []
  })
  vi.mocked(createMarkdownFile).mockImplementation(async () => { created = true })
  vi.mocked(readMarkdownPath).mockResolvedValue(newSource)
  localStorage.setItem('moyue:editor-mode', 'preview')

  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: originalPath, source: originalSource }], { persist: false })
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp(App).use(pinia)
  app.mount(host)
  const row = (path: string) => host.querySelector(`[data-filesystem-path="${path}"]`)
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')

  try {
    await vi.waitFor(() => expect(row(folder)?.getAttribute('aria-expanded')).toBe('false'))
    row(folder)!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    const create = await vi.waitFor(() => {
      const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.trim() === '新建文件')
      expect(item).toBeDefined()
      return item!
    })
    create.click()
    const dialog = await vi.waitFor(() => {
      const element = document.querySelector('[role="dialog"]')
      expect(element?.querySelector('input')).toBeTruthy()
      return element!
    })
    const input = dialog.querySelector('input')!
    input.value = 'draft.md'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    const confirm = [...dialog.querySelectorAll('button')].find(button => button.textContent?.trim() === '新建')!
    confirm.click()

    await vi.waitFor(() => {
      expect(createMarkdownFile).toHaveBeenCalledExactlyOnceWith(newPath, newSource)
      expect(store.currentDocument?.path).toBe(newPath)
      expect(row(folder)?.getAttribute('aria-expanded')).toBe('true')
      expect(row(newPath)?.getAttribute('aria-current')).toBe('page')
      expect(scroll.mock.contexts).toContain(row(newPath))
      expect(host.querySelector('.editor-mode-rich .cm-content[contenteditable="true"]')?.textContent).toContain('draft')
    })
  } finally {
    app.unmount()
    host.remove()
    vi.restoreAllMocks()
    localStorage.clear()
  }
})
