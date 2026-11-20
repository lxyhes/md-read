// @vitest-environment happy-dom
import { createPinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))

it('dismisses the selection toolbar without exiting clean reading mode or blocking toolbar actions', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: 'selection.md', source: 'Select this text.' }], { persist: false })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  const selection = window.getSelection()!
  const toolbar = () => host.querySelector<HTMLElement>('.selection-toolbar')
  try {
    const paragraph = await vi.waitFor(() => {
      const element = host.querySelector('.reader-viewport [data-region-id] p')
      expect(element).not.toBeNull()
      return element!
    })
    async function selectText() {
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      selection.addRange(range)
      paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      await vi.waitFor(() => expect(toolbar()).not.toBeNull())
    }

    await selectText()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(toolbar()).toBeNull()
    expect(selection.rangeCount).toBe(0)

    store.setMode('clean')
    await nextTick()
    await selectText()
    expect(store.mode).toBe('clean')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await nextTick()
    expect(toolbar()).toBeNull()
    expect(selection.rangeCount).toBe(0)
    expect(store.mode).toBe('clean')

    await selectText()
    const aiButton = [...toolbar()!.querySelectorAll('button')].find((button) => button.textContent === '问 AI')!
    aiButton.click()
    const aiMenu = await vi.waitFor(() => {
      const menu = document.querySelector('.selection-ai-menu')
      expect(menu).not.toBeNull()
      return menu!
    })
    aiMenu.querySelector('button')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(toolbar()).not.toBeNull()

    const closeButton = toolbar()!.querySelector<HTMLButtonElement>('[aria-label="关闭选区工具栏"]')!
    closeButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    closeButton.click()
    await nextTick()
    expect(toolbar()).toBeNull()
    expect(selection.rangeCount).toBe(0)
  } finally {
    selection.removeAllRanges()
    app.unmount()
    host.remove()
    localStorage.clear()
    vi.restoreAllMocks()
  }
})
