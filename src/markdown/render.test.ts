// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { renderMarkdownFragment } from './fragment'
import { parseMarkdown } from '../parser'
import RegionBlock from '../components/RegionBlock.vue'
import TreeDiagram from '../components/TreeDiagram.vue'
import { markdownToTree } from '../asciiDiagram'
import { resolveMarkdownAssetUrl } from '../fileService'

it.each([true, false])('keeps mind map table rows and links with outer pipes set to %s', (outerPipes) => {
  const rows = [
    '项目 | 核实结果',
    '--- | ---',
    '用户访问地址 | https://example.com/',
    '**服务器资源：** | 4 个逻辑 CPU',
    '部署录像 | [00:12](https://example.com/video)',
    '部署时间 | 08:30',
  ]
  const table = rows.map(row => outerPipes ? `| ${row} |` : row).join('\n')
  const source = `# 部署说明\n\n## 当前部署\n\n系统当前部署在云服务器。\n\n${table}\n\n## 软件组成\n\n服务清单。`
  const tree = markdownToTree(source, '部署说明')!
  expect(tree.children.map(node => node.label)).toEqual(['当前部署', '软件组成'])
  const detail = tree.children[0].children[0].detail!
  const container = document.createElement('div')
  container.innerHTML = renderMarkdownFragment(detail)

  const body = container.querySelector('table tbody')
  expect(body?.querySelectorAll('tr')).toHaveLength(4)
  expect(body?.querySelector('a')?.getAttribute('href')).toBe('https://example.com/')
  expect(body?.lastElementChild?.textContent).toBe('部署时间08:30')
})

it.each(['horizontal', 'compact'] as const)('toggles all descendants of only the selected %s branch', async (mode) => {
  const node = markdownToTree('# Root\n\n## A\n\n### Child\n\n#### Deep\n\nDetails\n\n## B\n\n### Other\n\nOther details', 'Root')!
  const host = document.createElement('div')
  const app = createApp({ render: () => h(TreeDiagram, { node, root: true, [mode]: true }) })
  app.mount(host)
  try {
    const branch = (text: string) => [...host.querySelectorAll<HTMLElement>(mode === 'horizontal' ? '.tree-branch-toggle' : 'summary')]
      .find(button => button.querySelector('.tree-node-label')?.textContent === text)
    const isExpanded = (text: string) => {
      const button = branch(text)
      return mode === 'horizontal'
        ? button?.getAttribute('aria-expanded') === 'true'
        : (button?.parentElement as HTMLDetailsElement | undefined)?.open === true
    }
    const toggleAll = async (text: string, action = '展开') => {
      host.querySelector<HTMLButtonElement>(`button[aria-label="${action}全部子节点：${text}"]`)!.click()
      await nextTick()
    }

    branch('A')!.click()
    await nextTick()
    expect(isExpanded('A')).toBe(true)
    expect(isExpanded('Child')).toBe(false)
    await toggleAll('A')
    expect(isExpanded('Child')).toBe(true)
    expect(isExpanded('Deep')).toBe(true)
    expect(isExpanded('B')).toBe(false)

    branch('B')!.click()
    await nextTick()
    await toggleAll('A', '收起')
    expect(isExpanded('A')).toBe(false)
    expect(isExpanded('Child')).toBe(false)
    expect(isExpanded('Deep')).toBe(false)
    expect(isExpanded('B')).toBe(true)

    branch('A')!.click()
    await nextTick()
    expect(isExpanded('A')).toBe(true)
    expect(isExpanded('Child')).toBe(false)
    await toggleAll('A')
    expect(isExpanded('Child')).toBe(true)
    expect(isExpanded('Deep')).toBe(true)
    await toggleAll('Root')
    expect(isExpanded('Other')).toBe(true)
    await toggleAll('Root', '收起')
    expect(host.querySelector('.tree-root')?.getAttribute('aria-expanded')).toBe('false')
    await toggleAll('Root')
    expect(isExpanded('Other')).toBe(true)
  } finally {
    app.unmount()
  }
})

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
    const summary = host.querySelector<HTMLButtonElement>('.tree-summary-leaf')!
    expect(summary.textContent).toContain('图片')
    summary.dispatchEvent(new MouseEvent('mouseenter'))
    summary.focus()
    await nextTick()
    expect(summary.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.tree-summary-popover')).toBeNull()

    summary.click()
    await nextTick()
    const panel = document.querySelector<HTMLElement>('.tree-summary-popover')!
    expect(summary.getAttribute('aria-controls')).toBe(panel.id)
    expect(document.activeElement).toBe(panel)
    const image = document.querySelector('.tree-summary-markdown img')
    expect(image?.getAttribute('src')).toBe(imageUrl)
    expect(image?.getAttribute('alt')).toBe('Preview')

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    expect(document.querySelector('.tree-summary-popover')).toBeNull()
    expect(document.activeElement).toBe(summary)

    summary.click()
    await nextTick()
    document.querySelector<HTMLButtonElement>('[aria-label="关闭全文"]')!.click()
    await nextTick()
    expect(summary.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(summary)

    summary.click()
    await nextTick()
    host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('.tree-summary-popover')).toBeNull()
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
