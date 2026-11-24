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
    const chapterButtons = () => [...host.querySelectorAll<HTMLButtonElement>('#reader-sidebar .outline-heading-button.has-character')]
    expect(chapterButtons().map(button => button.textContent?.trim())).toEqual(['First', 'Second'])
    expect(host.querySelectorAll('.outline-character')).toHaveLength(2)
    expect(host.querySelector('nav[aria-label="章节导航"]')).toBeNull()

    const secondChapter = chapterButtons()[1]
    const secondHeading = store.currentDocument!.headings[4]
    const secondRegion = host.querySelector<HTMLElement>(`[data-region-id="${secondHeading.regionId}"]`)!
    const scroll = vi.spyOn(secondRegion, 'scrollIntoView')
    secondChapter.click()
    await nextTick()
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(secondChapter.getAttribute('aria-current')).toBe('location')

    const rows = () => [...host.querySelectorAll<HTMLElement>('.outline-row')].map(row => [
      row.querySelector('.outline-heading-button')?.textContent?.trim(),
      row.style.getPropertyValue('--outline-level'),
    ])
    expect(rows()).toEqual([['First', '0'], ['Child', '1'], ['Grandchild', '2'], ['Sibling', '1'], ['Second', '0'], ['Second Child', '1']])
    expect([...host.querySelectorAll('.outline-subchapter .outline-heading-label')].map(label => label.textContent)).toEqual(['Child', 'Grandchild', 'Sibling', 'Second Child'])

    host.querySelector<HTMLButtonElement>('.outline-toggle[aria-label="折叠 Child"]')!.click()
    await nextTick()
    expect(rows()).toEqual([['First', '0'], ['Child', '1'], ['Sibling', '1'], ['Second', '0'], ['Second Child', '1']])

    host.querySelector<HTMLButtonElement>('.outline-toolbar button[aria-label="折叠全部章节"]')!.click()
    await nextTick()
    expect(rows()).toEqual([['First', '0'], ['Second', '0']])

    secondChapter.click()
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

    const childHeading = store.currentDocument!.headings[1]
    const childButton = host.querySelector<HTMLButtonElement>(`[data-outline-id="${childHeading.id}"]`)!
    childButton.click()
    await nextTick()
    expect(childButton.getAttribute('aria-current')).toBe('location')
    expect(chapterButtons()[0].classList.contains('active-chapter')).toBe(true)
    expect(chapterButtons()[0].hasAttribute('aria-current')).toBe(false)

    await store.addOpenedFiles([{
      path: 'titled-outline.md',
      source: '# Document title\n\n## Setup\n\n### Install\n\n## Usage',
    }], { persist: false })
    await nextTick()
    expect(chapterButtons().map(button => button.textContent?.trim())).toEqual(['Setup', 'Usage'])
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})
