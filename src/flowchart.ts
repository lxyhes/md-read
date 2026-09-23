type FlowNode = { id: string; label: string }
type FlowEdge = { from: string; to: string; label: string }

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character)
}

function labelText(value: string) {
  return value
    .replace(/^['"]|['"]$/g, '')
    .replace(/<br\s*\/?>(?:\s*)/gi, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function parseNodeToken(value: string): FlowNode | null {
  const match = value.trim().match(/^([A-Za-z_]\w*)(?:\s*(?:\[(.*)\]|\((.*)\)|\{(.*)\}))?$/)
  if (!match) return null
  return { id: match[1], label: labelText(match[2] ?? match[3] ?? match[4] ?? match[1]) }
}

function textLines(value: string) {
  return value.split(/\r?\n/).flatMap((line) => {
    const characters = Array.from(line)
    if (characters.length <= 18) return [line]
    return [characters.slice(0, 18).join(''), characters.slice(18, 36).join(''), characters.slice(36).join('')].filter(Boolean)
  }).slice(0, 3)
}

/** Render the common flowchart subset without loading the full Mermaid runtime. */
export function renderSimpleFlowchart(source: string): string | null {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const direction = lines[0]?.match(/^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i)?.[1].toUpperCase()
  if (!direction) return null

  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  const nodeById = new Map<string, FlowNode>()
  const register = (node: FlowNode) => {
    const existing = nodeById.get(node.id)
    if (existing) {
      if (existing.label === existing.id && node.label !== node.id) existing.label = node.label
      return existing
    }
    nodeById.set(node.id, node)
    nodes.push(node)
    return node
  }

  for (const line of lines.slice(1)) {
    if (/^(?:%%|classDef|class |style |click |linkStyle |subgraph\b|end\b)/i.test(line)) return null
    if (!line.includes('-->')) {
      const node = parseNodeToken(line)
      if (!node) return null
      register(node)
      continue
    }
    const parts = line.split('-->')
    let from = parseNodeToken(parts[0])
    if (!from) return null
    register(from)
    for (let index = 1; index < parts.length; index += 1) {
      const labelled = parts[index].match(/^\s*\|([^|]*)\|\s*(.*)$/)
      const to = parseNodeToken(labelled?.[2] ?? parts[index])
      if (!to) return null
      register(to)
      edges.push({ from: from.id, to: to.id, label: labelText(labelled?.[1] ?? '') })
      from = to
    }
  }
  if (nodes.length < 2 || nodes.length > 60 || !edges.length) return null

  const horizontal = direction === 'LR' || direction === 'RL'
  const linesPerTrack = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const trackCount = Math.ceil(nodes.length / linesPerTrack)
  const cellWidth = 190
  const cellHeight = 96
  const width = horizontal ? trackCount * cellWidth + 30 : linesPerTrack * cellWidth + 30
  const height = horizontal ? linesPerTrack * cellHeight + 30 : trackCount * cellHeight + 30
  const positions = new Map<string, { x: number; y: number }>()
  nodes.forEach((node, index) => {
    const track = Math.floor(index / linesPerTrack)
    const slot = index % linesPerTrack
    const x = horizontal ? (direction === 'RL' ? trackCount - track - 1 : track) * cellWidth + cellWidth / 2 + 15 : slot * cellWidth + cellWidth / 2 + 15
    const y = horizontal ? slot * cellHeight + cellHeight / 2 + 15 : (direction === 'BT' ? trackCount - track - 1 : track) * cellHeight + cellHeight / 2 + 15
    positions.set(node.id, { x, y })
  })

  const edgeSvg = edges.map((edge) => {
    const from = positions.get(edge.from)
    const to = positions.get(edge.to)
    if (!from || !to) return ''
    const label = edge.label ? `<text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 7}" text-anchor="middle" class="edge-label">${escapeXml(edge.label)}</text>` : ''
    return `<path d="M ${from.x} ${from.y} L ${to.x} ${to.y}" class="edge" marker-end="url(#arrow)" />${label}`
  }).join('')
  const nodeSvg = nodes.map((node) => {
    const position = positions.get(node.id)
    if (!position) return ''
    const lines = textLines(node.label)
    const text = lines.map((line, index) => `<tspan x="${position.x}" dy="${index ? 18 : 0}">${escapeXml(line)}</tspan>`).join('')
    return `<g class="node"><rect x="${position.x - 72}" y="${position.y - 28}" width="144" height="56" rx="10" /><text x="${position.x}" y="${position.y - (lines.length - 1) * 9}" text-anchor="middle">${text}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="流程图"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs><g class="edges">${edgeSvg}</g><g class="nodes">${nodeSvg}</g></svg>`
}
