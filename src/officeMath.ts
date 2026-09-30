import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js'
import { escapeHtml, renderMathMl } from './markdown/shared'

const adaptor = liteAdaptor()
type MathElement = ReturnType<typeof adaptor.body>

/** Common MathML structures become editable Office equations, never dollar-delimited text. */
export function createOfficeMath(value: string, display: boolean) {
  const document = adaptor.parse(renderMathMl(value, display))
  const root = adaptor.firstChild(adaptor.body(document)) as MathElement
  function convert(node: MathElement): string {
    const children = adaptor.childNodes(node).filter(child => !['#text', '#comment'].includes(adaptor.kind(child))) as MathElement[]
    const part = (index: number) => children[index] ? convert(children[index]) : ''
    const all = () => children.map(convert).join('')
    switch (adaptor.kind(node)) {
      case 'math': case 'mrow': case 'mstyle': case 'semantics': case 'mpadded': case 'mtd': return all()
      case 'annotation': case 'annotation-xml': return ''
      case 'mi': case 'mo': case 'mn': case 'mtext': return `<m:r><m:t xml:space="preserve">${escapeHtml(adaptor.textContent(node))}</m:t></m:r>`
      case 'mspace': return '<m:r><m:t xml:space="preserve"> </m:t></m:r>'
      case 'mfrac': return `<m:f><m:num>${part(0)}</m:num><m:den>${part(1)}</m:den></m:f>`
      case 'msup': return `<m:sSup><m:e>${part(0)}</m:e><m:sup>${part(1)}</m:sup></m:sSup>`
      case 'msub': return `<m:sSub><m:e>${part(0)}</m:e><m:sub>${part(1)}</m:sub></m:sSub>`
      case 'msubsup': return `<m:sSubSup><m:e>${part(0)}</m:e><m:sub>${part(1)}</m:sub><m:sup>${part(2)}</m:sup></m:sSubSup>`
      case 'msqrt': return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${all()}</m:e></m:rad>`
      case 'mroot': return `<m:rad><m:deg>${part(1)}</m:deg><m:e>${part(0)}</m:e></m:rad>`
      case 'mover': {
        const accent = adaptor.getAttribute(node, 'accent') === 'true'
        if (accent) return `<m:acc><m:accPr><m:chr m:val="${escapeHtml(adaptor.textContent(children[1]))}"/></m:accPr><m:e>${part(0)}</m:e></m:acc>`
        return `<m:limUpp><m:e>${part(0)}</m:e><m:lim>${part(1)}</m:lim></m:limUpp>`
      }
      case 'munder': return `<m:limLow><m:e>${part(0)}</m:e><m:lim>${part(1)}</m:lim></m:limLow>`
      case 'munderover': return `<m:limUpp><m:e><m:limLow><m:e>${part(0)}</m:e><m:lim>${part(1)}</m:lim></m:limLow></m:e><m:lim>${part(2)}</m:lim></m:limUpp>`
      case 'mtable': return `<m:m>${all()}</m:m>`
      case 'mtr': return `<m:mr>${children.map(child => `<m:e>${convert(child)}</m:e>`).join('')}</m:mr>`
      case 'mfenced': return `<m:d><m:dPr><m:begChr m:val="${escapeHtml(adaptor.getAttribute(node, 'open') ?? '(')}"/><m:endChr m:val="${escapeHtml(adaptor.getAttribute(node, 'close') ?? ')')}"/></m:dPr><m:e>${all()}</m:e></m:d>`
      default: throw new Error(`公式包含 ${adaptor.kind(node)}，请使用桌面端 Pandoc 完整导出；未生成降级文件`)
    }
  }
  const equation = `<m:oMath>${convert(root)}</m:oMath>`
  return display ? `<m:oMathPara>${equation}</m:oMathPara>` : equation
}
