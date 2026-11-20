// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))

it('indents skipped heading depths by their actual nesting and collapses the matching branch', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{
    path: 'outline.md',
    source: '### First\n\n##### Child\n\n###### Grandchild\n\n#### Sibling\n\n### Second\n\n#### Second Child',
  }], { persist: false })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  try {
    const outlineTab = await vi.waitFor(() => {
      const button = [...host.querySelectorAll<HTMLButtonElement>('.panel-tabs button')]
        .find(button => button.textContent?.trim() === '大纲')
      expect(button).toBeDefined()
      return button!
    })
    outlineTab.click()
    await nextTick()

    const rows = () => [...host.querySelectorAll<HTMLElement>('.outline-row')].map(row => [
      row.querySelector('.outline-heading-button')?.textContent,
      row.style.getPropertyValue('--outline-level'),
    ])
    expect(rows()).toEqual([['First', '0'], ['Child', '1'], ['Grandchild', '2'], ['Sibling', '1'], ['Second', '0'], ['Second Child', '1']])

    host.querySelector<HTMLButtonElement>('.outline-toggle[aria-label="折叠 Child"]')!.click()
    await nextTick()
    expect(rows()).toEqual([['First', '0'], ['Child', '1'], ['Sibling', '1'], ['Second', '0'], ['Second Child', '1']])

    host.querySelector<HTMLButtonElement>('.outline-toolbar button[aria-label="折叠全部章节"]')!.click()
    await nextTick()
    expect(rows()).toEqual([['First', '0'], ['Second', '0']])

    host.querySelector<HTMLButtonElement>('.outline-toggle[aria-label="展开 Second"]')!.click()
    await nextTick()
    expect(rows()).toEqual([['First', '0'], ['Second', '0'], ['Second Child', '1']])

    host.querySelector<HTMLButtonElement>('.outline-toggle[aria-label="展开 First"]')!.click()
    await nextTick()
    expect(rows()).toEqual([['First', '0'], ['Child', '1'], ['Sibling', '1'], ['Second', '0'], ['Second Child', '1']])

    host.querySelector<HTMLButtonElement>('.outline-toolbar button[aria-label="展开全部章节"]')!.click()
    await nextTick()
    expect(rows()).toHaveLength(6)
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})
