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

  it('previews Mermaid wrapped inside a generic fenced code block', () => {
    const document = parseMarkdown('notes/nested.md', '~~~~text\n~~~mermaid\nflowchart TD\nA --> B\n~~~\n~~~~')
    expect(document.regions[0].type).toBe('mermaid')
    expect(document.regions[0].metadata?.code).toBe('flowchart TD\nA --> B')
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

  it('resolves relative assets without changing external URLs', () => {
    const document = parseMarkdown('notes/readme.md', '![local](assets/cover.png)\n\n[remote](https://example.com)', (url) => url.startsWith('assets/') ? `asset://${url}` : url)
    expect(document.regions[0].html).toContain('src="asset://assets/cover.png"')
    expect(document.regions[1].html).toContain('href="https://example.com"')
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
})
