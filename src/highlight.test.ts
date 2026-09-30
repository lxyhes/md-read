import { describe, expect, it } from 'vitest'
import { highlightCode, normalizeCodeLanguage } from './highlight'

describe('code highlighting aliases', () => {
  it('maps Typora language names to bundled Shiki grammars', async () => {
    expect(normalizeCodeLanguage('gas')).toBe('asm')
    expect(normalizeCodeLanguage('url')).toBe('hurl')
    expect(await highlightCode('mov rax, rbx', 'gas')).toContain('class="shiki ')
    expect(await highlightCode('GET https://example.com', 'url')).toContain('class="shiki ')
  })
})
