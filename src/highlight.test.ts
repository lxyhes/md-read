import { describe, expect, it } from 'vitest'
import { highlightCode, normalizeCodeLanguage } from './highlight'

describe('code highlighting aliases', () => {
  it('maps Typora language names to bundled Shiki grammars', async () => {
    expect(normalizeCodeLanguage('gas')).toBe('asm')
    expect(normalizeCodeLanguage('url')).toBe('hurl')
    expect(await highlightCode('mov rax, rbx', 'gas')).toContain('class="shiki ')
    expect(await highlightCode('GET https://example.com', 'url')).toContain('class="shiki ')
  })

  it.each([
    ['cpp', 'std::vector<int> values;', 'cpp'],
    ['js', 'const message = "你好";', 'javascript'],
    ['yml', 'name: sample', 'yaml'],
    ['jinja2', '{{ user.name }}', 'jinja'],
    ['jade', 'p Hello', 'pug'],
    ['kotlin', 'val message = "hello"', 'kotlin'],
  ])('loads and highlights %s on demand', async (language, source, canonical) => {
    expect(normalizeCodeLanguage(language)).toBe(canonical)
    const html = await highlightCode(source, language, 'light')
    expect(html).toContain('shiki github-light')
    expect(new Set(html.match(/color:#[0-9a-f]+/gi)).size).toBeGreaterThan(1)
  })

  it('escapes plain text and unrecognized language tags', async () => {
    expect(await highlightCode('<img>', 'text')).toBe('<pre><code>&lt;img&gt;</code></pre>')
    expect(await highlightCode('<img>', 'constructor')).toBe('<pre><code>&lt;img&gt;</code></pre>')
  })
})
