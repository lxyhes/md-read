import { describe, expect, it } from 'vitest'
import { hashText, parseMarkdown } from './parser'
import { asciiDiagramToMermaid, asciiTreeToTree } from './asciiDiagram'
import { formatPastedText } from './pasteMarkdown'
import { resolveMarkdownAssetUrl } from './fileService'

describe('Moyue markdown region parser', () => {
  const source = '# Title\n\nA paragraph.\n\n```mermaid\nflowchart LR\nA --> B\n```'

  it('creates stable regions and headings', () => {
    const first = parseMarkdown('notes/test.md', source)
    const second = parseMarkdown('notes/test.md', source)
    expect(first.regions.map((region) => region.id)).toEqual(second.regions.map((region) => region.id))
    expect(first.headings[0].text).toBe('Title')
    expect(first.regions.map((region) => region.type)).toEqual(['heading', 'paragraph', 'mermaid'])
  })

  it('styles numeric article headings like public-account chapter headings', () => {
    const document = parseMarkdown('notes/article.md', '## 11API Key 怎么配？')
    expect(document.regions[0].html).toContain('class="numbered-heading"')
    expect(document.regions[0].html).toContain('<span class="heading-number">11</span>')
    expect(document.regions[0].html).toContain('<span class="heading-text">API Key 怎么配？</span>')

    const starred = parseMarkdown('notes/article-starred.md', '## ****11API Key 怎么配？')
    expect(starred.regions[0].html).toContain('<span class="heading-number">11</span>')
    expect(starred.regions[0].html).not.toContain('****')
  })

  it('previews Mermaid wrapped inside a generic fenced code block', () => {
    const document = parseMarkdown('notes/nested.md', '~~~~text\n~~~mermaid\nflowchart TD\nA --> B\n~~~\n~~~~')
    expect(document.regions[0].type).toBe('mermaid')
    expect(document.regions[0].metadata?.code).toBe('flowchart TD\nA --> B')
  })

  it('renders inline and block math with KaTeX', () => {
    const document = parseMarkdown('math.md', String.raw`Inline $x^2$.

$$
\frac{a}{b}
$$`)
    expect(document.regions[0].html).toContain('katex')
    expect(document.regions[1].type).toBe('math')
    expect(document.regions[1].html).toContain('frac')
  })

  it('renders footnotes at the end of the document', () => {
    const document = parseMarkdown('footnotes.md', '正文[^1]。\n\n[^1]: 脚注内容。')
    expect(document.regions[0].html).toContain('href="#footnote-1"')
    expect(document.regions.at(-1)?.type).toBe('footnotes')
    expect(document.regions.at(-1)?.html).toContain('脚注内容')
  })

  it('renders GitHub-style callouts', () => {
    const document = parseMarkdown('callout.md', '> [!WARNING]\n> 这是一条提醒。')
    expect(document.regions[0].html).toContain('markdown-callout')
    expect(document.regions[0].html).toContain('这是一条提醒')
    expect(document.regions[0].html).not.toContain('[!WARNING]')
  })

  it('does not emit executable raw HTML', () => {
    const document = parseMarkdown('unsafe.md', '<script>alert(1)</script>\n\n[bad](javascript:alert(1))')
    expect(document.regions[0].html).not.toContain('<script>')
    expect(document.regions[1].html).not.toContain('javascript:')
  })

  it('keeps the hash deterministic', () => {
    expect(hashText('moyue')).toBe(hashText('moyue'))
  })

  it('preserves soft line breaks in prose paragraphs', () => {
    const document = parseMarkdown('notes/redis.md', '详情：RedisKeyUserPrefix + "aiTask:detail:{id}"\n任务列表：RedisKeyUserPrefix + "aiTask:list:{userId}:{page}"')
    expect(document.regions[0].html).toContain('<br />')
  })

  it('recognizes bold markers adjacent to Chinese prose', () => {
    const document = parseMarkdown('notes/article-bold.md', '其实更像**“判断题”**。\n\nJev 更像***“调度员 + 质检员 + 守门员”***。\n\n```text\n中文 **代码里的标记** 保持原样\n```')
    expect(document.regions[0].html).toContain('<strong>“判断题”</strong>')
    expect(document.regions[1].html).toContain('<strong>“调度员 + 质检员 + 守门员”</strong>')
    expect(document.regions[1].html).not.toContain('*')
    expect(document.regions[2].textContent).toContain('**代码里的标记**')
  })

  it('preserves leading spaces that exist in the source paragraph', () => {
    const document = parseMarkdown('notes/indent.md', '  第一段\n\n   第二段\n\n普通段落')
    expect(document.regions[0].html).toContain('<p>&nbsp;&nbsp;第一段</p>')
    expect(document.regions[1].html).toContain('<p>&nbsp;&nbsp;&nbsp;第二段</p>')
    expect(document.regions[2].html).toBe('<p>普通段落</p>')
  })

  it('preserves leading spaces on every soft-wrapped source line', () => {
    const document = parseMarkdown('notes/lines.md', '第一行\n  第二行\n   第三行')
    expect(document.regions[0].html).toBe('<p>第一行<br />&nbsp;&nbsp;第二行<br />&nbsp;&nbsp;&nbsp;第三行</p>')
  })

  it('resolves relative assets without changing external URLs', () => {
    const document = parseMarkdown('notes/readme.md', '![local](assets/cover.png)\n\n[remote](https://example.com)', (url) => url.startsWith('assets/') ? `asset://${url}` : url)
    expect(document.regions[0].html).toContain('src="asset://assets/cover.png"')
    expect(document.regions[1].html).toContain('href="https://example.com"')
  })

  it('treats a standalone markdown image paragraph as an image region', () => {
    const document = parseMarkdown('notes/readme.md', '![cover](https://example.com/cover.png)')
    expect(document.regions[0].type).toBe('image')
    expect(document.regions[0].metadata?.url).toBe('https://example.com/cover.png')
  })

  it('resolves browser assets relative to the Markdown file', () => {
    const document = parseMarkdown('notes/readme.md', '![local](../assets/cover%20image.png)', (url) => resolveMarkdownAssetUrl('notes/readme.md', url, { 'assets/cover image.png': 'blob:test-image' }))
    expect(document.regions[0].html).toContain('src="blob:test-image"')
  })

  it('preserves the slash after a Windows drive letter', () => {
    const document = parseMarkdown('E:/notes/readme.md', '![local](./assets/cover.png)', (url) => resolveMarkdownAssetUrl('E:/notes/readme.md', url, { 'e:/notes/assets/cover.png': 'blob:test-image' }))
    expect(document.regions[0].html).toContain('src="blob:test-image"')
  })

  it('keeps relative asset query strings after resolving them', () => {
    const document = parseMarkdown('notes/readme.md', '![local](../assets/cover.png?raw=1#top)', (url) => resolveMarkdownAssetUrl('notes/readme.md', url, { 'assets/cover.png': 'blob:test-image' }))
    expect(document.regions[0].html).toContain('src="blob:test-image?raw=1#top"')
  })

  it('converts box-and-arrow text diagrams into Mermaid', () => {
    const diagram = [
      '┌──────────────┐',
      '│ Matr         │',
      '│ 物资           │',
      '└──────┬───────┘',
      '       │ categoryId',
      '       ↓',
      '┌──────────────┐',
      '│ MatrCategory   │',
      '└──────────────┘',
    ].join('\n')
    expect(asciiDiagramToMermaid(diagram)).toContain('n0 -->|\u00a0categoryId\u00a0| n1')
    expect(asciiDiagramToMermaid('普通文本')).toBeNull()
  })

  it('converts mixed box diagrams and labelled horizontal relations', () => {
    const diagram = [
      '┌────────────┐',
      '&#x20;          │   Matr     │',
      '&#x20;          │  物资       │',
      '&#x20;          └─────┬──────┘',
      '&#x20;                │ categoryId',
      '&#x20;                ↓',
      '&#x20;         ┌────────────┐',
      '&#x20;         │MatrCategory│',
      '&#x20;         └────────────┘',
      '',
      'Matr ── supplierId ──➝ Supplier       供应商',
      'Matr ── mfgId      ──➝ Mfg            厂商',
      'Matr ── matrId     ──➝ MatrUnit      多单位',
      'Matr ── hisCode    ──➝ HIS           收费编码',
      'Matr ── hrpCode    ──➝ HRP           对码',
      '',
      'Dept ── warehouseId ──➝ Warehouse',
      'Warehouse ── locationId ──➝ Location',
      'User ── UserWarehouse ──➝ 可操作仓库',
      '',
      'Dept ── WarehouseMap ──➝ 高值/低值业务仓库',
    ].join('\n')
    const mermaid = asciiDiagramToMermaid(diagram)
    expect(mermaid).toContain('flowchart LR')
    for (const label of ['categoryId', 'supplierId', 'mfgId', 'matrId', 'hisCode', 'hrpCode', 'warehouseId', 'locationId', 'UserWarehouse', 'WarehouseMap']) {
      expect(mermaid).toContain(label)
    }
    for (const node of ['MatrCategory', 'Supplier', 'Mfg', 'MatrUnit', 'HIS', 'HRP', 'Warehouse', 'Location', '可操作仓库', '高值/低值业务仓库']) {
      expect(mermaid).toContain(node)
    }
    expect(mermaid).toContain('物资\u00a0"]')
    expect(mermaid).not.toContain('物资       │')
    expect(mermaid).toContain('\u00a0MatrCategory\u00a0')
  })

  it('parses directory trees without flattening their hierarchy', () => {
    const tree = asciiTreeToTree([
      '墨阅',
      '',
      '├── 我的空间',
      '│',
      '├── 文档库',
      '│   ├── 全部文档',
      '│   ├── 最近阅读',
      '│   └── 收藏',
      '├── Markdown Reader',
      '│   ├── 大纲',
      '│   └── 内容导航',
      '└── 设置',
    ].join('\n'))
    expect(tree).toEqual({
      label: '墨阅',
      children: [
        { label: '我的空间', children: [] },
        { label: '文档库', children: [
          { label: '全部文档', children: [] },
          { label: '最近阅读', children: [] },
          { label: '收藏', children: [] },
        ] },
        { label: 'Markdown Reader', children: [
          { label: '大纲', children: [] },
          { label: '内容导航', children: [] },
        ] },
        { label: '设置', children: [] },
      ],
    })
    expect(asciiTreeToTree('普通文本')).toBeNull()
  })

  it('normalizes plain clipboard text into Markdown lists', () => {
    expect(formatPastedText('标题\r\n\r\n• 第一项\r\n2) 第二项\r\n\r\n')).toBe('标题\n\n- 第一项\n2. 第二项')
  })

  it('removes decorative four-star prefixes from pasted article headings', () => {
    expect(formatPastedText('****11API Key 怎么配？\n\n#### ****12 下一节')).toBe('11API Key 怎么配？\n\n#### 12 下一节')
    expect(formatPastedText('```text\n****11 代码内容\n```')).toBe('```text\n****11 代码内容\n```')
  })
})
