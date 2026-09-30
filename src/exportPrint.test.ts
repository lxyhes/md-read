import { describe, expect, it } from 'vitest'
import { createPrintHtml } from './exportPrint'

describe('isolated draft printing', () => {
  it('retains the exact draft body and uses the selected print settings', () => {
    const html = '<html><head><title>当前草稿</title></head><body><h1>当前草稿</h1><p>未保存的内容</p></body></html>'
    const result = createPrintHtml(html, { printPageSize: 'A4', printMargin: 20, printBackground: true, printHeader: '页眉', printFooter: '页脚' })
    expect(result).toContain('<body><h1>当前草稿</h1><p>未保存的内容</p></body>')
    expect(result).toContain('@page{size:A4;margin:20mm}')
    expect(result).toContain('content:"页眉"')
    expect(result).toContain('print-color-adjust:exact')
  })

  it('does not let a header or footer break out of the style element', () => {
    const html = '<html><head></head><body>正文</body></html>'
    const result = createPrintHtml(html, { printPageSize: 'A4', printMargin: 15, printBackground: false, printHeader: '</style><script>alert(1)</script>', printFooter: '"页脚"' })
    expect(result).not.toContain('<script>')
    expect(result.match(/<\/style>/g)).toHaveLength(1)
  })
})
