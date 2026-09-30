import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js'
import { renderMarkdownFragment } from './parser'
import { escapeHtml, type MdastNode } from './markdown/shared'
import { cssVariables, themeCss } from './themes'
import type { MoyueTheme } from './types'
import type { MarkdownExportAsset } from './fileService'

export function createExportCss(theme: MoyueTheme, settings: { fontSize: number; lineHeight: number; width: number; fontFamily: string }) {
  const variables = { ...cssVariables(theme), '--reader-size': `${settings.fontSize}px`, '--reader-leading': String(settings.lineHeight), '--reader-width': `${settings.width}px`, '--reader-font': settings.fontFamily || theme.tokens.reader.fontFamily }
  return `:root{${Object.entries(variables).map(([name, value]) => `${name}:${value}`).join(';')}}
*{box-sizing:border-box}body{margin:0;padding:40px 24px;background:var(--surface-raised);color:var(--ink);font:var(--reader-size)/var(--reader-leading) var(--reader-font)}
main{max-width:var(--reader-width);margin:auto}h1,h2,h3,h4,h5,h6{line-height:1.35;margin:1.5em 0 .65em;break-after:avoid}p,ul,ol,blockquote,pre,table{margin:0 0 var(--reader-gap)}
a{color:var(--accent);text-underline-offset:.2em}img,video,svg{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow:auto;padding:16px;background:var(--code-bg);border-radius:6px}code{font-family:ui-monospace,Consolas,monospace}
blockquote{margin-left:0;border-left:3px solid var(--accent);padding:12px 20px;background:var(--surface);color:var(--muted)}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid var(--border);text-align:left}th{background:var(--surface)}
.table-scroll{overflow:auto}.math-block{overflow:auto;text-align:center;margin:1.5em 0}.markdown-footnotes{border-top:1px solid var(--border);margin-top:2em;padding-top:1em;font-size:.9em}.task-item{list-style:none}.task-checkbox{display:inline-block;width:1.15em;height:1.15em;border:1px solid var(--accent);margin-right:.5em;text-align:center;line-height:1.1em}mark{background:var(--accent-soft);color:var(--ink)}
@media(max-width:600px){body{padding:24px 16px}}@media print{body{padding:0}pre,figure{break-inside:avoid}}
${themeCss(theme)}`
}

export function assetDataUrl(asset: MarkdownExportAsset) {
  let binary = ''
  for (let offset = 0; offset < asset.bytes.length; offset += 32768) binary += String.fromCharCode(...asset.bytes.subarray(offset, offset + 32768))
  return `data:${asset.mime};base64,${btoa(binary)}`
}

export function embeddedImageAssets(tree: MdastNode, assets: readonly MarkdownExportAsset[]) {
  const result = [...assets]
  const known = new Set(result.map(asset => asset.url))
  const collect = (node: MdastNode) => {
    const match = node.type === 'image' ? node.url?.match(/^data:(image\/(png|jpeg|gif|bmp|webp|avif));base64,([a-z\d+/=\s]+)$/i) : null
    if (match && !known.has(node.url!)) {
      const bytes = Uint8Array.from(atob(match[3]), char => char.charCodeAt(0))
      result.push({ url: node.url!, name: `embedded-${result.length + 1}.${match[2] === 'jpeg' ? 'jpg' : match[2]}`, mime: match[1], bytes })
      known.add(node.url!)
    }
    node.children?.forEach(collect)
  }
  collect(tree)
  return result
}

export function createPortableHtml(title: string, source: string, assets: readonly MarkdownExportAsset[], css = '') {
  const urls = new Map(assets.map(asset => [asset.url, assetDataUrl(asset)]))
  const body = renderMarkdownFragment(source, url => urls.get(url) ?? url)
  // Exported CSS remains data, even if an imported theme contains an HTML closing tag.
  const styles = css ? `<style>${css.replace(/</g, '\\3c ')}</style>` : ''
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${styles}</head><body class="app-shell"><main id="write" class="reader-content region-content">${body}</main></body></html>`
}

const xhtmlAdaptor = liteAdaptor()
export function serializeXhtml(html: string) {
  const parsed = xhtmlAdaptor.parse(`<div>${html}</div>`)
  const root = xhtmlAdaptor.firstChild(xhtmlAdaptor.body(parsed))
  return xhtmlAdaptor.serializeXML(root as ReturnType<typeof xhtmlAdaptor.body>).replace(/^<div>|<\/div>$/g, '')
}
