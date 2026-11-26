// @vitest-environment happy-dom
import { invoke } from '@tauri-apps/api/core'
import { EditorView } from '@codemirror/view'
import { createPinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import App from './App.vue'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))
vi.mock('@tauri-apps/api/core', async importOriginal => ({
  ...await importOriginal<typeof import('@tauri-apps/api/core')>(),
  invoke: vi.fn(),
}))

let unmount = () => {}
const ignoreSynchronousSelectionChange = (event: Event) => event.stopImmediatePropagation()
afterEach(() => {
  unmount()
  document.removeEventListener('selectionchange', ignoreSynchronousSelectionChange, true)
  document.body.replaceChildren()
  localStorage.clear()
  vi.resetAllMocks()
})

it.each(['files', 'native', 'html'] as const)('pastes an image from %s at the editor selection', async kind => {
  // Happy DOM fires selectionchange during CodeMirror's synchronous view update.
  document.addEventListener('selectionchange', ignoreSynchronousSelectionChange, true)
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXFcAAAAASUVORK5CYII='
  const bytes = Uint8Array.from(atob(png), character => character.charCodeAt(0))
  const clipboard = new DataTransfer()
  if (kind === 'files') {
    Object.defineProperty(clipboard, 'files', { value: [new File([bytes], 'image.png', { type: 'image/png' })] })
  } else if (kind === 'native') {
    clipboard.setData('text/html', '<img src="blob:https://example.com/image">')
    vi.mocked(invoke).mockResolvedValue({ bytes: [...bytes], mime: 'image/png' })
  } else {
    clipboard.setData('text/html', '<img src="https://example.com/image.png">')
  }

  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: `paste-test-${kind}.md`, source: '之前\n替换\n之后' }], { persist: false })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  unmount = () => app.unmount()
  const edit = await vi.waitFor(() => {
    const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === '编辑')
    expect(button).toBeDefined()
    return button!
  })
  edit.click()
  const editor = await vi.waitFor(() => {
    const element = host.querySelector<HTMLElement>('.cm-editor')
    expect(element).not.toBeNull()
    return EditorView.findFromDOM(element!)!
  })
  editor.dispatch({ selection: { anchor: 3, head: 5 } })

  editor.contentDOM.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, cancelable: true, bubbles: true }))

  const markdown = kind === 'html' ? '![](https://example.com/image.png)' : `![剪贴板图片](data:image/png;base64,${png})`
  await vi.waitFor(() => expect(editor.state.doc.toString()).toBe(`之前\n${markdown}\n之后`))
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'read_clipboard_image')).toHaveLength(kind === 'native' ? 1 : 0)
})
