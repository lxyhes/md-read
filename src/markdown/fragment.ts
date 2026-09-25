import { unified } from 'unified'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { blockHtmlWithSourceIndent, renderFootnotes } from './render'
import { createRenderContext, nodeText, type MarkdownUrlResolver, type MdastNode } from './shared'

export const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
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

function splitArticleStrongText(node: MdastNode): MdastNode[] {
  if (node.type !== 'text' || !node.value || !/(?:\*{2,4}|_{2,4}).+(?:\*{2,4}|_{2,4})/.test(node.value)) return [node]
  const result: MdastNode[] = []
  const pattern = /(\*{2,4}|_{2,4})([^\n]*?)\1/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(node.value)) !== null) {
    const content = match[2].trim()
    if (!content) continue
    if (match.index > cursor) result.push({ ...node, value: node.value.slice(cursor, match.index) })
    result.push({ type: 'strong', children: [{ type: 'text', value: content }] })
    cursor = match.index + match[0].length
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
  const match = text.match(/^(.+?)\s+(\d{1,2}:\d{2})$/)
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

    const standaloneStrong = node.children?.length === 1 && node.children[0]?.type === 'strong'
    if (isTimestampedParagraph(node) || standaloneStrong) insertOffsets.push(lineStart)
  }

  if (!insertOffsets.length) return { source, converted: 0, insertedOffsets: [] }
  const uniqueOffsets = [...new Set(insertOffsets)].sort((a, b) => b - a)
  let normalized = source
  for (const offset of uniqueOffsets) normalized = `${normalized.slice(0, offset)}## ${normalized.slice(offset)}`
  return { source: normalized, converted: uniqueOffsets.length, insertedOffsets: uniqueOffsets.sort((a, b) => a - b) }
}

export function renderMarkdownFragment(source: string, resolveUrl: MarkdownUrlResolver = (url) => url): string {
  const normalizedSource = normalizeLatexDelimiters(source)
  const tree = markdownProcessor.parse(normalizedSource) as unknown as MdastNode
  promoteTimestampedParagraphs(tree)
  normalizeArticleStrong(tree)
  const context = createRenderContext()
  const html = (tree.children ?? [])
    .filter((node) => node.type !== 'yaml' && node.type !== 'toml' && node.type !== 'footnoteDefinition')
    .map((node) => blockHtmlWithSourceIndent(node, normalizedSource, resolveUrl, context))
    .join('')
  return `${html}${renderFootnotes(context, resolveUrl)}`
}
