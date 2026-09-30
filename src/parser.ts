import type { HeadingItem, ReaderDocument, ReaderRegion, ReaderRegionType } from './types'
import { blockHtmlWithSourceIndent, renderFootnotes, renderVideoNode } from './markdown/render'
import { createRenderContext, nodeText, renderMath, resolveMarkdownReferences, type MarkdownUrlResolver, type MdastNode } from './markdown/shared'
import { formatPastedText, isLikelyProseBlock, normalizeMixedOrderedListSource } from './pasteMarkdown'
import { isTimestampedParagraph, markdownProcessor as processor, normalizeArticleStrong, normalizeLatexDelimiters, normalizeMixedOrderedLists, promoteTimestampedParagraphs, removeEmptyListItems } from './markdown/fragment'

export type { MarkdownUrlResolver } from './markdown/shared'
export { makeImplicitMarkdownHeadingsExplicit, renderMarkdownFragment } from './markdown/fragment'

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

function gitlabMathCode(node: MdastNode): string | null {
  return node.type === 'code' && node.lang?.trim().toLowerCase() === 'math' ? node.value ?? '' : null
}

function frontMatterTitle(source: string): string {
  const body = source.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)?.[1]
  const value = body?.match(/^title\s*:\s*(.+?)\s*$/im)?.[1]?.trim() ?? ''
  return value.replace(/^(?:"(.*)"|'(.*)')$/, '$1$2').trim()
}

function standaloneStrongText(node: MdastNode): string | null {
  if (node.type !== 'paragraph' || node.children?.length !== 1 || node.children[0]?.type !== 'strong') return null
  const text = nodeText(node).trim()
  return text || null
}

function imageNode(node: MdastNode): MdastNode | null {
  if (node.type === 'image') return node
  if (node.type === 'paragraph' && node.children?.length === 1 && node.children[0]?.type === 'image') return node.children[0]
  return null
}

function videoNode(node: MdastNode): MdastNode | null {
  if (node.type !== 'paragraph' || node.children?.length !== 1) return null
  const link = node.children[0]
  if (link?.type !== 'link') return null
  const label = nodeText(link).trim().toLowerCase()
  return label === '视频' || label === 'video' || /\.(?:mp4|webm|mov|m4v|ogv|ogg)(?:[?#].*)?$/i.test(link.url ?? '') ? link : null
}

function regionType(node: MdastNode): ReaderRegionType {
  if (mermaidCode(node) !== null) return 'mermaid'
  if (gitlabMathCode(node) !== null) return 'math'
  if (videoNode(node)) return 'video'
  if (imageNode(node)) return 'image'
  if (node.type === 'table') return 'table'
  if (node.type === 'math') return 'math'
  if (node.type === 'thematicBreak') return 'thematic-break'
  return node.type as ReaderRegionType
}

function isProseCodeBlock(node: MdastNode) {
  if (node.type !== 'code') return false
  const language = node.lang?.trim() ?? ''
  return (!language || /^(?:plain|plaintext|text|txt)$/i.test(language)) && isLikelyProseBlock(node.value ?? '')
}

function restoreTimestampedLists(tree: MdastNode) {
  const children = tree.children ?? []
  const restored: MdastNode[] = []
  let sectionParagraphs: MdastNode[] = []
  let inTimestampedSection = false

  const flush = () => {
    if (!sectionParagraphs.length) return
    if (sectionParagraphs.length < 2) {
      restored.push(...sectionParagraphs)
    } else {
      restored.push({
        type: 'list',
        ordered: false,
        children: sectionParagraphs.map((paragraph) => ({ type: 'listItem', children: [paragraph], position: paragraph.position })),
        position: { start: sectionParagraphs[0]?.position?.start, end: sectionParagraphs.at(-1)?.position?.end },
      })
    }
    sectionParagraphs = []
  }

  for (const node of children) {
    if (isTimestampedParagraph(node)) {
      flush()
      restored.push(node)
      inTimestampedSection = true
      continue
    }
    if (inTimestampedSection && node.type === 'paragraph') {
      sectionParagraphs.push(node)
      continue
    }
    flush()
    restored.push(node)
    inTimestampedSection = false
  }
  flush()
  tree.children = restored
}

function offsetNodePosition(node: MdastNode, offset: number): MdastNode {
  if (!node.position) return node
  return {
    ...node,
    position: {
      start: node.position.start ? { ...node.position.start, offset: (node.position.start.offset ?? 0) + offset } : undefined,
      end: node.position.end ? { ...node.position.end, offset: (node.position.end.offset ?? 0) + offset } : undefined,
    },
    children: node.children?.map((child) => offsetNodePosition(child, offset)),
  }
}

function expandProseCodeBlock(node: MdastNode, source: string): MdastNode[] {
  if (!isProseCodeBlock(node)) return [node]
  const value = formatPastedText(node.value ?? '')
  const innerTree = processor.parse(value) as unknown as MdastNode
  resolveMarkdownReferences(innerTree)
  normalizeArticleStrong(innerTree)
  const nodeStart = node.position?.start?.offset ?? 0
  const nodeEnd = node.position?.end?.offset ?? nodeStart
  const valueOffset = source.slice(nodeStart, nodeEnd).indexOf(value)
  const base = valueOffset >= 0 ? nodeStart + valueOffset : nodeStart
  const innerNodes = (innerTree.children ?? []).map((child) => offsetNodePosition(child, base))
  return innerNodes.length ? innerNodes : [{ type: 'paragraph', children: [{ type: 'text', value }], position: node.position }]
}

export function parseMarkdown(path: string, source: string, resolveUrl: MarkdownUrlResolver = (url) => url): ReaderDocument {
  const normalizedSource = normalizeMixedOrderedListSource(normalizeLatexDelimiters(source)).source
  const tree = processor.parse(normalizedSource) as unknown as MdastNode
  resolveMarkdownReferences(tree)
  normalizeMixedOrderedLists(tree)
  promoteTimestampedParagraphs(tree)
  restoreTimestampedLists(tree)
  removeEmptyListItems(tree)
  normalizeArticleStrong(tree)
  const documentId = `doc_${hashText(path)}`
  const regions: ReaderRegion[] = []
  const headings: HeadingItem[] = []
  let documentTitle = ''
  const children = tree.children ?? []
  const footnotes = new Map(children.filter((node) => node.type === 'footnoteDefinition' && (node.identifier ?? node.label)).map((node) => [node.identifier ?? node.label ?? '', node]))
  const renderHeadings = children.filter((node) => node.type === 'heading').map((node, index) => ({ id: `moyue-heading-${index + 1}`, text: nodeText(node), depth: node.depth ?? 1 }))
  const context = createRenderContext(footnotes, renderHeadings)

  children.flatMap((node) => expandProseCodeBlock(node, source)).forEach((node) => {
    if (node.type === 'yaml' || node.type === 'toml' || node.type === 'footnoteDefinition') return
    const type = regionType(node)
    const diagramCode = type === 'mermaid' ? mermaidCode(node) ?? '' : null
    const mathCode = type === 'math' ? gitlabMathCode(node) : null
    const textContent = (diagramCode ?? mathCode ?? nodeText(node)).trim()
    const start = node.position?.start?.offset ?? 0
    const end = node.position?.end?.offset ?? start + textContent.length
    const id = `reg_${hashText(`${path}:${node.type}:${start}:${end}:${textContent.slice(0, 120)}`)}`
    const metadata: Record<string, unknown> = {}
    if (node.lang) metadata.language = node.lang
    if (type === 'mermaid') metadata.code = diagramCode ?? ''
    if (type === 'image') metadata.url = resolveUrl(imageNode(node)?.url ?? '')
    if (type === 'video') metadata.url = resolveUrl(videoNode(node)?.url ?? '')
    const html = type === 'video'
      ? renderVideoNode(videoNode(node) ?? { type: 'link', url: String(metadata.url ?? ''), title: null, children: [] }, resolveUrl, textContent || '视频')
      : mathCode !== null ? `<div class="math-block">${renderMath(mathCode, true)}</div>`
      : blockHtmlWithSourceIndent(node, normalizedSource, resolveUrl, context)
    const region: ReaderRegion = {
      id, documentId, type, index: regions.length, textContent, sourceStart: start, sourceEnd: end,
      html, metadata
    }
    regions.push(region)
    const boldSection = standaloneStrongText(node)
    if (type === 'heading') {
      if (!documentTitle) documentTitle = textContent
      headings.push({ id: `heading_${hashText(`${id}:${textContent}`)}`, text: textContent, depth: node.depth ?? 1, regionId: id })
    } else if (boldSection) {
      headings.push({ id: `heading_${hashText(`${id}:${boldSection}`)}`, text: boldSection, depth: 2, regionId: id })
    }
  })

  const footnotesHtml = renderFootnotes(context, resolveUrl)
  if (footnotesHtml) {
    const id = `reg_${hashText(`${path}:footnotes:${source.length}`)}`
    regions.push({ id, documentId, type: 'footnotes', index: regions.length, textContent: '脚注', sourceStart: source.length, sourceEnd: source.length, html: footnotesHtml, metadata: {} })
  }

  const title = documentTitle || frontMatterTitle(source) || path.split(/[\\/]/).pop()?.replace(/\.qmd$/i, '').replace(/\.markdown?$/i, '') || '未命名文档'
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
