import katex from 'katex'

export type MdastNode = {
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

export type RenderContext = {
  footnotes: Map<string, MdastNode>
  footnoteOrder: string[]
}

export function createRenderContext(footnotes = new Map<string, MdastNode>()): RenderContext {
  return { footnotes, footnoteOrder: [] }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

export function safeUrl(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('javascript:') || normalized.startsWith('data:') || normalized.startsWith('vbscript:')) return ''
  return escapeHtml(value)
}

export function nodeText(node: MdastNode): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(nodeText).join('')
}

export type MarkdownUrlResolver = (url: string) => string

export function renderMath(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, { displayMode, throwOnError: false, strict: 'ignore' })
  } catch {
    return `<code class="math-error">${escapeHtml(value)}</code>`
  }
}
