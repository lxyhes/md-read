import { describe, expect, it } from 'vitest'
import { safeImageUrl, safeMediaUrl, safeUrl } from './shared'

describe('markdown URL safety', () => {
  it('rejects privileged schemes while keeping normal links and media', () => {
    expect(safeUrl('https://example.com/read')).toContain('https://example.com/read')
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('java\nscript:alert(1)')).toBe('')
    expect(safeUrl('file:///C:/Users/private.md')).toBe('')
    expect(safeImageUrl('https://img-view-c-sz.drive.quark.cn/a/preview?auth_key=demo\\&sp=100')).toContain('https://img-view-c-sz.drive.quark.cn')
    expect(safeImageUrl('data:image/png;base64,AAAA')).toContain('data:image/png')
    expect(safeMediaUrl('data:text/html;base64,AAAA')).toBe('')
  })
})
