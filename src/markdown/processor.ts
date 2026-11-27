import { unified } from 'unified'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import type { MdastNode } from './shared'

export const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkMath)

export function markdownTableLineIndexes(source: string): Set<number> {
  const lines = new Set<number>()
  if (!source.includes('|') || !/(?:^|[|> \t]):?-+:?[ \t]*(?:\||$)/m.test(source)) return lines

  const visit = (node: MdastNode) => {
    if (node.type === 'table') {
      const start = node.position?.start?.line
      const end = node.position?.end?.line
      if (start !== undefined && end !== undefined) {
        for (let line = start - 1; line < end; line += 1) lines.add(line)
      }
      return
    }
    node.children?.forEach(visit)
  }
  visit(markdownProcessor.parse(source) as unknown as MdastNode)
  return lines
}
