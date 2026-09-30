export function isFenceBacktickInput(value: string, cursor: number) {
  const lineStart = cursor === 0 ? 0 : value.lastIndexOf('\n', cursor - 1) + 1
  return /^ {0,3}`{2,}$/.test(value.slice(lineStart, cursor)) && value[cursor] !== '`'
}

export function selectedLineRange(value: string, start: number, end: number) {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
  const nextBreak = value.indexOf('\n', end > start ? end - 1 : end)
  return { start: lineStart, end: nextBreak < 0 ? value.length : nextBreak }
}

export function removeSelectedLines(value: string, start: number, end: number) {
  const range = selectedLineRange(value, start, end)
  const removeStart = range.end === value.length && range.start > 0 ? range.start - 1 : range.start
  const removeEnd = range.end < value.length ? range.end + 1 : range.end
  return { value: value.slice(0, removeStart) + value.slice(removeEnd), start: removeStart, end: removeStart }
}

export function indentSelection(value: string, start: number, end: number, outdent: boolean) {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
  if (start === end && !outdent) return { value: `${value.slice(0, start)}  ${value.slice(start)}`, start: start + 2, end: end + 2 }
  // Ending at the next line's start does not select that line.
  const nextNewline = value.indexOf('\n', end > start ? end - 1 : end)
  const blockEnd = nextNewline < 0 ? value.length : nextNewline
  let offset = lineStart
  const edits = value.slice(lineStart, blockEnd).split('\n').map((line) => {
    const removed = outdent ? (line.match(/^(?:\t| {1,2})/)?.[0].length ?? 0) : 0
    const edit = { offset, removed, added: outdent ? 0 : 2 }
    offset += line.length + 1
    return edit
  })
  const mapPosition = (position: number) => position + edits.reduce((delta, edit) =>
    edit.offset > position ? delta : delta + edit.added - Math.min(edit.removed, position - edit.offset), 0)
  const block = value.slice(lineStart, blockEnd).split('\n').map((line, index) =>
    outdent ? line.slice(edits[index].removed) : `  ${line}`).join('\n')
  return { value: `${value.slice(0, lineStart)}${block}${value.slice(blockEnd)}`, start: mapPosition(start), end: mapPosition(end) }
}

export function codeIndentInsertion(value: string, cursor: number): { text: string; caret: number } | null {
  let fence: { marker: string; length: number } | null = null
  const lines = value.slice(0, cursor).split('\n')
  for (const line of lines) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (!match) continue
    if (!fence) {
      if (match[1][0] === '`' && match[2].includes('`')) continue
      fence = { marker: match[1][0], length: match[1].length }
    } else if (match[1][0] === fence.marker && match[1].length >= fence.length && /^[ \t]*$/.test(match[2])) fence = null
  }
  if (!fence) return null
  const line = lines[lines.length - 1]
  const indent = line.match(/^[ \t]*/)?.[0] ?? ''
  const extra = /(?:\{|\(|\[|：|:)[ \t]*$/.test(line) ? (indent.includes('\t') ? '\t' : '  ') : ''
  const opening = line.trimEnd().slice(-1)
  const closing = ({ '{': '}', '(': ')', '[': ']' } as Record<string, string>)[opening]
  const paired = !!closing && closing === value[cursor]
  const text = `\n${indent}${extra}`
  return { text: text + (paired ? `\n${indent}` : ''), caret: text.length }
}
