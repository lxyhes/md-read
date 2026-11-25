import { unified } from 'unified'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { parseComparisonLayout, renderComparisonLayout } from '../comparisonLayout'
import { blockHtmlWithSourceIndent, renderFootnotes } from './render'
import { createRenderContext, nodeText, resolveMarkdownReferences, type MarkdownUrlResolver, type MdastNode } from './shared'
import { clipboardCodeCardLanguage, clipboardStepsMarkdown, isClipboardImageLink, normalizeMixedOrderedListSource, readClipboardStep } from '../pasteMarkdown'

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

export function normalizeArticleStrong(node: MdastNode, source: string) {
  if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return
  if (!node.children) return
  const [title, timestamp] = node.children
  const link = timestamp?.children?.[0]
  if (node.type === 'paragraph' && node.children.length === 2
    && title.type === 'text' && /^\*{4}[^*]/.test(title.value ?? '')
    && source.slice(title.position?.start?.offset, title.position?.end?.offset).startsWith('****')
    && timestamp.type === 'strong' && timestamp.children?.length === 1
    && link?.type === 'link' && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(nodeText(link))) {
    node.children = [{ type: 'strong', children: [{ ...title, value: title.value?.slice(4) }, link] }]
  }
  node.children = node.children.flatMap((child) => {
    normalizeArticleStrong(child, source)
    return child.type === 'text' ? splitArticleStrongText(child) : [child]
  })
}

export function restoreClipboardCodeCards(tree: MdastNode, source: string) {
  const children = tree.children ?? []
  const restored: MdastNode[] = []
  let found = false
  for (let index = 0; index < children.length; index += 1) {
    const [chrome, label, body] = children.slice(index, index + 3)
    const language = chrome.type === 'paragraph' && label?.type === 'paragraph' ? clipboardCodeCardLanguage(nodeText(chrome), nodeText(label)) : ''
    const inline = body?.type === 'paragraph' && body.children?.length === 1 ? body.children[0] : undefined
    if (language && inline?.type === 'inlineCode') {
      restored.push({ type: 'code', lang: language, value: inline.value, position: { start: chrome.position?.start, end: body.position?.end } })
      index += 2
      found = true
    } else {
      restored.push(chrome)
    }
  }
  if (!found) return
  tree.children = restored
  for (const paragraph of restored.filter((node) => node.type === 'paragraph')) {
    for (const text of paragraph.children ?? []) {
      if (text.type !== 'text' || !text.value || !text.position) continue
      const raw = source.slice(text.position.start?.offset, text.position.end?.offset)
      if (raw.includes('\\*') || text.value.split('**').length !== 2) continue
      text.value = text.value.replace(/(?<=[\p{L}\p{N}])\*\*(?=[，。、；：！？）】,.!?;:)])/u, '')
    }
  }
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

export function attachImageCaptions(tree: MdastNode) {
  const blocks = tree.children ?? []
  const result: MdastNode[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const [image, lineBreak, label] = block.children ?? []
    if (block.type !== 'paragraph' || image?.type !== 'image') {
      result.push(block)
      continue
    }
    if (block.children?.length === 3 && lineBreak?.type === 'break' && label?.type === 'emphasis') {
      result.push({ ...block, children: [{ ...image, caption: label.children }] })
      continue
    }
    const captionBlock = blocks[index + 1]
    if (block.children?.length !== 1 || captionBlock?.type !== 'paragraph' || !captionBlock.children?.length) {
      result.push(block)
      continue
    }
    const text = nodeText(captionBlock).trim()
    const [first] = captionBlock.children
    const italic = captionBlock.children.length === 1 && first.type === 'emphasis'
    const sameAsAlt = Boolean(text) && text === image.alt?.trim() && !/^(?:图片|图像|截图|image)$/i.test(text)
    const next = blocks[index + 2]
    const beforeNextBlock = next?.type === 'heading' || next?.type === 'blockquote'
      || (next?.type === 'paragraph' && next.children?.[0]?.type === 'image')
    const nextText = next?.type === 'paragraph' ? nodeText(next).trim() : ''
    const beforeBodyText = nextText.length > 48 || /[。！？；：.!?;:]$/.test(nextText)
    // shortcut: infer detached legacy captions from generic image alt, a short label, and the next block.
    const detachedLabel = /^(?:图片|图像|截图|image)$/i.test(image.alt ?? '') && captionBlock.children.length === 1
      && first.type === 'text' && /^[^\n。！？；，!?]{2,48}$/.test(text) && !/[:：.]$/.test(text)
      && (beforeNextBlock || beforeBodyText)
    if (!italic && !sameAsAlt && !detachedLabel) {
      result.push(block)
      continue
    }
    result.push({
      ...block,
      children: [{ ...image, caption: italic ? first.children : captionBlock.children }],
      position: { start: block.position?.start, end: captionBlock.position?.end },
    })
    index += 1
  }
  tree.children = result
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

/** Recover STEPS blocks split into separate quotes by older paste formatting. */
export function restoreSplitStepsLists(tree: MdastNode, source: string) {
  const children = tree.children ?? []
  const restored: MdastNode[] = []
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index]
    if (node.type === 'paragraph' && node.position?.start) {
      const items: NonNullable<ReturnType<typeof readClipboardStep>>[] = []
      for (let next = index; next < children.length; next += 1) {
        const paragraph = children[next]
        if (paragraph.type !== 'paragraph' || !paragraph.position?.start) break
        const item = readClipboardStep(source.slice(paragraph.position.start.offset, paragraph.position.end?.offset))
        if (!item || item.number !== items.length + 1) break
        items.push(item)
      }
      if (items.length >= 2) {
        const [blockquote] = (markdownProcessor.parse(clipboardStepsMarkdown(items)) as unknown as MdastNode).children ?? []
        index += items.length - 1
        restored.push({ ...blockquote, position: { start: node.position.start, end: children[index].position?.end } })
        continue
      }
    }
    restored.push(node)
    const [marker] = node.children ?? []
    if (node.type !== 'blockquote' || node.children?.length !== 1 || marker?.type !== 'paragraph' || nodeText(marker).trim() !== '[!STEPS]') continue

    let firstList: MdastNode | undefined
    const items: MdastNode[] = []
    for (let next = index + 1; next < children.length; next += 1) {
      const quote = children[next]
      const [list] = quote.children ?? []
      if (quote.type !== 'blockquote' || quote.children?.length !== 1 || list?.type !== 'list' || !list.ordered || !list.children?.length) break
      if (firstList && (list.start ?? 1) !== (firstList.start ?? 1) + items.length) break

      firstList ??= list
      for (const item of list.children) items.push(item)
      index = next
    }
    if (firstList) {
      restored[restored.length - 1] = {
        ...node,
        children: [marker, { ...firstList, children: items }],
        position: { start: node.position?.start, end: children[index].position?.end },
      }
    }
  }
  tree.children = restored
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

export function renderMarkdownFragment(source: string, resolveUrl: MarkdownUrlResolver = (url) => url, outline?: readonly { depth: number; text: string; id: string }[]): string {
  const normalizedSource = normalizeMixedOrderedListSource(normalizeLatexDelimiters(source)).source
  const tree = markdownProcessor.parse(normalizedSource) as unknown as MdastNode
  resolveMarkdownReferences(tree)
  promoteStandaloneImageLinks(tree)
  attachImageCaptions(tree)
  normalizeMixedOrderedLists(tree)
  promoteTimestampedParagraphs(tree)
  removeEmptyListItems(tree)
  restoreSplitStepsLists(tree, normalizedSource)
  normalizeArticleStrong(tree, normalizedSource)
  restoreClipboardCodeCards(tree, normalizedSource)
  const headings = (tree.children ?? []).filter((node) => node.type === 'heading').map((node, index) => ({ id: `moyue-heading-${index + 1}`, text: nodeText(node), depth: node.depth ?? 1 }))
  const context = createRenderContext(new Map((tree.children ?? []).filter(node => node.type === 'footnoteDefinition').map(node => [node.identifier ?? node.label ?? '', node])), headings)
  const outlineIds = new Map<string, string[]>()
  for (const heading of outline ?? []) {
    const key = `${heading.depth}:${heading.text.trim()}`
    const ids = outlineIds.get(key) ?? []
    ids.push(heading.id)
    outlineIds.set(key, ids)
  }
  const html = (tree.children ?? [])
    .filter((node) => node.type !== 'yaml' && node.type !== 'toml' && node.type !== 'footnoteDefinition')
    .map((node) => {
      const comparisonLayout = ['paragraph', 'blockquote'].includes(node.type) ? parseComparisonLayout(nodeText(node)) : null
      const block = comparisonLayout
        ? renderComparisonLayout(comparisonLayout, node.type === 'blockquote')
        : blockHtmlWithSourceIndent(node, normalizedSource, resolveUrl, context)
      if (!outline) return block
      const depth = node.type === 'heading' ? node.depth ?? 1 : isTimestampedParagraph(node) ? 2 : 0
      const id = depth ? outlineIds.get(`${depth}:${nodeText(node).trim()}`)?.shift() : undefined
      return id ? block.replace(/^<(h[1-6]|p)(?=[\s>])/, `<$1 data-preview-heading="${id.replace(/[^a-zA-Z0-9_-]/g, '')}"`) : block
    })
    .join('')
  return `${html}${renderFootnotes(context, resolveUrl)}`
}
