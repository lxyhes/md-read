import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { DOMParser } from '@xmldom/xmldom'
import { builtInThemes } from './themes'
import { createExportCss, createPortableHtml, serializeXhtml } from './exportPresentation'
import { createDocx, createEpub } from './exportService'

describe('faithful exports', () => {
  it('inherits active theme and custom typography without duplicating the title', () => {
    const theme = builtInThemes.find(theme => theme.manifest.id === 'inkstone')!
    const css = createExportCss(theme, { fontSize: 21, lineHeight: 2, width: 940, fontFamily: 'SimSun,serif' })
    const html = createPortableHtml('验收', '# 验收\n\n正文', [], css)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(css).toContain('--reader-size:21px')
    expect(css).toContain('--reader-leading:2')
    expect(css).toContain('--reader-width:940px')
    expect(css).toContain('--ink:' + theme.tokens.color.text)
    expect(css).toContain('--reader-font:SimSun,serif')
  })

  it('embeds local images and prevents CSS from closing the style element', () => {
    const html = createPortableHtml('图', '![图](./图.png)', [{ url: './图.png', name: '图.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }], '</style><script>alert(1)</script>')
    expect(html).toContain('src="data:image/png;base64,AQID"')
    expect(html).not.toContain('<script>')
  })

  it('exports editable Word math, real footnotes and clickable links, including table cell formatting', () => {
    const source = '# Word\n\n$x^2+\\frac{a}{b}$ [链接](https://example.com)[^n]\n\n[^n]: **真正脚注**\n\n| A | B |\n| --- | --- |\n| **粗体** | $\\sqrt{x}$ |'
    const files = unzipSync(createDocx('Word', source))
    const document = strFromU8(files['word/document.xml'])
    expect(document).toContain('<m:oMath>')
    expect(document).toContain('<m:sSup>')
    expect(document).toContain('<m:f>')
    expect(document).toContain('<m:rad>')
    expect(document).not.toContain('$x^2')
    expect(document).toContain('<w:footnoteReference w:id="1"/>')
    expect(document).toContain('<w:hyperlink r:id="link1">')
    expect(strFromU8(files['word/footnotes.xml'])).toContain('真正脚注')
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('Target="https://example.com" TargetMode="External"')
  })

  it('keeps filtered EPUB navigation mapped to the right chapter, theme and footnote', () => {
    const files = unzipSync(createEpub('目录', '# 一\n\n### 不入目录\n\n## 二\n\n注[^n]\n\n[^n]: 具体说明甲', [], { chapterDepth: 2, css: 'body{color:red}' }))
    const navigation = strFromU8(files['OEBPS/nav.xhtml'])
    expect(navigation).toContain('content.xhtml#section-3">二')
    expect(navigation).not.toContain('不入目录')
    expect(strFromU8(files['OEBPS/style.css'])).toBe('body{color:red}')
    expect(strFromU8(files['OEBPS/content.xhtml'])).toContain('具体说明甲')
    expect(strFromU8(files['OEBPS/content.xhtml'])).not.toContain('未找到脚注内容')
  })

  it('keeps repeated footnote references unique and SVG math declared in EPUB', () => {
    const files = unzipSync(createEpub('引用', '注[^n]、再注[^n]，公式 $x^2$。\n\n[^n]: 独一无二的内容'))
    const content = strFromU8(files['OEBPS/content.xhtml'])
    expect(content).toContain('id="footnote-ref-1"')
    expect(content).toContain('id="footnote-ref-1-2"')
    expect(content).toContain('href="#footnote-ref-1-2"')
    expect(content.match(/独一无二的内容/g)).toHaveLength(1)
    expect(content).toContain('viewBox=')
    expect(strFromU8(files['OEBPS/content.opf'])).toContain('properties="svg"')
  })

  it('serializes XHTML boolean attributes, entities and void tags correctly', () => {
    const xhtml = serializeXhtml('<video controls><track default /></video><img src="a.png" /><p>A&nbsp;&amp;B</p>')
    expect(xhtml).toContain('controls=""')
    expect(xhtml).toContain('default=""')
    expect(xhtml).not.toContain('&nbsp;')
    expect(xhtml).toContain('&amp;B')
  })

  it('produces strictly well-formed XML throughout DOCX and EPUB packages', () => {
    const source = '# 包结构\n\n$x^2$ [链接](https://example.com/?a=1&b=2)[^n]\n\n[^n]: 注释\n\n![图](data:image/png;base64,AQID)\n\n[视频](clip.mp4 "poster=cover.png;track=sub.vtt")'
    for (const bytes of [createDocx('包结构', source), createEpub('包结构', source)]) {
      const files = unzipSync(bytes)
      for (const [path, data] of Object.entries(files)) {
        if (!/\.(?:xml|rels|xhtml|opf)$/.test(path)) continue
        const parser = new DOMParser({ onError(level, message) { throw new Error(`${path}: ${level}: ${message}`) } })
        const document = parser.parseFromString(strFromU8(data), 'application/xml')
        expect(document.documentElement, path).toBeTruthy()
      }
    }
  })

  it('packages embedded diagram images and retains portable video/poster/subtitle URLs', () => {
    const files = unzipSync(createEpub('媒体', '![图表](data:image/png;base64,AQID)\n\n[视频](clip.mp4 "poster=cover.png;track=sub.vtt")', [
      { url: 'clip.mp4', name: 'clip.mp4', mime: 'video/mp4', bytes: new Uint8Array([1]) },
      { url: 'cover.png', name: 'cover.png', mime: 'image/png', bytes: new Uint8Array([2]) },
      { url: 'sub.vtt', name: 'sub.vtt', mime: 'text/vtt', bytes: new Uint8Array([3]) },
    ]))
    const content = strFromU8(files['OEBPS/content.xhtml'])
    expect(content).toContain('src="assets/clip.mp4"')
    expect(content).toContain('poster="assets/cover.png"')
    expect(content).toContain('src="assets/sub.vtt"')
    expect(Object.keys(files).some(path => /assets\/embedded-\d+\.png/.test(path))).toBe(true)
    const html = createPortableHtml('视频', '[视频](clip.mp4 "poster=cover.png;track=sub.vtt")', [
      { url: 'clip.mp4', name: 'clip.mp4', mime: 'video/mp4', bytes: new Uint8Array([1]) },
      { url: 'cover.png', name: 'cover.png', mime: 'image/png', bytes: new Uint8Array([2]) },
      { url: 'sub.vtt', name: 'sub.vtt', mime: 'text/vtt', bytes: new Uint8Array([3]) },
    ])
    expect(html).toContain('src="data:video/mp4;base64,AQ=="')
    expect(html).toContain('poster="data:image/png;base64,Ag=="')
    expect(html).toContain('src="data:text/vtt;base64,Aw=="')
  })
})
