import { mathjax } from '@mathjax/src/js/mathjax.js'
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js'
import { TeX } from '@mathjax/src/js/input/tex.js'
import { SVG } from '@mathjax/src/js/output/svg.js'
import { SerializedMmlVisitor } from '@mathjax/src/js/core/MmlTree/SerializedMmlVisitor.js'

const mathAdaptor = liteAdaptor()
RegisterHTMLHandler(mathAdaptor)
const mathDocument = mathjax.document('', { InputJax: new TeX(), OutputJax: new SVG({ fontCache: 'local' }) })
const mathMlVisitor = new SerializedMmlVisitor()

export type MdastNode = {
  type: string
  value?: string
  depth?: number
  ordered?: boolean
  start?: number | null
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
  headings: Array<{ id: string; text: string; depth: number }>
  headingIndex: number
}

export function createRenderContext(footnotes = new Map<string, MdastNode>(), headings: RenderContext['headings'] = []): RenderContext {
  return { footnotes, footnoteOrder: [], headings, headingIndex: 0 }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

export function safeUrl(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('javascript:') || normalized.startsWith('data:') || normalized.startsWith('vbscript:')) return ''
  return escapeHtml(value)
}

export function safeImageUrl(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized.startsWith('data:')) return safeUrl(value)
  if (!/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z\d+/=\s]+$/i.test(value.trim())) return ''
  return escapeHtml(value)
}

export function nodeText(node: MdastNode): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(nodeText).join('')
}

export type MarkdownUrlResolver = (url: string) => string

export function renderMath(value: string, displayMode: boolean): string {
  try {
    return mathAdaptor.outerHTML(mathDocument.convert(value, { display: displayMode }))
  } catch {
    return `<code class="math-error">${escapeHtml(value)}</code>`
  }
}

export function renderMathMl(value: string, displayMode: boolean): string {
  try {
    const item = new mathDocument.options.MathItem(value, mathDocument.inputJax[0], displayMode)
    item.compile(mathDocument)
    return mathMlVisitor.visitTree(item.root)
  } catch {
    const display = displayMode ? ' display="block"' : ''
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display}><mtext>${escapeHtml(value)}</mtext></math>`
  }
}
