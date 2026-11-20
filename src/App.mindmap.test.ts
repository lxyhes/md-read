// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))

it.each([
  { tab: '思维导图', branch: '.tree-branch-toggle' },
  { tab: '并排', branch: '.reader-mindmap summary' },
])('opens the shared image viewer from $tab', async ({ tab, branch }) => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  const url = 'blob:https://moyue.example/preview'
  await store.addOpenedFiles([{
    path: 'notes/design.md',
    source: '# Design\n\n## Reference\n\n![Preview](./images/example.png)',
    assets: { 'notes/images/example.png': url },
  }], { persist: false })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  try {
    const viewButton = await vi.waitFor(() => {
      const button = [...host.querySelectorAll<HTMLButtonElement>('.reader-display-switch button')]
        .find(button => button.textContent?.trim() === tab)
      expect(button).toBeDefined()
      return button!
    })
    viewButton.click()
    await nextTick()
    host.querySelector<HTMLElement>(branch)!.click()
    await nextTick()
    host.querySelector<HTMLElement>('.tree-summary-leaf')!.click()
    await nextTick()
    const previewButton = document.querySelector<HTMLButtonElement>('.tree-summary-markdown button[aria-label="放大查看 Preview"]')!
    expect(previewButton).not.toBeNull()
    previewButton.querySelector('img')!.click()
    await nextTick()

    const image = document.querySelector('.viewer-overlay .image-viewer img')
    expect(image?.getAttribute('src')).toBe(url)
    expect(image?.getAttribute('alt')).toBe('Preview')
    expect(document.querySelector('.tree-summary-popover')).toBeNull()
    document.querySelector<HTMLButtonElement>('.viewer-overlay button[aria-label="关闭查看器"]')!.click()
    await nextTick()
    expect(document.querySelector('.viewer-overlay')).toBeNull()
    expect(host.querySelector('.tree-summary-leaf')).not.toBeNull()
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})
