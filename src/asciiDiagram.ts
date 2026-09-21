type DiagramBox = {
  top: number
  bottom: number
  left: number
  right: number
  labels: string[]
}

type DiagramRelation = {
  source: string
  label: string
  target: string
}

export type AsciiTreeNode = {
  label: string
  children: AsciiTreeNode[]
}

const verticalChars = new Set(['│', '|', '┃'])
const cornerChars = new Set(['┌', '╭', '+'])
const topRightChars = new Set(['┐', '╮', '+'])
const bottomLeftChars = new Set(['└', '╰', '+'])
const bottomRightChars = new Set(['┘', '╯', '+'])

function isHorizontalLine(value: string) {
  return value.length > 1 && /^[─━═=\-┬┴┼]+$/.test(value)
}

function findRelations(lines: string[]): DiagramRelation[] {
  const relations: DiagramRelation[] = []
  const relationPattern = /^(.+?)\s+─{2,}\s*(.+?)\s+─{2,}[➝→⟶]\s*(.+?)\s*$/
  for (const line of lines) {
    const match = line.match(relationPattern)
    if (!match) continue
    const [, source, label, target] = match
    if (source && label && target) relations.push({ source: source.trim(), label: label.trim(), target: target.trim() })
  }
  return relations
}

function findBoxes(lines: string[]): DiagramBox[] {
  const boxes: DiagramBox[] = []
  for (let top = 0; top < lines.length; top += 1) {
    const line = lines[top]
    for (let left = 0; left < line.length - 2; left += 1) {
      if (!cornerChars.has(line[left])) continue
      for (let right = left + 2; right < line.length; right += 1) {
        if (!topRightChars.has(line[right]) || !isHorizontalLine(line.slice(left + 1, right))) continue
        for (let bottom = top + 2; bottom < Math.min(lines.length, top + 16); bottom += 1) {
          const bottomLine = lines[bottom]
          if (!bottomLeftChars.has(bottomLine[left]) || !bottomRightChars.has(bottomLine[right])) continue
          if (!isHorizontalLine(bottomLine.slice(left + 1, right))) continue
          const content = lines.slice(top + 1, bottom).filter((item) => verticalChars.has(item[left]))
          if (!content.length) continue
          const labels = content
            .map((item) => {
              const contentRight = Math.max(...Array.from(verticalChars).map((character) => item.lastIndexOf(character)))
              return item.slice(left + 1, contentRight > left ? contentRight : right).trim()
            })
            .filter(Boolean)
          if (!labels.length) continue
          boxes.push({ top, bottom, left, right, labels })
          break
        }
        break
      }
    }
  }
  return boxes.filter((box, index) => boxes.findIndex((candidate) => candidate.top === box.top && candidate.left === box.left && candidate.right === box.right) === index)
}

function edgeLabel(lines: string[]) {
  return lines
    .map((line) => line.replace(/[│|┃↓↑↕┆⋮→←]/g, '').replace(/[─━═=\-]/g, '').trim())
    .filter((line) => line && !/^[.·]+$/.test(line))[0] ?? ''
}

function isConnected(lines: string[]) {
  return lines.some((line) => /[│|┃↓↑↕┆⋮→←]/.test(line)) || Boolean(edgeLabel(lines))
}

function mermaidText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function mermaidLabel(value: string) {
  return value.split('<br/>').map((part) => `\u00a0${mermaidText(part)}\u00a0`).join('<br/>')
}

function mermaidEdgeLabel(value: string) {
  return `\u00a0${mermaidText(value)}\u00a0`
}

function nodeKey(value: string) {
  return value.trim().replace(/\s+/g, '').toLocaleLowerCase()
}

function nodeDisplay(value: string) {
  const parts = value.trim().split(/\s{2,}/).filter(Boolean)
  return { key: parts[0] || value.trim(), label: parts.join('<br/>') || value.trim() }
}

const treeBranchPattern = /^([\s│|]*)(?:├──|└──|\+--|\\--)[ \t]*(.+?)\s*$/

/** Parse Unicode directory trees into nested data instead of forcing them through Mermaid. */
export function asciiTreeToTree(source: string): AsciiTreeNode | null {
  const lines = source
    .replace(/(?:&#x20;|&#32;|&nbsp;)/gi, ' ')
    .replace(/\t/g, '    ')
    .split(/\r?\n/)
  const firstLine = lines.find((line) => line.trim())
  if (!firstLine || treeBranchPattern.test(firstLine) || /^[\s│|]*$/.test(firstLine)) return null

  const root: AsciiTreeNode = { label: firstLine.trim(), children: [] }
  const stack: AsciiTreeNode[] = [root]
  let branchCount = 0
  for (const line of lines.slice(lines.indexOf(firstLine) + 1)) {
    if (!line.trim() || /^[\s│|]*$/.test(line)) continue
    const match = line.match(treeBranchPattern)
    if (!match) return null
    const depth = Math.max(1, Math.ceil(match[1].length / 4) + 1)
    const parent = stack[depth - 1]
    if (!parent) return null
    const node: AsciiTreeNode = { label: match[2].trim(), children: [] }
    parent.children.push(node)
    stack.length = depth
    stack.push(node)
    branchCount += 1
  }
  return branchCount ? root : null
}

/** Convert the small box-and-arrow diagrams commonly pasted into Markdown code blocks. */
export function asciiDiagramToMermaid(source: string): string | null {
  const lines = source
    .replace(/(?:&#x20;|&#32;|&nbsp;)/gi, ' ')
    .replace(/\t/g, '    ')
    .split(/\r?\n/)
    .map((line) => line.trimStart())
  const boxes = findBoxes(lines).sort((a, b) => a.top - b.top || a.left - b.left)
  const relations = findRelations(lines)
  if (boxes.length < 2 && !relations.length) return null

  const nodes: Array<{ key: string; label: string }> = []
  const nodeIds = new Map<string, string>()
  const registerNode = (rawKey: string, rawLabel: string) => {
    const key = nodeKey(rawKey)
    if (!key) return ''
    const existing = nodes.find((node) => node.key === key)
    if (existing && rawLabel.length > existing.label.length) existing.label = rawLabel
    if (!existing) {
      nodes.push({ key, label: rawLabel })
      nodeIds.set(key, `n${nodes.length - 1}`)
    }
    return key
  }

  const edges: Array<{ from: string; to: string; label: string }> = []
  const seenEdges = new Set<string>()
  const addEdge = (from: string, to: string, label: string) => {
    const edgeKey = `${from}->${to}:${label}`
    if (!from || !to || seenEdges.has(edgeKey)) return
    seenEdges.add(edgeKey)
    edges.push({ from, to, label })
  }

  for (const box of boxes) registerNode(box.labels[0], box.labels.join('<br/>'))
  for (let index = 0; index < boxes.length - 1; index += 1) {
    const from = boxes[index]
    const to = boxes[index + 1]
    if (to.top <= from.bottom) continue
    const gap = lines.slice(from.bottom + 1, to.top)
    if (isConnected(gap)) addEdge(nodeKey(from.labels[0]), nodeKey(to.labels[0]), edgeLabel(gap))
  }
  for (const relation of relations) {
    const source = nodeDisplay(relation.source)
    const target = nodeDisplay(relation.target)
    const sourceKey = registerNode(source.key, source.label)
    const targetKey = registerNode(target.key, target.label)
    addEdge(sourceKey, targetKey, relation.label)
  }
  if (!edges.length) return null

  const direction = relations.length ? 'LR' : 'TD'
  const nodeLines = nodes.map(({ key, label }) => `  ${nodeIds.get(key)}["${mermaidLabel(label)}"]`)
  const links = edges.map(({ from, to, label }) => `  ${nodeIds.get(from)} -->${label ? `|${mermaidEdgeLabel(label)}|` : ''} ${nodeIds.get(to)}`)
  return [`flowchart ${direction}`, ...nodeLines, ...links].join('\n')
}
