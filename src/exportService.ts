import { strToU8, zipSync, type Zippable } from 'fflate'
import { markdownProcessor, normalizeLatexDelimiters } from './markdown/fragment'
import { renderMarkdownFragment } from './parser'
import { escapeHtml, nodeText, resolveMarkdownReferences, type MdastNode } from './markdown/shared'
import type { MarkdownExportAsset } from './fileService'
import { embeddedImageAssets, serializeXhtml } from './exportPresentation'
import { createOfficeMath } from './officeMath'

function markdownTree(source: string) {
  return resolveMarkdownReferences(markdownProcessor.parse(normalizeLatexDelimiters(source)) as unknown as MdastNode)
}

function xml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function docxRun(value: string, properties = '') {
  return value ? `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(value)}</w:t></w:r>` : ''
}

type DocxContext = {
  images: Map<string, { asset: MarkdownExportAsset; relationshipId: string; drawingId: number }>
  links: Map<string, string>
  footnotes: Map<string, MdastNode>
  footnoteIds: Map<string, number>
}

function imageDimensions(bytes: Uint8Array, mime: string) {
  if (mime === 'image/png' && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (mime === 'image/gif' && bytes.length >= 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (mime === 'image/jpeg') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]
      const length = view.getUint16(offset + 2)
      if (marker >= 0xc0 && marker <= 0xc3) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
      offset += Math.max(2, length + 2)
    }
  }
  return { width: 640, height: 360 }
}

function docxImage(asset: MarkdownExportAsset, relationshipId: string, drawingId: number, description: string) {
  const size = imageDimensions(asset.bytes, asset.mime)
  const scale = Math.min(1, 5486400 / (size.width * 9525), 7315200 / (size.height * 9525))
  const width = Math.max(9525, Math.round(size.width * 9525 * scale))
  const height = Math.max(9525, Math.round(size.height * 9525 * scale))
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${drawingId}" name="${xml(asset.name)}" descr="${xml(description)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${xml(asset.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

function docxInline(node: MdastNode, context: DocxContext, properties = ''): string {
  const children = () => (node.children ?? []).map((child) => docxInline(child, context, properties)).join('')
  switch (node.type) {
    case 'text': return docxRun(node.value ?? '', properties)
    case 'strong': return (node.children ?? []).map((child) => docxInline(child, context, `${properties}<w:b/>`)).join('')
    case 'emphasis': return (node.children ?? []).map((child) => docxInline(child, context, `${properties}<w:i/>`)).join('')
    case 'delete': return (node.children ?? []).map((child) => docxInline(child, context, `${properties}<w:strike/>`)).join('')
    case 'inlineCode': return docxRun(node.value ?? '', `${properties}<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="276B68"/>`)
    case 'inlineMath': return createOfficeMath(node.value ?? '', false)
    case 'link': {
      const url = node.url ?? ''
      if (!/^(https?:|mailto:)/i.test(url)) return children()
      const relationshipId = context.links.get(url) ?? `link${context.links.size + 1}`
      context.links.set(url, relationshipId)
      return `<w:hyperlink r:id="${relationshipId}">${children() || docxRun(url)}</w:hyperlink>`
    }
    case 'footnoteReference': {
      const identifier = node.identifier ?? node.label ?? ''
      if (!context.footnotes.has(identifier)) return docxRun(`[^${identifier}]`)
      const id = context.footnoteIds.get(identifier) ?? context.footnoteIds.size + 1
      context.footnoteIds.set(identifier, id)
      return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`
    }
    case 'image': {
      const image = context.images.get(node.url ?? '')
      return image ? docxImage(image.asset, image.relationshipId, image.drawingId, node.title || nodeText(node) || '图片') : docxRun(`[图片：${node.title || nodeText(node) || node.url || ''}]`, `${properties}<w:i/>`)
    }
    case 'break': return '<w:r><w:br/></w:r>'
    default: return children()
  }
}

function docxParagraph(content: string, style = '') {
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${content}</w:p>`
}

function docxBlock(node: MdastNode, context: DocxContext): string {
  const children = () => (node.children ?? []).map((child) => docxBlock(child, context)).join('')
  switch (node.type) {
    case 'heading': return docxParagraph((node.children ?? []).map((child) => docxInline(child, context)).join(''), `Heading${Math.min(6, node.depth ?? 1)}`)
    case 'paragraph': return docxParagraph((node.children ?? []).map((child) => docxInline(child, context)).join(''))
    case 'blockquote': return children()
    case 'list': return (node.children ?? []).map((item, index) => (item.children ?? []).map((child, childIndex) => child.type === 'paragraph'
      ? docxParagraph((childIndex === 0 ? docxRun(`${typeof item.checked === 'boolean' ? item.checked ? '☑' : '☐' : node.ordered ? `${(node.start ?? 1) + index}.` : '•'} `) : '') + (child.children ?? []).map(child => docxInline(child, context)).join(''), 'ListParagraph')
      : docxBlock(child, context)).join('')).join('')
    case 'code': return docxParagraph(docxRun(node.value ?? '', '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'), 'CodeBlock')
    case 'math': return docxParagraph(createOfficeMath(node.value ?? '', true))
    case 'thematicBreak': return docxParagraph(docxRun('────────────────────────', '<w:color w:val="A8B7B5"/>'))
    case 'table': {
      const rows = (node.children ?? []).map((row) => `<w:tr>${(row.children ?? []).map((cell) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${docxParagraph((cell.children ?? []).map(child => docxInline(child, context)).join(''))}</w:tc>`).join('')}</w:tr>`).join('')
      return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFCBC9"/><w:left w:val="single" w:sz="4" w:color="BFCBC9"/><w:bottom w:val="single" w:sz="4" w:color="BFCBC9"/><w:right w:val="single" w:sz="4" w:color="BFCBC9"/><w:insideH w:val="single" w:sz="4" w:color="BFCBC9"/><w:insideV w:val="single" w:sz="4" w:color="BFCBC9"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`
    }
    case 'yaml':
    case 'toml':
    case 'html':
    case 'footnoteDefinition': return ''
    default: return children()
  }
}

export function createDocx(title: string, source: string, assets: readonly MarkdownExportAsset[] = []): Uint8Array {
  const tree = markdownTree(source)
  const allImages = embeddedImageAssets(tree, assets)
  if (allImages.some(asset => /^image\//.test(asset.mime) && !/^image\/(?:png|jpeg|gif|bmp)$/i.test(asset.mime))) throw new Error('此文档包含浏览器 Word 导出不支持的图片格式，请使用桌面端 Pandoc 或先转换为 PNG；未丢弃图片')
  const images = allImages.filter((asset) => /^image\/(?:png|jpeg|gif|bmp)$/i.test(asset.mime))
  const context: DocxContext = { images: new Map(images.map((asset, index) => [asset.url, { asset, relationshipId: `rId${index + 2}`, drawingId: index + 1 }])), links: new Map(), footnotes: new Map((tree.children ?? []).filter(node => node.type === 'footnoteDefinition').map(node => [node.identifier ?? node.label ?? '', node])), footnoteIds: new Map() }
  const body = (tree.children ?? []).map((node) => docxBlock(node, context)).join('')
  const footnotes = [...context.footnoteIds].map(([identifier, id]) => `<w:footnote w:id="${id}">${docxParagraph('<w:r><w:footnoteRef/></w:r>')}${(context.footnotes.get(identifier)?.children ?? []).map(node => docxBlock(node, context)).join('')}</w:footnote>`).join('')
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:style>${Array.from({ length: 6 }, (_, index) => `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="173F3C"/><w:sz w:val="${36 - index * 3}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="480"/></w:pPr><w:rPr><w:color w:val="536663"/><w:i/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:fill="F1F5F4"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style></w:styles>`
  const timestamp = new Date().toISOString()
  const imageContentTypes = [...new Map(images.map((asset) => [asset.name.split('.').pop()?.toLowerCase() || 'png', asset.mime])).entries()].map(([extension, mime]) => `<Default Extension="${xml(extension)}" ContentType="${xml(mime)}"/>`).join('')
  const imageRelationships = images.map((asset, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${xml(asset.name)}"/>`).join('')
  const linkRelationships = [...context.links].map(([url, id]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(url)}" TargetMode="External"/>`).join('')
  const files: Zippable = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageContentTypes}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(styles),
    'word/footnotes.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${footnotes}</w:footnotes>`),
    'word/_rels/footnotes.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${imageRelationships}${linkRelationships}</Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="footnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>${imageRelationships}${linkRelationships}</Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>墨阅</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created></cp:coreProperties>`),
  }
  for (const asset of images) files[`word/media/${asset.name}`] = asset.bytes
  return zipSync(files, { level: 6 })
}

function latexEscape(value: string) {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
}

function latexUrl(value: string) {
  return value.replace(/\\/g, '/').replace(/([%#{}])/g, '\\$1')
}

function latexInline(node: MdastNode, footnotes: Map<string, MdastNode>): string {
  const children = () => (node.children ?? []).map((child) => latexInline(child, footnotes)).join('')
  switch (node.type) {
    case 'text': return latexEscape(node.value ?? '')
    case 'strong': return `\\textbf{${children()}}`
    case 'emphasis': return `\\emph{${children()}}`
    case 'delete': return `\\sout{${children()}}`
    case 'inlineCode': return `\\texttt{${latexEscape(node.value ?? '')}}`
    case 'inlineMath': return `$${node.value ?? ''}$`
    case 'link': return `\\href{${latexUrl(node.url ?? '')}}{${children() || latexEscape(node.url ?? '')}}`
    case 'image': return `\\begin{figure}[ht]\\centering\\includegraphics[width=\\linewidth]{${latexUrl(node.url ?? '')}}${node.title ? `\\caption{${latexEscape(node.title)}}` : ''}\\end{figure}`
    case 'break': return '\\\\\n'
    case 'footnoteReference': {
      const definition = footnotes.get(node.identifier ?? node.label ?? '')
      return definition ? `\\footnote{${(definition.children ?? []).map((child) => latexBlock(child, footnotes)).join('').trim()}}` : ''
    }
    default: return children()
  }
}

function latexBlock(node: MdastNode, footnotes: Map<string, MdastNode>): string {
  const inline = () => (node.children ?? []).map((child) => latexInline(child, footnotes)).join('')
  switch (node.type) {
    case 'paragraph': return `${inline()}\n\n`
    case 'heading': {
      const command = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'subparagraph'][Math.min(5, (node.depth ?? 1) - 1)]
      return `\\${command}{${inline()}}\n\n`
    }
    case 'blockquote': return `\\begin{quote}\n${(node.children ?? []).map((child) => latexBlock(child, footnotes)).join('')}\\end{quote}\n\n`
    case 'list': {
      const environment = node.ordered ? 'enumerate' : 'itemize'
      const items = (node.children ?? []).map((item) => `\\item ${(item.children ?? []).map((child) => latexBlock(child, footnotes)).join('').trim()}\n`).join('')
      return `\\begin{${environment}}\n${items}\\end{${environment}}\n\n`
    }
    case 'code': return `\\begin{verbatim}\n${node.value ?? ''}\n\\end{verbatim}\n\n`
    case 'math': return `\\[\n${node.value ?? ''}\n\\]\n\n`
    case 'thematicBreak': return '\\bigskip\\hrule\\bigskip\n\n'
    case 'table': {
      const rows = node.children ?? []
      const columns = Math.max(1, ...rows.map((row) => row.children?.length ?? 0))
      const body = rows.map((row, index) => `${(row.children ?? []).map((cell) => latexEscape(nodeText(cell))).join(' & ')} \\\\${index === 0 ? ' \\midrule' : ''}`).join('\n')
      return `\\begin{longtable}{${'l'.repeat(columns)}}\n\\toprule\n${body}\n\\bottomrule\n\\end{longtable}\n\n`
    }
    case 'image': return `${latexInline(node, footnotes)}\n\n`
    case 'footnoteDefinition':
    case 'yaml':
    case 'toml':
    case 'html': return ''
    default: return (node.children ?? []).map((child) => latexBlock(child, footnotes)).join('') || `${latexInline(node, footnotes)}\n`
  }
}

export function createLatex(title: string, source: string): string {
  const tree = markdownTree(source)
  const footnotes = new Map((tree.children ?? []).filter((node) => node.type === 'footnoteDefinition').map((node) => [node.identifier ?? node.label ?? '', node]))
  const body = (tree.children ?? []).map((node) => latexBlock(node, footnotes)).join('')
  return `\\documentclass[UTF8]{ctexart}\n\\usepackage{amsmath,amssymb,graphicx,hyperref,booktabs,longtable,ulem}\n\\usepackage[margin=2.5cm]{geometry}\n\\title{${latexEscape(title)}}\n\\author{墨阅}\n\\date{}\n\\begin{document}\n\\maketitle\n\n${body}\\end{document}\n`
}

export function createEpub(title: string, source: string, assets: readonly MarkdownExportAsset[] = [], options: { chapterDepth?: number; css?: string } = {}): Uint8Array {
  const tree = markdownTree(source)
  assets = embeddedImageAssets(tree, assets)
  const chapterDepth = Math.min(6, Math.max(1, options.chapterDepth ?? 3))
  const headings = (tree.children ?? []).filter(node => node.type === 'heading').map((node, index) => ({ node, id: `section-${index + 1}` })).filter(({ node }) => (node.depth ?? 1) <= chapterDepth)
  const identifier = `urn:uuid:${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
  const assetUrls = new Map(assets.map((asset) => [asset.url, `assets/${asset.name}`]))
  const body = renderMarkdownFragment(source, (url) => assetUrls.get(url) ?? url).replace(/&nbsp;/g, '&#160;').replace(/<mjx-container\b([^>]*)>/g, (_, attributes: string) => `<span${attributes.replace(/\s+(jax|display)="[^"]*"/g, '')}>`).replace(/<\/mjx-container>/g, '</span>')
  const nav = headings.length
    ? `<ol>${headings.map(({ node, id }) => `<li><a href="content.xhtml#${id}">${escapeHtml(nodeText(node))}</a></li>`).join('')}</ol>`
    : '<ol><li><a href="content.xhtml">正文</a></li></ol>'
  let headingIndex = 0
  const contentBody = serializeXhtml(body.replace(/<h([1-6])([^>]*)>/g, (_, depth: string, attributes: string) => `<h${depth}${attributes.replace(/\s+id="[^"]*"/g, '')} id="section-${++headingIndex}">`))
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN"><head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body class="app-shell"><main id="write" class="reader-content region-content">${contentBody}</main></body></html>`
  const assetManifest = assets.map((asset, index) => `<item id="asset-${index + 1}" href="assets/${escapeHtml(asset.name)}" media-type="${escapeHtml(asset.mime)}"/>`).join('')
  const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${escapeHtml(title)}</dc:title><dc:language>zh-CN</dc:language><dc:creator>墨阅</dc:creator><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="content" href="content.xhtml" media-type="application/xhtml+xml"${body.includes('<svg') ? ' properties="svg"' : ''} /><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/>${assetManifest}</manifest><spine><itemref idref="content"/></spine></package>`
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN"><head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1>${nav}</nav></body></html>`
  const css = 'body{margin:5%;color:#203330;font:1em/1.8 serif}main{max-width:42em;margin:auto}h1,h2,h3{line-height:1.3;color:#173f3c}img,video{max-width:100%;height:auto}pre{padding:1em;overflow:auto;background:#f1f5f4}blockquote{border-left:.2em solid #2c7771;padding-left:1em;color:#536663}table{border-collapse:collapse;width:100%}th,td{padding:.4em;border-bottom:1px solid #bfcac8}'
  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/content.xhtml': strToU8(xhtml),
    'OEBPS/nav.xhtml': strToU8(navXhtml),
    'OEBPS/style.css': strToU8(options.css ?? css),
  }
  for (const asset of assets) files[`OEBPS/assets/${asset.name}`] = asset.bytes
  return zipSync(files, { level: 6 })
}
