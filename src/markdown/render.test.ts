// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderMarkdownFragment } from './fragment'

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
