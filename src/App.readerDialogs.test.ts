// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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

const path = 'E:/notes/test.md'
const fallbackDialog = '.reader-detail-modal.app-dialog-wrap[role="dialog"]'
let store: ReturnType<typeof useReaderStore>
let host: HTMLElement
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  vi.mocked(listFileSystemEntries).mockResolvedValue([{ path, name: 'test.md', isDirectory: false }])
  const pinia = createPinia()
  store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path, source: '# Test' }], { persist: false })
  host = document.body.appendChild(document.createElement('div'))
  app = createApp(App).use(pinia)
  app.mount(host)
})

afterEach(() => {
  app.unmount()
  host.remove()
  vi.restoreAllMocks()
  vi.mocked(deleteSystemEntry).mockClear()
  localStorage.clear()
})

function findButton(selector: string, label: string) {
  return vi.waitFor(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find(button => button.textContent?.trim() === label)
    expect(button).toBeDefined()
    return button!
  })
}

async function chooseFileMenuAction(label: string) {
  const row = await vi.waitFor(() => {
    const element = host.querySelector(`[data-filesystem-path="${path}"]`)
    expect(element).toBeTruthy()
    return element!
  })
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
  const action = await findButton('.file-context-menu button', label)
  action.click()
}

it.each([
  { label: '从阅读空间移除', confirm: '确认移除', system: false },
  { label: '从系统删除…', confirm: '永久删除', system: true },
])('confirms $label using the WebView dialog fallback', async ({ label, confirm, system }) => {
  await chooseFileMenuAction(label)
  const confirmation = await findButton(`${fallbackDialog} button`, confirm)
  expect(store.documents.some(document => document.path === path)).toBe(true)
  expect(deleteSystemEntry).not.toHaveBeenCalled()
  confirmation.click()

  await vi.waitFor(() => expect(store.documents.some(document => document.path === path)).toBe(false))
  if (system) expect(deleteSystemEntry).toHaveBeenCalledExactlyOnceWith(path, false, false, expect.any(Array))
  else expect(deleteSystemEntry).not.toHaveBeenCalled()
})

it('opens file properties using the WebView dialog fallback', async () => {
  await chooseFileMenuAction('属性')
  const close = await findButton(`${fallbackDialog} button`, '关闭')
  expect(close.closest('[role="dialog"]')?.textContent).toContain(path)
})

it('opens word count using the WebView dialog fallback', async () => {
  const more = await findButton('button[aria-label="更多文档操作"]', '更多')
  more.click()
  const action = await findButton('button', '字数统计')
  action.click()
  const done = await findButton(`${fallbackDialog} button`, '完成')
  expect(done.closest('[role="dialog"]')?.textContent).toContain('正文字符')
})
