import { unified } from 'unified'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { blockHtmlWithSourceIndent, renderFootnotes } from './render'
import { createRenderContext, nodeText, resolveMarkdownReferences, type MarkdownUrlResolver, type MdastNode } from './shared'
import { isClipboardImageLink, normalizeMixedOrderedListSource } from '../pasteMarkdown'

export const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkMath)

export function normalizeLatexDelimiters(source: string): string {
  let inFence = false
  let inDisplayMath = false
  return source.split(/\r?\n/).map((line) => {
    if (/^(?:```|~~~)/.test(line.trimStart())) {
      inFence = !inFence
      return line
    }
    if (inFence) return line
    let normalized = line.replace(/\\\(([^\n]*?)\\\)/g, (_, value: string) => `$${value}$`)
    if (inDisplayMath) {
      normalized = normalized.replace(/\\\]/, () => '$$')
      if (normalized !== line && normalized.includes('$$')) inDisplayMath = false
    } else if (normalized.includes('\\[')) {
      normalized = normalized.replace(/\\\[/, () => '$$')
      if (normalized.includes('\\]')) normalized = normalized.replace(/\\\]/, () => '$$')
      else inDisplayMath = true
    }
    return normalized
  }).join('\n')
}

export function* articleStrongSpans(source: string) {
  for (const match of source.matchAll(/(\*{2,4}|_{2,4})([^\n]*?)\1/g)) {
    const content = match[2].trim()
    if (!content) continue
    const from = match.index
    const contentFrom = from + match[1].length + match[2].length - match[2].trimStart().length
    yield { from, to: from + match[0].length, contentFrom, contentTo: contentFrom + content.length, content }
  }
}

function splitArticleStrongText(node: MdastNode): MdastNode[] {
  if (node.type !== 'text' || !node.value) return [node]
  const result: MdastNode[] = []
  let cursor = 0
  for (const { from, to, content } of articleStrongSpans(node.value)) {
    if (from > cursor) result.push({ ...node, value: node.value.slice(cursor, from) })
    result.push({ type: 'strong', children: [{ type: 'text', value: content }] })
    cursor = to
  }
  if (!result.length) return [node]
  if (cursor < node.value.length) result.push({ ...node, value: node.value.slice(cursor) })
  return result
}

export function normalizeArticleStrong(node: MdastNode) {
  if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return
  if (!node.children) return
  node.children = node.children.flatMap((child) => {
    normalizeArticleStrong(child)
    return child.type === 'text' ? splitArticleStrongText(child) : [child]
  })
}

export function isTimestampedParagraph(node: MdastNode) {
  if (node.type !== 'paragraph') return false
  const text = nodeText(node).trim()
  const match = text.match(/^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/)
  const title = match?.[1]?.trim() ?? ''
  return Boolean(match && title && title.length <= 48 && /[\u3400-\u9fff]/.test(title) && !/[。！？!?]$/.test(title))
}

export function promoteTimestampedParagraph(node: MdastNode): MdastNode {
  if (!isTimestampedParagraph(node)) return node
  return { ...node, children: [{ type: 'strong', children: node.children ?? [] }] }
}

export function promoteTimestampedParagraphs(tree: MdastNode) {
  if (tree.children) tree.children = tree.children.map(promoteTimestampedParagraph)
}

export function promoteStandaloneImageLinks(node: MdastNode) {
  if (node.type === 'paragraph' && node.children?.length === 1) {
    const link = node.children[0]
    const label = nodeText(link)
    if (link.type === 'link' && isClipboardImageLink(label, link.url ?? '')) {
      node.children = [{ ...link, type: 'image', alt: label, children: undefined }]
    }
  }
  node.children?.forEach(promoteStandaloneImageLinks)
}

function normalizeMixedOrderedList(node: MdastNode): MdastNode {
  if (node.children) node.children = node.children.map(normalizeMixedOrderedList)
  if (node.type !== 'list' || node.ordered || (node.children?.length ?? 0) < 2) return node

  const nestedLists = (node.children ?? []).map((item) => {
    if (item.type !== 'listItem' || item.children?.length !== 1) return null
    const child = item.children[0]
    return child?.type === 'list' && child.ordered && child.children?.length === 1 ? child : null
  })
  if (nestedLists.some((list) => !list)) return node
  return {
    ...node,
    ordered: true,
    start: nestedLists[0]?.start ?? 1,
    children: nestedLists.flatMap((list) => list?.children ?? []),
  }
}

/** Treat pasted `- 1. item` rows as one ordered list instead of nested lists. */
export function normalizeMixedOrderedLists(tree: MdastNode) {
  if (tree.children) tree.children = tree.children.map(normalizeMixedOrderedList)
}

/** Remove placeholder list rows left behind by pasted rich text or a trailing bullet marker. */
export function removeEmptyListItems(node: MdastNode) {
  if (!node.children) return
  node.children = node.children
    .map((child) => {
      removeEmptyListItems(child)
      return child
    })
    .filter((child) => {
      if (node.type !== 'list' || child.type !== 'listItem') return true
      const children = child.children ?? []
      if (children.some((grandchild) => grandchild.type === 'list')) return true
      return children.length > 0 && children.some((grandchild) => {
        if (grandchild.type === 'paragraph' || grandchild.type === 'heading' || grandchild.type === 'blockquote') return Boolean(nodeText(grandchild).trim())
        return grandchild.type === 'image' || grandchild.type === 'code' || grandchild.type === 'table' || grandchild.type === 'math' || grandchild.type === 'thematicBreak' || Boolean(nodeText(grandchild).trim())
      })
    })
}

/**
 * Older imported notes often use a timestamped line as a chapter marker
 * without writing a Markdown heading. Keep that reader heuristic, but offer
 * an explicit source-level conversion when the user wants canonical Markdown.
 */
export function makeImplicitMarkdownHeadingsExplicit(source: string): { source: string; converted: number; insertedOffsets: number[] } {
  if (!source.trim()) return { source, converted: 0, insertedOffsets: [] }
  const tree = markdownProcessor.parse(source) as unknown as MdastNode
  const insertOffsets: number[] = []

  for (const node of tree.children ?? []) {
    if (node.type !== 'paragraph' || node.position?.start?.offset == null || node.position.end?.offset == null) continue
    const start = node.position.start.offset
    const end = node.position.end.offset
    const raw = source.slice(start, end)
    if (!raw || /\r?\n/.test(raw)) continue

    const lineStart = source.lastIndexOf('\n', start - 1) + 1
    const lineEnd = source.indexOf('\n', start)
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd)
    if (!line.trim() || line.trimStart() !== line || line.trimStart().startsWith('#')) continue

    if (isTimestampedParagraph(node)) insertOffsets.push(lineStart)
  }

  if (!insertOffsets.length) return { source, converted: 0, insertedOffsets: [] }
  const uniqueOffsets = [...new Set(insertOffsets)].sort((a, b) => b - a)
  let normalized = source
  for (const offset of uniqueOffsets) normalized = `${normalized.slice(0, offset)}## ${normalized.slice(offset)}`
  return { source: normalized, converted: uniqueOffsets.length, insertedOffsets: uniqueOffsets.sort((a, b) => a - b) }
}

export function renderMarkdownFragment(source: string, resolveUrl: MarkdownUrlResolver = (url) => url): string {
  const normalizedSource = normalizeMixedOrderedListSource(normalizeLatexDelimiters(source)).source
  const tree = markdownProcessor.parse(normalizedSource) as unknown as MdastNode
  resolveMarkdownReferences(tree)
  promoteStandaloneImageLinks(tree)
  normalizeMixedOrderedLists(tree)
  promoteTimestampedParagraphs(tree)
  removeEmptyListItems(tree)
  normalizeArticleStrong(tree)
  const headings = (tree.children ?? []).filter((node) => node.type === 'heading').map((node, index) => ({ id: `moyue-heading-${index + 1}`, text: nodeText(node), depth: node.depth ?? 1 }))
  const context = createRenderContext(new Map((tree.children ?? []).filter(node => node.type === 'footnoteDefinition').map(node => [node.identifier ?? node.label ?? '', node])), headings)
  const html = (tree.children ?? [])
    .filter((node) => node.type !== 'yaml' && node.type !== 'toml' && node.type !== 'footnoteDefinition')
    .map((node) => blockHtmlWithSourceIndent(node, normalizedSource, resolveUrl, context))
    .join('')
  return `${html}${renderFootnotes(context, resolveUrl)}`
}
