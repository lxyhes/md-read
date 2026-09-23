import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMath from 'remark-math'
import type { HeadingItem, ReaderDocument, ReaderRegion, ReaderRegionType } from './types'
import { blockHtmlWithSourceIndent, renderFootnotes } from './markdown/render'
import { createRenderContext, nodeText, type MarkdownUrlResolver, type MdastNode } from './markdown/shared'

export type { MarkdownUrlResolver } from './markdown/shared'

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml', 'toml']).use(remarkMath)

export function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
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

export function parseMarkdown(path: string, source: string, resolveUrl: MarkdownUrlResolver = (url) => url): ReaderDocument {
  const tree = processor.parse(source) as unknown as MdastNode
  const documentId = `doc_${hashText(path)}`
  const regions: ReaderRegion[] = []
  const headings: HeadingItem[] = []
  const children = tree.children ?? []
  const footnotes = new Map(children.filter((node) => node.type === 'footnoteDefinition' && (node.identifier ?? node.label)).map((node) => [node.identifier ?? node.label ?? '', node]))
  const context = createRenderContext(footnotes)

  children.forEach((node) => {
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
