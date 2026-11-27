// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { deleteSystemEntry, listFileSystemEntries } from './fileService'
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
  deleteSystemEntry: vi.fn().mockResolvedValue({ removedImages: 0, failedImages: 0, imageCheckFailed: false }),
  listDirectoryFiles: vi.fn().mockResolvedValue([]),
  listFileSystemEntries: vi.fn().mockResolvedValue([]),
  watchDirectoryPath: vi.fn(),
  watchMarkdownPath: vi.fn(),
}))

it.each([
  { label: '从阅读空间移除', confirm: '确认移除', system: false },
  { label: '从系统删除…', confirm: '永久删除', system: true },
])('confirms $label using the WebView dialog fallback', async ({ label, confirm, system }) => {
  const path = 'E:/notes/delete-test.md'
  vi.mocked(listFileSystemEntries).mockResolvedValue([{ path, name: 'delete-test.md', isDirectory: false }])
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path, source: '# Delete test' }], { persist: false })
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp(App).use(pinia)
  app.mount(host)

  try {
    const row = await vi.waitFor(() => {
      const element = host.querySelector(`[data-filesystem-path="${path}"]`)
      expect(element).toBeTruthy()
      return element!
    })
    const buttonWithText = (selector: string, text: string) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find(button => button.textContent?.trim() === text)

    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    const action = await vi.waitFor(() => {
      const button = buttonWithText('.file-context-menu button', label)
      expect(button).toBeDefined()
      return button!
    })
    action.click()

    const confirmation = await vi.waitFor(() => {
      const button = buttonWithText('.reader-detail-modal.app-dialog-wrap[role="dialog"] button', confirm)
      expect(button).toBeDefined()
      return button!
    })
    expect(store.documents.some(document => document.path === path)).toBe(true)
    expect(deleteSystemEntry).not.toHaveBeenCalled()
    confirmation.click()

    await vi.waitFor(() => expect(store.documents.some(document => document.path === path)).toBe(false))
    if (system) expect(deleteSystemEntry).toHaveBeenCalledExactlyOnceWith(path, false, false, expect.any(Array))
    else expect(deleteSystemEntry).not.toHaveBeenCalled()
  } finally {
    app.unmount()
    host.remove()
    vi.restoreAllMocks()
    vi.mocked(deleteSystemEntry).mockClear()
    localStorage.clear()
  }
})
