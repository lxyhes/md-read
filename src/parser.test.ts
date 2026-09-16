import { describe, expect, it } from 'vitest'
import { hashText, parseMarkdown } from './parser'

describe('Moyue markdown region parser', () => {
  const source = '# Title\n\nA paragraph.\n\n```mermaid\nflowchart LR\nA --> B\n```'

  it('creates stable regions and headings', () => {
    const first = parseMarkdown('notes/test.md', source)
    const second = parseMarkdown('notes/test.md', source)
    expect(first.regions.map((region) => region.id)).toEqual(second.regions.map((region) => region.id))
    expect(first.headings[0].text).toBe('Title')
    expect(first.regions.map((region) => region.type)).toEqual(['heading', 'paragraph', 'mermaid'])
  })

  it('does not emit executable raw HTML', () => {
    const document = parseMarkdown('unsafe.md', '<script>alert(1)</script>\n\n[bad](javascript:alert(1))')
    expect(document.regions[0].html).not.toContain('<script>')
    expect(document.regions[1].html).not.toContain('javascript:')
  })

  it('keeps the hash deterministic', () => {
    expect(hashText('moyue')).toBe(hashText('moyue'))
  })
})
