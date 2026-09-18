import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
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
  children?: MdastNode[]
  position?: { start?: { offset?: number }; end?: { offset?: number } }
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml', 'toml'])

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

function inlineHtml(node: MdastNode, preserveSoftBreaks = false, resolveUrl: MarkdownUrlResolver = (url) => url): string {
  const children = () => (node.children ?? []).map((child) => inlineHtml(child, preserveSoftBreaks, resolveUrl)).join('')
  switch (node.type) {
    case 'text': return escapeHtml(node.value ?? '').replace(preserveSoftBreaks ? /\r?\n/g : /$^/g, '<br />')
    case 'emphasis': return `<em>${children()}</em>`
    case 'strong': return `<strong>${children()}</strong>`
    case 'delete': return `<del>${children()}</del>`
    case 'inlineCode': return `<code>${escapeHtml(node.value ?? '')}</code>`
    case 'link': return `<a href="${safeUrl(resolveUrl(node.url ?? ''))}" target="_blank" rel="noreferrer">${children()}</a>`
    case 'image': return `<img src="${safeUrl(resolveUrl(node.url ?? ''))}" alt="${escapeHtml(node.title ?? nodeText(node))}" loading="lazy" />`
    case 'break': return '<br />'
    case 'html': return '<span class="unsafe-inline">HTML 已隐藏</span>'
    default: return children()
  }
}

function blockHtml(node: MdastNode, resolveUrl: MarkdownUrlResolver = (url) => url): string {
  const children = () => (node.children ?? []).map((child) => blockHtml(child, resolveUrl)).join('')
  const inlineChildren = (preserveSoftBreaks = false) => (node.children ?? []).map((child) => inlineHtml(child, preserveSoftBreaks, resolveUrl)).join('')
  switch (node.type) {
    case 'heading': return `<h${node.depth ?? 1}>${inlineChildren()}</h${node.depth ?? 1}>`
    case 'paragraph': return `<p>${inlineChildren(true)}</p>`
    case 'blockquote': return `<blockquote>${children()}</blockquote>`
    case 'list': return `<${node.ordered ? 'ol' : 'ul'}>${children()}</${node.ordered ? 'ol' : 'ul'}>`
    case 'listItem': {
      const isTask = typeof node.checked === 'boolean'
      const taskClass = isTask ? ` class="task-item ${node.checked ? 'is-checked' : 'is-unchecked'}"` : ''
      const checkbox = isTask ? `<span class="task-checkbox" role="checkbox" aria-checked="${node.checked}">${node.checked ? '✓' : ''}</span>` : ''
      return `<li${taskClass}>${checkbox}${children()}</li>`
    }
    case 'code': return `<pre><code data-language="${escapeHtml(node.lang ?? 'text')}">${escapeHtml(node.value ?? '')}</code></pre>`
    case 'image': return `<img src="${safeUrl(resolveUrl(node.url ?? ''))}" alt="${escapeHtml(node.title ?? '')}" loading="lazy" />`
    case 'thematicBreak': return '<hr />'
    case 'table': {
      const rows = node.children ?? []
      const renderRow = (row: MdastNode, cellTag: 'th' | 'td') => `<tr>${(row.children ?? []).map((cell) => `<${cellTag}>${(cell.children ?? []).map((child) => inlineHtml(child, false, resolveUrl)).join('')}</${cellTag}>`).join('')}</tr>`
      const [header, ...body] = rows
      return `<div class="table-scroll"><table>${header ? `<thead>${renderRow(header, 'th')}</thead>` : ''}${body.length ? `<tbody>${body.map((row) => renderRow(row, 'td')).join('')}</tbody>` : ''}</table></div>`
    }
    case 'html': return '<div class="unsafe-html">HTML 内容已隐藏，确保阅读安全。</div>'
    case 'yaml':
    case 'toml': return ''
    default: return children() || inlineChildren()
  }
}

function mermaidCode(node: MdastNode): string | null {
  if (node.type !== 'code') return null
  if (node.lang?.trim().toLowerCase() === 'mermaid') return node.value ?? ''
  const value = (node.value ?? '').trim()
  const match = value.match(/^(?:`{3}|~~~)\s*mermaid[^\r\n]*\r?\n([\s\S]*?)\r?\n(?:`{3}|~~~)$/i)
  return match?.[1] ?? null
}

function regionType(node: MdastNode): ReaderRegionType {
  if (mermaidCode(node) !== null) return 'mermaid'
  if (node.type === 'image') return 'image'
  if (node.type === 'table') return 'table'
  if (node.type === 'thematicBreak') return 'thematic-break'
  return node.type as ReaderRegionType
}

export function parseMarkdown(path: string, source: string, resolveUrl: MarkdownUrlResolver = (url) => url): ReaderDocument {
  const tree = processor.parse(source) as unknown as MdastNode
  const documentId = `doc_${hashText(path)}`
  const regions: ReaderRegion[] = []
  const headings: HeadingItem[] = []
  const children = tree.children ?? []

  children.forEach((node, index) => {
    if (node.type === 'yaml' || node.type === 'toml') return
    const type = regionType(node)
    const diagramCode = type === 'mermaid' ? mermaidCode(node) ?? '' : null
    const textContent = (diagramCode ?? nodeText(node)).trim()
    const start = node.position?.start?.offset ?? 0
    const end = node.position?.end?.offset ?? start + textContent.length
    const id = `reg_${hashText(`${path}:${node.type}:${start}:${end}:${textContent.slice(0, 120)}`)}`
    const metadata: Record<string, unknown> = {}
    if (node.lang) metadata.language = node.lang
    if (type === 'mermaid') metadata.code = diagramCode ?? ''
    if (type === 'image') metadata.url = resolveUrl(node.url ?? '')
    const region: ReaderRegion = {
      id, documentId, type, index: regions.length, textContent, sourceStart: start, sourceEnd: end,
      html: blockHtml(node, resolveUrl), metadata
    }
    regions.push(region)
    if (type === 'heading') headings.push({ id: `heading_${hashText(`${id}:${textContent}`)}`, text: textContent, depth: node.depth ?? 1, regionId: id })
  })

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
