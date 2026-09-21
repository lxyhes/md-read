import { describe, expect, it } from 'vitest'
import { hashText, parseMarkdown } from './parser'
import { asciiDiagramToMermaid } from './asciiDiagram'

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
    expect(asciiDiagramToMermaid(diagram)).toContain('n0 -->|&nbsp;categoryId&nbsp;| n1')
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
      'User ── UserWarehouse ──➝ 可操作仓库',
    ].join('\n')
    const mermaid = asciiDiagramToMermaid(diagram)
    expect(mermaid).toContain('flowchart LR')
    expect(mermaid).toContain('supplierId')
    expect(mermaid).toContain('UserWarehouse')
    expect(mermaid).toContain('categoryId')
    expect(mermaid).toContain('&nbsp;MatrCategory&nbsp;')
  })
})
