// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { renderMarkdownFragment } from './fragment'
import { parseMarkdown } from '../parser'
import RegionBlock from '../components/RegionBlock.vue'
import TreeDiagram from '../components/TreeDiagram.vue'
import { markdownToTree } from '../asciiDiagram'
import { resolveMarkdownAssetUrl } from '../fileService'

it.each(['horizontal', 'compact'] as const)('renders a relative image in the %s mindmap using the same asset as the reader', async (mode) => {
  const path = 'notes/design.md'
  const source = '# Design\n\n## Reference\n\n![Preview](./images/example.png)'
  const imageUrl = 'blob:https://moyue.example/image'
  const resolveUrl = (url: string) => resolveMarkdownAssetUrl(path, url, { 'notes/images/example.png': imageUrl })
  const region = parseMarkdown(path, source, resolveUrl).regions.find(region => region.type === 'image')!
  const node = markdownToTree(source, 'Design')!
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    render: () => [
      h(RegionBlock, { region, focused: false, active: false }),
      h(TreeDiagram, { node, root: true, [mode]: true, resolveUrl }),
    ],
  })
  app.mount(host)
  try {
    expect(host.querySelector('.image-region img')?.getAttribute('src')).toBe(imageUrl)
    host.querySelector<HTMLElement>(mode === 'horizontal' ? '.tree-branch-toggle' : 'summary')!.click()
    await nextTick()
    const summary = host.querySelector<HTMLElement>('.tree-summary-leaf')!
    expect(summary.textContent).toContain('图片')
    summary.click()
    await nextTick()
    const image = document.querySelector('.tree-summary-markdown img')
    expect(image?.getAttribute('src')).toBe(imageUrl)
    expect(image?.getAttribute('alt')).toBe('Preview')
  } finally {
    app.unmount()
    host.remove()
  }
})

it('lets readers collapse and reopen a plain directory tree', async () => {
  const [region] = parseMarkdown('files.md', '├── 资料\n│   └── 笔记.txt\n└── 说明').regions
  const host = document.createElement('div')
  const app = createApp({ render: () => h(RegionBlock, { region, focused: false, active: false }) })
  app.mount(host)
  try {
    const rootToggle = host.querySelector<HTMLButtonElement>('.tree-root')!
    const listing = host.querySelector<HTMLElement>('.tree-root-children')!
    expect(rootToggle.getAttribute('aria-expanded')).toBe('true')
    const folder = host.querySelector<HTMLDetailsElement>('details')!
    const folderToggle = folder.querySelector<HTMLElement>('summary')!
    expect(folderToggle.textContent).toBe('资料')
    expect(folder.open).toBe(true)
    expect(folder.textContent).toContain('笔记.txt')
    folderToggle.click()
    expect(folder.open).toBe(false)

    rootToggle.click()
    await nextTick()
    expect(rootToggle.getAttribute('aria-expanded')).toBe('false')
    expect(listing.style.display).toBe('none')

    rootToggle.click()
    await nextTick()
    expect(listing.style.display).toBe('')
    expect(folder.open).toBe(false)
    folderToggle.click()
    expect(folder.open).toBe(true)
  } finally {
    app.unmount()
  }
})

it('keeps Markdown table alignment in reading view and example previews', () => {
  const source = '| 左 | 中 | 右 | 默认 |\n| :--- | :---: | ---: | --- |\n| A | B | C | D |'
  for (const html of [parseMarkdown('table.md', source).regions[0].html, renderMarkdownFragment(source)]) {
    const root = document.createElement('div')
    root.innerHTML = html
    const alignments = ['left', 'center', 'right', '']
    expect(Array.from(root.querySelectorAll<HTMLTableCellElement>('th, td'), cell => cell.style.textAlign)).toEqual([...alignments, ...alignments])
  }
})

describe('ordered list numbering', () => {
  it.each([0, 22])('keeps a list starting at %i in reader and fragment rendering', start => {
    const source = `${start}. 第一项\n${start + 1}. 第二项`
    const reader = parseMarkdown('numbered.md', source)
    for (const html of [reader.regions[0].html, renderMarkdownFragment(source)]) {
      const root = document.createElement('div')
      root.innerHTML = html
      expect(root.querySelector('ol')?.start).toBe(start)
      expect(root.querySelectorAll('ol > li')).toHaveLength(2)
    }
    expect(reader.source).toBe(source)
  })

  it('keeps separate list starts after headings and paragraphs', () => {
    const source = '## 21. 标题\n\n22. 知人善任\n\n中间段落\n\n23. 客户复购'
    const reader = parseMarkdown('separate-lists.md', source)
    const root = document.createElement('div')
    root.innerHTML = reader.regions.map(region => region.html).join('')
    expect([...root.querySelectorAll('ol')].map(list => list.start)).toEqual([22, 23])
  })

  it('keeps nested ordered lists independent and default lists starting at one', () => {
    const root = document.createElement('div')
    root.innerHTML = renderMarkdownFragment('22. 外层\n\n    3. 内层\n    4. 后续\n\n23. 外层后续\n\n段落\n\n1. 普通列表')
    expect([...root.querySelectorAll('ol')].map(list => list.start)).toEqual([22, 3, 1])
  })

  it.each([
    { source: '20. 第一章节 00:01\n    - 第一章内容\n21. 第二章节 00:02\n    - 第二章内容', starts: [20, 21] },
    { source: '20. 第一章节 00:01\n21. 第一章内容\n22. 第二章节 00:02\n23. 第二章内容', starts: [21, 23] },
  ])('keeps original numbering when timestamped chapters split a list', ({ source, starts }) => {
    const reader = parseMarkdown('chapters.md', source)
    const root = document.createElement('div')
    root.innerHTML = reader.regions.map(region => region.html).join('')
    expect([...root.querySelectorAll<HTMLOListElement>(':scope > ol')].map(list => list.start)).toEqual(starts)
  })
})

describe('raw Markdown HTML sanitization', () => {
  it('renders comparison paragraphs with the reader layout', () => {
    const html = renderMarkdownFragment('AI商业化 + 商业AI化\n怎么把AI卖出去? 怎么把商业AI化?\n技术要变成生意 生意要用上技术')
    const root = document.createElement('div')
    root.innerHTML = html
    expect(root.querySelector('.reader-comparison-layout')).not.toBeNull()
    expect(root.querySelectorAll('.reader-comparison-column')).toHaveLength(2)
    expect(root.textContent).toContain('AI商业化')
    expect(root.textContent).toContain('商业AI化')
  })

  it('removes script and style-based network sinks', () => {
    const html = renderMarkdownFragment('<script>alert(1)</script><div style="background:url(https://tracker.invalid/x)">text</div>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('style=')
    expect(html).toContain('text')
  })

  it('renders standalone Quark clipboard links as images', () => {
    const html = renderMarkdownFragment('[image](https://img-view-c-sz.drive.quark.cn/a/preview?auth_key=demo\\&sp=100)')
    expect(html).toContain('<img')
    expect(html).toContain('sp=100')
    expect(html).not.toContain('\\&')
    expect(html).not.toContain('🌐')
  })
})
