// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderMarkdownFragment } from './fragment'
import { parseMarkdown } from '../parser'

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
