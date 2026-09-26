import {
  createRenderContext,
  escapeHtml,
  nodeText,
  renderMath,
  safeImageUrl,
  safeUrl,
  type MarkdownUrlResolver,
  type MdastNode,
  type RenderContext,
} from './shared'

function bareExternalLinkLabel(node: MdastNode): string | null {
  const url = node.url?.trim() ?? ''
  const visible = nodeText(node).trim()
  if (!/^https?:\/\//i.test(url)) return null
  if (visible !== url && visible !== url.replace(/^https?:\/\//i, '')) return null
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const tail = parts.at(-1)
    return tail ? `${parsed.hostname}/…/${tail.length > 22 ? `${tail.slice(0, 20)}…` : tail}` : parsed.hostname
  } catch {
    return visible.length > 42 ? `${visible.slice(0, 40)}…` : visible
  }
}

function inlineHtml(node: MdastNode, preserveSoftBreaks = false, resolveUrl: MarkdownUrlResolver = (url) => url, context = createRenderContext()): string {
  const children = () => (node.children ?? []).map((child) => inlineHtml(child, preserveSoftBreaks, resolveUrl, context)).join('')
  switch (node.type) {
    case 'text': return escapeHtml(node.value ?? '').replace(preserveSoftBreaks ? /\r?\n/g : /$^/g, '<br />')
    case 'emphasis': return `<em>${children()}</em>`
    case 'strong': return `<strong>${children()}</strong>`
    case 'delete': return `<del>${children()}</del>`
    case 'inlineCode': return `<code>${escapeHtml(node.value ?? '')}</code>`
    case 'link': {
      const resolved = resolveUrl(node.url ?? '')
      const compactLabel = bareExternalLinkLabel(node)
      if (compactLabel) return `<a class="bare-url" href="${safeUrl(resolved)}" target="_blank" rel="noreferrer" title="${escapeHtml(node.url ?? '')}" aria-label="打开链接：${escapeHtml(node.url ?? '')}">${escapeHtml(compactLabel)}</a>`
      return `<a href="${safeUrl(resolved)}" target="_blank" rel="noreferrer">${children()}</a>`
    }
    case 'image': return `<img src="${safeImageUrl(resolveUrl(node.url ?? ''))}" alt="${escapeHtml(node.title ?? nodeText(node))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
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

function numberedHeading(value: string) {
  const normalized = value.trim().replace(/^\*{4}(?=\s*\d)\s*/, '')
  const match = normalized.match(/^(\d+(?:\.\d+)*)(?:[ \t]+|(?=[A-Za-z]))(.+)$/)
  return match?.[2].trim() ? { number: match[1], title: match[2].trim() } : null
}

function standaloneImageNode(node: MdastNode): MdastNode | null {
  if (node.type === 'image') return node
  if (node.type === 'paragraph' && node.children?.length === 1 && node.children[0]?.type === 'image') return node.children[0]
  return null
}

function blockHtml(node: MdastNode, resolveUrl: MarkdownUrlResolver = (url) => url, context = createRenderContext()): string {
  const children = () => (node.children ?? []).map((child) => blockHtml(child, resolveUrl, context)).join('')
  const inlineChildren = (preserveSoftBreaks = false) => (node.children ?? []).map((child) => inlineHtml(child, preserveSoftBreaks, resolveUrl, context)).join('')
  switch (node.type) {
    case 'heading': {
      const depth = node.depth ?? 1
      const number = numberedHeading(nodeText(node))
      const plainTextHeading = (node.children ?? []).every((child) => child.type === 'text')
      if (!number || !plainTextHeading) return `<h${depth}>${inlineChildren()}</h${depth}>`
      return `<h${depth} class="numbered-heading"><span class="heading-number">${escapeHtml(number.number)}</span><span class="heading-text">${escapeHtml(number.title)}</span></h${depth}>`
    }
    case 'paragraph': {
      const standaloneImage = standaloneImageNode(node)
      return standaloneImage ? blockHtml(standaloneImage, resolveUrl, context) : `<p>${inlineChildren(true)}</p>`
    }
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
    case 'image': return `<img src="${safeImageUrl(resolveUrl(node.url ?? ''))}" alt="${escapeHtml(node.title ?? '')}" loading="eager" decoding="async" referrerpolicy="no-referrer" />`
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

export function blockHtmlWithSourceIndent(node: MdastNode, source: string, resolveUrl: MarkdownUrlResolver = (url) => url, context = createRenderContext()): string {
  const html = blockHtml(node, resolveUrl, context)
  const lineIndents = sourceLineIndentHtml(source, node)
  if (!lineIndents.length || !lineIndents.some(Boolean)) return html

  let lineIndex = 0
  const firstLine = lineIndents[0] ?? ''
  return html
    .replace('<p>', `<p>${firstLine}`)
    .replace(/<br \/>/g, (breakTag) => `${breakTag}${lineIndents[Math.min(++lineIndex, lineIndents.length - 1)] ?? ''}`)
}

export function renderFootnotes(context: RenderContext, resolveUrl: MarkdownUrlResolver): string {
  if (!context.footnoteOrder.length) return ''
  const items = context.footnoteOrder.map((identifier, index) => {
    const definition = context.footnotes.get(identifier)
    const content = definition?.children?.map((child) => blockHtml(child, resolveUrl, context)).join('') ?? '<p>未找到脚注内容</p>'
    return `<li id="footnote-${index + 1}">${content} <a class="footnote-backref" href="#footnote-ref-${index + 1}" aria-label="返回正文">↩</a></li>`
  }).join('')
  return `<section class="markdown-footnotes"><h4>脚注</h4><ol>${items}</ol></section>`
}
