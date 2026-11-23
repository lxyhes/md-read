import { parser } from '@lezer/markdown'
import { markdownProcessor } from './fragment'
import type { MdastNode } from './shared'

export function markdownMediaDestinations(source: string) {
  const destinations: Array<{ from: number; to: number; url: string }> = []
  const visit = (node: MdastNode) => {
    const start = node.position?.start?.offset
    const end = node.position?.end?.offset
    if (start !== undefined && end !== undefined && node.url && ['image', 'link', 'definition'].includes(node.type)) {
      const tree = parser.parse(source.slice(start, end)).topNode
      const item = node.type === 'definition' ? tree.getChild('LinkReference') :
        tree.getChild('Paragraph')?.getChild(node.type === 'image' ? 'Image' : 'Link')
      const url = item?.getChild('URL')
      if (url) {
        const angled = source[start + url.from] === '<'
        destinations.push({ from: start + url.from + Number(angled), to: start + url.to - Number(angled), url: node.url })
      }
    }
    if (start !== undefined && node.type === 'html' && node.value) {
      // Use the raw source for offsets because the parser can normalize line endings.
      const html = source.slice(start, end)
      for (const tag of html.matchAll(/<!--[\s\S]*?-->|<(?:img|video|source|track)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)) {
        if (!tag[1]) continue
        const attributes = start + tag.index + tag[0].length - 1 - tag[1].length
        for (const attr of tag[1].matchAll(/\s+([^\s=<>/]+)(\s*=\s*)?(?:"([^"]*)"|'([^']*)'|([^\s=>]+))?/g)) {
          if (!/^(src|poster)$/i.test(attr[1]) || !attr[2]) continue
          const value = attr[3] ?? attr[4] ?? attr[5]
          if (!value) continue
          const quoted = attr[3] !== undefined || attr[4] !== undefined
          const from = attributes + attr.index + attr[0].length - value.length - Number(quoted)
          destinations.push({ from, to: from + value.length, url: value })
        }
      }
    }
    node.children?.forEach(visit)
  }
  visit(markdownProcessor.parse(source) as unknown as MdastNode)
  return destinations
}
