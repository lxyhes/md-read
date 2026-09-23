import { unified } from 'unified'
import katex from 'katex'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMath from 'remark-math'
import type { HeadingItem, ReaderDocument, ReaderRegion, ReaderRegionType } from './types'

type MdastNode = {
  type: string
  value?: string
  depth?: number
  ordered?: boolean
  checked?: boolean | null
  lang?: string | null
  url?: string
  title?: string | null
  identifier?: string
  label?: string | null
  children?: MdastNode[]
  position?: { start?: { offset?: number }; end?: { offset?: number } }
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml', 'toml']).use(remarkMath)

type RenderContext = {
  footnotes: Map<string, MdastNode>
  footnoteOrder: string[]
}

function createRenderContext(footnotes = new Map<string, MdastNode>()): RenderContext {
  return { footnotes, footnoteOrder: [] }
}

function renderMath(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, { displayMode, throwOnError: false, strict: 'ignore' })
  } catch {
    return `<code class="math-error">${escapeHtml(value)}</code>`
  }
}

export function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

function safeUrl(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('javascript:') || normalized.startsWith('data:') || normalized.startsWith('vbscript:')) return ''
  return escapeHtml(value)
}

function nodeText(node: MdastNode): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(nodeText).join('')
}

export type MarkdownUrlResolver = (url: string) => string

function inlineHtml(node: MdastNode, preserveSoftBreaks = false, resolveUrl: MarkdownUrlResolver = (url) => url, context = createRenderContext()): string {
  const children = () => (node.children ?? []).map((child) => inlineHtml(child, preserveSoftBreaks, resolveUrl, context)).join('')
  switch (node.type) {
    case 'text': return escapeHtml(node.value ?? '').replace(preserveSoftBreaks ? /\r?\n/g : /$^/g, '<br />')
    case 'emphasis': return `<em>${children()}</em>`
    case 'strong': return `<strong>${children()}</strong>`
    case 'delete': return `<del>${children()}</del>`
    case 'inlineCode': return `<code>${escapeHtml(node.value ?? '')}</code>`
    case 'link': return `<a href="${safeUrl(resolveUrl(node.url ?? ''))}" target="_blank" rel="noreferrer">${children()}</a>`
    case 'image': return `<img src="${safeUrl(resolveUrl(node.url ?? ''))}" alt="${escapeHtml(node.title ?? nodeText(node))}" loading="lazy" />`
    case 'break': return '<br />'
    case 'inlineMath': return renderMath(node.value ?? '', false)
    case 'footnoteReference': {
      const identifier = node.identifier ?? node.label ?? ''
      const existing = context.footnoteOrder.indexOf(identifier)
      const index = existing >= 0 ? existing : context.footnoteOrder.push(identifier) - 1
      return `<sup class="footnote-ref"><a href="#footnote-${index + 1}" id="footnote-ref-${index + 1}">[${index + 1}]</a></sup>`
    }
    case 'html': return '<span class="unsafe-inline">HTML 已隐藏</span>'
    default: return children()
  }
}

const calloutTitles: Record<string, string> = {
  note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution', info: 'Info',
  success: 'Success', failure: 'Failure', danger: 'Danger', bug: 'Bug', example: 'Example', quote: 'Quote',
}

function calloutMarker(node: MdastNode) {
  if (node.type !== 'blockquote' || node.children?.[0]?.type !== 'paragraph') return null
  const text = nodeText(node.children[0])
  const firstLineEnd = text.search(/\r?\n/)
  const firstLine = firstLineEnd < 0 ? text : text.slice(0, firstLineEnd)
  const match = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|FAILURE|DANGER|BUG|EXAMPLE|QUOTE)\](?:[ \t]+(.+))?$/i)
  if (!match) return null
  return { kind: match[1].toLowerCase(), title: match[2]?.trim() || calloutTitles[match[1].toLowerCase()], markerLength: firstLineEnd < 0 ? firstLine.length : firstLineEnd + (text[firstLineEnd] === '\r' ? 2 : 1) }
}

function withoutCalloutMarker(node: MdastNode, markerLength: number): MdastNode {
  let remaining = markerLength
  const children = (node.children ?? []).flatMap((child) => {
    if (remaining <= 0) return [child]
    const text = nodeText(child)
    if (!text) return [child]
    if (remaining >= text.length) { remaining -= text.length; return [] }
    if (child.type === 'text') return [{ ...child, value: text.slice(remaining) }]
    return [child]
  })
  return { ...node, children }
}

function calloutHtml(node: MdastNode, resolveUrl: MarkdownUrlResolver, context: RenderContext): string | null {
  const marker = calloutMarker(node)
  if (!marker) return null
  const first = node.children?.[0]
  const bodyNodes = first ? [withoutCalloutMarker(first, marker.markerLength), ...(node.children ?? []).slice(1)] : (node.children ?? [])
  const bodyHtml = bodyNodes
    .filter((child) => child.type !== 'paragraph' || (child.children ?? []).length > 0)
    .map((child) => blockHtml(child, resolveUrl, context))
    .join('')
  return `<aside class="markdown-callout callout-${marker.kind}"><div class="callout-title">${escapeHtml(marker.title)}</div><div class="callout-body">${bodyHtml}</div></aside>`
}

function blockHtml(node: MdastNode, resolveUrl: MarkdownUrlResolver = (url) => url, context = createRenderContext()): string {
  const children = () => (node.children ?? []).map((child) => blockHtml(child, resolveUrl, context)).join('')
  const inlineChildren = (preserveSoftBreaks = false) => (node.children ?? []).map((child) => inlineHtml(child, preserveSoftBreaks, resolveUrl, context)).join('')
  switch (node.type) {
    case 'heading': return `<h${node.depth ?? 1}>${inlineChildren()}</h${node.depth ?? 1}>`
    case 'paragraph': return `<p>${inlineChildren(true)}</p>`
    case 'blockquote': return calloutHtml(node, resolveUrl, context) ?? `<blockquote>${children()}</blockquote>`
    case 'list': return `<${node.ordered ? 'ol' : 'ul'}>${children()}</${node.ordered ? 'ol' : 'ul'}>`
    case 'listItem': {
      const isTask = typeof node.checked === 'boolean'
      const taskClass = isTask ? ` class="task-item ${node.checked ? 'is-checked' : 'is-unchecked'}"` : ''
      const checkbox = isTask ? `<span class="task-checkbox" role="checkbox" aria-checked="${node.checked}">${node.checked ? '✓' : ''}</span>` : ''
      return `<li${taskClass}>${checkbox}${children()}</li>`
    }
    case 'code': return `<pre><code data-language="${escapeHtml(node.lang ?? 'text')}">${escapeHtml(node.value ?? '')}</code></pre>`
    case 'math': return `<div class="math-block">${renderMath(node.value ?? '', true)}</div>`
    case 'image': return `<img src="${safeUrl(resolveUrl(node.url ?? ''))}" alt="${escapeHtml(node.title ?? '')}" loading="lazy" />`
    case 'thematicBreak': return '<hr />'
    case 'table': {
      const rows = node.children ?? []
      const renderRow = (row: MdastNode, cellTag: 'th' | 'td') => `<tr>${(row.children ?? []).map((cell) => `<${cellTag}>${(cell.children ?? []).map((child) => inlineHtml(child, false, resolveUrl, context)).join('')}</${cellTag}>`).join('')}</tr>`
      const [header, ...body] = rows
      return `<div class="table-scroll"><table>${header ? `<thead>${renderRow(header, 'th')}</thead>` : ''}${body.length ? `<tbody>${body.map((row) => renderRow(row, 'td')).join('')}</tbody>` : ''}</table></div>`
    }
    case 'html': return '<div class="unsafe-html">HTML 内容已隐藏，确保阅读安全。</div>'
    case 'footnoteDefinition': return ''
    case 'yaml':
    case 'toml': return ''
    default: return children() || inlineChildren()
  }
}

function sourceLeadingWhitespaceHtml(value: string): string {
  const leadingWhitespace = value.match(/^[ \t\u00a0\u3000]*/)?.[0] ?? ''
  return leadingWhitespace
    .replace(/ /g, '&nbsp;')
    .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
    .replace(/\u00a0/g, '&nbsp;')
}

function sourceLineIndentHtml(source: string, node: MdastNode): string[] {
  if (node.type !== 'paragraph') return []
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  if (typeof start !== 'number' || typeof end !== 'number') return []

  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  return source
    .slice(lineStart, end)
    .split(/\r?\n/)
    .map(sourceLeadingWhitespaceHtml)
}

function blockHtmlWithSourceIndent(node: MdastNode, source: string, resolveUrl: MarkdownUrlResolver = (url) => url, context = createRenderContext()): string {
  const html = blockHtml(node, resolveUrl, context)
  const lineIndents = sourceLineIndentHtml(source, node)
  if (!lineIndents.length || !lineIndents.some(Boolean)) return html

  let lineIndex = 0
  const firstLine = lineIndents[0] ?? ''
  return html
    .replace('<p>', `<p>${firstLine}`)
    .replace(/<br \/>/g, (breakTag) => `${breakTag}${lineIndents[Math.min(++lineIndex, lineIndents.length - 1)] ?? ''}`)
}

function mermaidCode(node: MdastNode): string | null {
  if (node.type !== 'code') return null
  if (node.lang?.trim().toLowerCase() === 'mermaid') return node.value ?? ''
  const value = (node.value ?? '').trim()
  const match = value.match(/^(?:`{3}|~~~)\s*mermaid[^\r\n]*\r?\n([\s\S]*?)\r?\n(?:`{3}|~~~)$/i)
  return match?.[1] ?? null
}

function imageNode(node: MdastNode): MdastNode | null {
  if (node.type === 'image') return node
  if (node.type === 'paragraph' && node.children?.length === 1 && node.children[0]?.type === 'image') return node.children[0]
  return null
}

function regionType(node: MdastNode): ReaderRegionType {
  if (mermaidCode(node) !== null) return 'mermaid'
  if (imageNode(node)) return 'image'
  if (node.type === 'table') return 'table'
  if (node.type === 'math') return 'math'
  if (node.type === 'thematicBreak') return 'thematic-break'
  return node.type as ReaderRegionType
}

function renderFootnotes(context: RenderContext, resolveUrl: MarkdownUrlResolver): string {
  if (!context.footnoteOrder.length) return ''
  const items = context.footnoteOrder.map((identifier, index) => {
    const definition = context.footnotes.get(identifier)
    const content = definition?.children?.map((child) => blockHtml(child, resolveUrl, context)).join('') ?? '<p>未找到脚注内容</p>'
    return `<li id="footnote-${index + 1}">${content} <a class="footnote-backref" href="#footnote-ref-${index + 1}" aria-label="返回正文">↩</a></li>`
  }).join('')
  return `<section class="markdown-footnotes"><h4>脚注</h4><ol>${items}</ol></section>`
}

export function parseMarkdown(path: string, source: string, resolveUrl: MarkdownUrlResolver = (url) => url): ReaderDocument {
  const tree = processor.parse(source) as unknown as MdastNode
  const documentId = `doc_${hashText(path)}`
  const regions: ReaderRegion[] = []
  const headings: HeadingItem[] = []
  const children = tree.children ?? []
  const footnotes = new Map(children.filter((node) => node.type === 'footnoteDefinition' && (node.identifier ?? node.label)).map((node) => [node.identifier ?? node.label ?? '', node]))
  const context = createRenderContext(footnotes)

  children.forEach((node, index) => {
    if (node.type === 'yaml' || node.type === 'toml' || node.type === 'footnoteDefinition') return
    const type = regionType(node)
    const diagramCode = type === 'mermaid' ? mermaidCode(node) ?? '' : null
    const textContent = (diagramCode ?? nodeText(node)).trim()
    const start = node.position?.start?.offset ?? 0
    const end = node.position?.end?.offset ?? start + textContent.length
    const id = `reg_${hashText(`${path}:${node.type}:${start}:${end}:${textContent.slice(0, 120)}`)}`
    const metadata: Record<string, unknown> = {}
    if (node.lang) metadata.language = node.lang
    if (type === 'mermaid') metadata.code = diagramCode ?? ''
    if (type === 'image') metadata.url = resolveUrl(imageNode(node)?.url ?? '')
    const region: ReaderRegion = {
      id, documentId, type, index: regions.length, textContent, sourceStart: start, sourceEnd: end,
      html: blockHtmlWithSourceIndent(node, source, resolveUrl, context), metadata
    }
    regions.push(region)
    if (type === 'heading') headings.push({ id: `heading_${hashText(`${id}:${textContent}`)}`, text: textContent, depth: node.depth ?? 1, regionId: id })
  })

  const footnotesHtml = renderFootnotes(context, resolveUrl)
  if (footnotesHtml) {
    const id = `reg_${hashText(`${path}:footnotes:${source.length}`)}`
    regions.push({ id, documentId, type: 'footnotes', index: regions.length, textContent: '脚注', sourceStart: source.length, sourceEnd: source.length, html: footnotesHtml, metadata: {} })
  }

  const title = headings[0]?.text || path.split(/[\\/]/).pop()?.replace(/\.markdown?$/i, '') || '未命名文档'
  const wordCount = source.replace(/```[\s\S]*?```/g, '').trim().length
  return {
    id: documentId,
    path,
    title,
    headings,
    regions,
    wordCount,
    estimatedReadMinutes: Math.max(1, Math.ceil(wordCount / 420)),
    sourceHash: hashText(source),
    source,
    updatedAt: Date.now()
  }
}
