// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, KeepAlive, nextTick, reactive } from 'vue'
import { parseMarkdown } from '../parser'
import SecondDocumentPane from './SecondDocumentPane.vue'

vi.mock('./RegionBlock.vue', () => ({
  default: { props: ['region'], emits: ['open-link'], template: '<article :data-region-id="region.id">{{ region.textContent }}<a v-if="region.type === \'paragraph\'" href="#target" @click.prevent="$emit(\'open-link\', \'#target\')">跳转</a><a v-if="region.type === \'paragraph\'" href="next.md" @click.prevent="$emit(\'open-link\', \'next.md\')">文件</a></article>' },
}))

let unmount = () => {}
afterEach(() => { unmount(); document.body.innerHTML = '' })

async function chooseDocument(host: HTMLElement, label: string) {
  const trigger = host.querySelector<HTMLElement>('.second-document-doc-select.arco-select-view-single')
  expect(trigger).not.toBeNull()
  trigger!.click()
  await nextTick()
  await nextTick()
  const option = [...document.querySelectorAll<HTMLElement>('.arco-select-option')].find(item => item.textContent?.trim() === label || item.textContent?.includes(label))
  expect(option).not.toBeUndefined()
  option!.click()
  await nextTick()
}

describe('second document pane', () => {
  it('navigates only the right outline, tracks its position, and updates when switching documents', async () => {
    const documents = [parseMarkdown('left.md', '# Left'), parseMarkdown('right.md', '# Right\n\n## Part\n\n### Deep'), parseMarkdown('plain.md', 'No headings')]
    const state = reactive({ documents, currentDocumentId: documents[0].id, themeKey: 'paper-white' })
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(SecondDocumentPane, state) })
    app.mount(host)
    unmount = () => app.unmount()
    const buttons = host.querySelectorAll<HTMLButtonElement>('nav[aria-label="对照文档大纲"] button')
    expect([...buttons].map(button => button.textContent)).toEqual(['Right', 'Part', 'Deep'])
    expect(buttons[1].style.paddingInlineStart).toBe('24px')
    const regions = host.querySelectorAll<HTMLElement>('.reader-viewport [data-region-id]')
    const scrollIntoView = vi.fn()
    regions[2].scrollIntoView = scrollIntoView
    const leftRegion = document.createElement('article')
    leftRegion.dataset.regionId = regions[2].dataset.regionId
    leftRegion.scrollIntoView = vi.fn()
    host.prepend(leftRegion)
    buttons[2].click()
    await nextTick()
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(leftRegion.scrollIntoView).not.toHaveBeenCalled()
    expect(buttons[2].getAttribute('aria-current')).toBe('location')
    regions.forEach((region, index) => { region.getBoundingClientRect = () => ({ top: [-200, 54, 500][index] } as DOMRect) })
    const viewport = host.querySelector<HTMLElement>('.reader-viewport')!
    viewport.style.scrollPaddingTop = '34px'
    viewport.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(buttons[1].getAttribute('aria-current')).toBe('location')
    await chooseDocument(host, 'plain')
    expect(host.querySelector('nav[aria-label="对照文档大纲"]')).toBeNull()
    expect(host.textContent).toContain('这篇文档还没有标题。')
  })

  it('renders a different document, switches it, and falls back when tabs change', async () => {
    const documents = ['First', 'Second', 'Third'].map(name => parseMarkdown(name === 'Second' ? 'Second [00 07](https b.quark.md' : `${name}.md`, `# ${name}\n\n${name} content`))
    const state = reactive({ documents, currentDocumentId: documents[0].id, themeKey: 'paper-white' })
    const onClose = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(SecondDocumentPane, { ...state, onClose }) })
    app.mount(host)
    unmount = () => app.unmount()

    expect(host.textContent).toContain('Second content')
    await nextTick()
    const select = host.querySelector<HTMLElement>('.second-document-doc-select.arco-select-view-single')!
    expect(host.querySelector('.second-document-doc-select .arco-select-view-value')?.textContent?.trim()).toBe('Second')
    expect(host.querySelector<HTMLElement>('.second-document-select')?.title).toBe(documents[1].path)
    select.click()
    await nextTick()
    expect([...document.querySelectorAll('.arco-select-option')].map(option => option.textContent?.trim())).toEqual(['Second', 'Third'])
    document.querySelector<HTMLElement>('.arco-select-option:last-child')!.click()
    await nextTick()
    expect(host.textContent).toContain('Third content')
    expect(host.textContent).not.toContain('Second content')

    state.currentDocumentId = documents[2].id
    await nextTick()
    expect(host.textContent).toContain('First content')
    state.documents = [documents[2], documents[1]]
    await nextTick()
    expect(host.textContent).toContain('Second content')
    host.querySelector<HTMLButtonElement>('[aria-label="退出对照阅读"]')!.click()
    expect(onClose).toHaveBeenCalledOnce()
    state.documents = [documents[2]]
    await nextTick()
    expect(host.querySelector('section')).toBeNull()
  })

  it('restores each document position and keeps links and reading keys in the right pane', async () => {
    const documents = ['First', 'Second', 'Third'].map(name => parseMarkdown(`folder/${name}.md`, '# Target\n\nContent'))
    const state = reactive({ documents, currentDocumentId: documents[0].id, themeKey: 'paper-white' })
    const onActivate = vi.fn()
    const onOpenLink = vi.fn()
    const onKeydown = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    host.addEventListener('keydown', onKeydown)
    const app = createApp({ render: () => h(SecondDocumentPane, { ...state, onActivate, onOpenLink }) })
    app.mount(host)
    unmount = () => app.unmount()
    host.querySelector<HTMLElement>('.reader-viewport')!.scrollTop = 240
    await chooseDocument(host, 'Third')
    await nextTick()
    expect(host.querySelector<HTMLElement>('.reader-viewport')!.scrollTop).toBe(0)
    await chooseDocument(host, 'Second')
    await nextTick()
    expect(host.querySelector<HTMLElement>('.reader-viewport')!.scrollTop).toBe(240)

    const heading = host.querySelector<HTMLElement>('[data-region-id]')!
    const scrollIntoView = vi.fn()
    heading.scrollIntoView = scrollIntoView
    host.querySelector<HTMLAnchorElement>('a[href="#target"]')!.click()
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(onOpenLink).not.toHaveBeenCalled()
    host.querySelector<HTMLAnchorElement>('a[href="next.md"]')!.click()
    expect(onOpenLink).toHaveBeenCalledWith('next.md', expect.objectContaining({ id: documents[1].id }))
    host.querySelector<HTMLButtonElement>('.second-document-activate')!.click()
    expect(onActivate).toHaveBeenCalledWith(documents[1].id)
    heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(onKeydown).not.toHaveBeenCalled()
    heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onKeydown).toHaveBeenCalledOnce()
  })

  it('restores the cached pane after the browser resets its detached scroll container', async () => {
    const documents = ['First', 'Second'].map(name => parseMarkdown(`${name}.md`, '# Heading'))
    const state = reactive({ show: true })
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(KeepAlive, null, { default: () => state.show ? h(SecondDocumentPane, { documents, currentDocumentId: documents[0].id, themeKey: 'paper-white' }) : null }) })
    app.mount(host)
    unmount = () => app.unmount()
    await nextTick()
    const viewport = host.querySelector<HTMLElement>('.reader-viewport')!
    viewport.scrollTop = 320
    viewport.dispatchEvent(new Event('scroll'))
    state.show = false
    await nextTick()
    viewport.scrollTop = 0
    viewport.dispatchEvent(new Event('scroll'))
    state.show = true
    await nextTick()
    await nextTick()
    expect(host.querySelector<HTMLElement>('.reader-viewport')!.scrollTop).toBe(320)
  })
})
