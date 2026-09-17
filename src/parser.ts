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

function inlineHtml(node: MdastNode, preserveSoftBreaks = false): string {
  const children = () => (node.children ?? []).map((child) => inlineHtml(child, preserveSoftBreaks)).join('')
  switch (node.type) {
    case 'text': return escapeHtml(node.value ?? '').replace(preserveSoftBreaks ? /\r?\n/g : /$^/g, '<br />')
    case 'emphasis': return `<em>${children()}</em>`
    case 'strong': return `<strong>${children()}</strong>`
    case 'delete': return `<del>${children()}</del>`
    case 'inlineCode': return `<code>${escapeHtml(node.value ?? '')}</code>`
    case 'link': return `<a href="${safeUrl(node.url ?? '')}" target="_blank" rel="noreferrer">${children()}</a>`
    case 'image': return `<img src="${safeUrl(node.url ?? '')}" alt="${escapeHtml(node.title ?? nodeText(node))}" loading="lazy" />`
    case 'break': return '<br />'
    case 'html': return '<span class="unsafe-inline">HTML 已隐藏</span>'
    default: return children()
  }
}

function blockHtml(node: MdastNode): string {
  const children = () => (node.children ?? []).map((child) => blockHtml(child)).join('')
  const inlineChildren = (preserveSoftBreaks = false) => (node.children ?? []).map((child) => inlineHtml(child, preserveSoftBreaks)).join('')
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
    case 'image': return `<img src="${safeUrl(node.url ?? '')}" alt="${escapeHtml(node.title ?? '')}" loading="lazy" />`
    case 'thematicBreak': return '<hr />'
    case 'table': {
      const rows = node.children ?? []
      return `<div class="table-scroll"><table>${rows.map((row, rowIndex) => `<${rowIndex === 0 ? 'thead' : 'tbody'}><tr>${(row.children ?? []).map((cell) => `<${rowIndex === 0 ? 'th' : 'td'}>${(cell.children ?? []).map((child) => inlineHtml(child)).join('')}</${rowIndex === 0 ? 'th' : 'td'}>`).join('')}</tr></${rowIndex === 0 ? 'thead' : 'tbody'}>`).join('')}</table></div>`
    }
    case 'html': return '<div class="unsafe-html">HTML 内容已隐藏，确保阅读安全。</div>'
    case 'yaml':
    case 'toml': return ''
    default: return children() || inlineChildren()
  }
}

function regionType(node: MdastNode): ReaderRegionType {
  if (node.type === 'code' && node.lang === 'mermaid') return 'mermaid'
  if (node.type === 'image') return 'image'
  if (node.type === 'table') return 'table'
  if (node.type === 'thematicBreak') return 'thematic-break'
  return node.type as ReaderRegionType
}

export function parseMarkdown(path: string, source: string): ReaderDocument {
  const tree = processor.parse(source) as unknown as MdastNode
  const documentId = `doc_${hashText(path)}`
  const regions: ReaderRegion[] = []
  const headings: HeadingItem[] = []
  const children = tree.children ?? []

  children.forEach((node, index) => {
    if (node.type === 'yaml' || node.type === 'toml') return
    const textContent = nodeText(node).trim()
    const start = node.position?.start?.offset ?? 0
    const end = node.position?.end?.offset ?? start + textContent.length
    const id = `reg_${hashText(`${path}:${node.type}:${start}:${end}:${textContent.slice(0, 120)}`)}`
    const type = regionType(node)
    const metadata: Record<string, unknown> = {}
    if (node.lang) metadata.language = node.lang
    if (type === 'mermaid') metadata.code = node.value ?? ''
    if (type === 'image') metadata.url = node.url ?? ''
    const region: ReaderRegion = {
      id, documentId, type, index: regions.length, textContent, sourceStart: start, sourceEnd: end,
      html: blockHtml(node), metadata
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
