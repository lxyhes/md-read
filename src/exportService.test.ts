import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { createDocx, createEpub, createLatex } from './exportService'

const source = '# 示例文档\n\n正文包含 **粗体** 和 $x^2$。\n\n| 项目 | 内容 |\n| --- | --- |\n| A | B |'

describe('document exports', () => {
  it('creates a readable DOCX package', () => {
    const files = unzipSync(createDocx('示例文档', source))
    expect(Object.keys(files)).toContain('word/document.xml')
    expect(strFromU8(files['word/document.xml'])).toContain('示例文档')
  })

  it('embeds local images into DOCX relationships', () => {
    const png = new Uint8Array(24)
    png.set([137, 80, 78, 71, 13, 10, 26, 10])
    new DataView(png.buffer).setUint32(16, 320)
    new DataView(png.buffer).setUint32(20, 180)
    const files = unzipSync(createDocx('图文', '![封面](cover.png)', [{ url: 'cover.png', name: '1-cover.png', mime: 'image/png', bytes: png }]))
    expect(files['word/media/1-cover.png']).toEqual(png)
    expect(strFromU8(files['word/document.xml'])).toContain('r:embed="rId2"')
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('media/1-cover.png')
  })

  it('creates an EPUB 3 package with navigation', () => {
    const files = unzipSync(createEpub('示例文档', source))
    expect(strFromU8(files.mimetype)).toBe('application/epub+zip')
    expect(strFromU8(files['OEBPS/content.xhtml'])).toContain('示例文档')
    expect(strFromU8(files['OEBPS/nav.xhtml'])).toContain('目录')
  })

  it('limits EPUB navigation to the selected chapter depth', () => {
    const files = unzipSync(createEpub('章节', '# 一级\n\n### 三级', [], { chapterDepth: 2 }))
    const navigation = strFromU8(files['OEBPS/nav.xhtml'])
    expect(navigation).toContain('一级')
    expect(navigation).not.toContain('三级')
  })

  it('creates compilable Chinese LaTeX source', () => {
    const latex = createLatex('示例文档', source)
    expect(latex).toContain('\\documentclass[UTF8]{ctexart}')
    expect(latex).toContain('\\section{示例文档}')
    expect(latex).toContain('\\textbf{粗体}')
    expect(latex).toContain('\\begin{longtable}')
  })
})
