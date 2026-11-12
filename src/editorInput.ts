import type { Tree } from '@lezer/common'

export function isTopLevelParagraph(tree: Tree, start: number, end: number) {
  for (const side of [1, -1] as const) {
    let node = tree.resolveInner(start, side)
    while (node && node.name !== 'Paragraph') node = node.parent!
    if (node && node.parent?.name === 'Document' && node.from <= start && end <= node.to) return true
  }
  return false
}

export function toggleInlineMarkup(value: string, start: number, end: number, before: string, after: string, placeholder: string) {
  if (start >= before.length && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    return { value: value.slice(0, start - before.length) + value.slice(start, end) + value.slice(end + after.length), start: start - before.length, end: end - before.length }
  }
  const selected = value.slice(start, end) || placeholder
  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const content = selected.slice(before.length, -after.length)
    return { value: value.slice(0, start) + content + value.slice(end), start, end: start + content.length }
  }
  return { value: value.slice(0, start) + before + selected + after + value.slice(end), start: start + before.length, end: start + before.length + selected.length }
}

export function isFenceBacktickInput(value: string, cursor: number) {
  const lineStart = cursor === 0 ? 0 : value.lastIndexOf('\n', cursor - 1) + 1
  return /^ {0,3}`{2,}$/.test(value.slice(lineStart, cursor)) && value[cursor] !== '`'
}

export function selectedLineRange(value: string, start: number, end: number) {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
  const nextBreak = value.indexOf('\n', end > start ? end - 1 : end)
  return { start: lineStart, end: nextBreak < 0 ? value.length : nextBreak }
}

export function setOrderedListLines(value: string, start: number, end: number) {
  const range = selectedLineRange(value, start, end)
  const original = value.slice(range.start, range.end)
  const lines = original.split('\n')
  const levels = new Map<string, { next: number; indent: string; markerWidth: number }>()
  const replacement = lines.map(line => {
    if (!line.trim() && (start !== end || lines.length > 1)) return line
    const indent = line.match(/^[ \t]*/)?.[0] ?? ''
    const text = line.slice(indent.length)
    const existing = text.match(/^(?:[-+*][ \t]+)?(\d+)[.)][ \t]+/)
    const content = text.replace(/^(?:(?:[-+*][ \t]+)?\d+[.)](?:[ \t]+|$)|[-+*](?:[ \t]+|$))(?:\[[ xX]\][ \t]*)?/, '')
    if (!content.trim() && (start !== end || lines.length > 1)) return indent
    for (const key of levels.keys()) if (key.length > indent.length) levels.delete(key)
    let level = levels.get(indent)
    if (!level) {
      const parent = [...levels.entries()].filter(([key]) => key.length < indent.length).at(-1)?.[1]
      level = { next: Number(existing?.[1] ?? 1), indent: parent ? parent.indent + ' '.repeat(parent.markerWidth) : indent, markerWidth: 0 }
      levels.set(indent, level)
    }
    const number = level.next++
    level.markerWidth = `${number}. `.length
    return `${level.indent}${number}. ${content}`
  }).join('\n')
  const nextValue = value.slice(0, range.start) + replacement + value.slice(range.end)
  if (start === end) {
    const prefixLength = replacement.match(/^[ \t]*\d+\. /)?.[0].length ?? 0
    const cursor = Math.max(range.start + prefixLength, start + replacement.length - original.length)
    return { value: nextValue, start: cursor, end: cursor }
  }
  return { value: nextValue, start: range.start, end: range.start + replacement.length }
}

export function setHeadingLines(value: string, start: number, end: number, level: number) {
  const range = selectedLineRange(value, start, end)
  const prefix = `${'#'.repeat(level)} `
  const replacement = value.slice(range.start, range.end).split('\n').map(line => line.trim() ? prefix + line.replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/, '') : line).join('\n')
  return { value: value.slice(0, range.start) + replacement + value.slice(range.end), start: range.start, end: range.start + replacement.length }
}

export function toggleHeadingLines(value: string, start: number, end: number, level: number) {
  const range = selectedLineRange(value, start, end)
  const lines = value.slice(range.start, range.end).split('\n')
  const content = lines.filter(line => line.trim())
  const isCurrentLevel = new RegExp(`^ {0,3}#{${level}}(?:[ \\t]+|$)`)
  if (!content.length || content.some(line => !isCurrentLevel.test(line))) return setHeadingLines(value, start, end, level)
  const replacement = lines.map(line => line.trim() ? line.replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/, '') : line).join('\n')
  return { value: value.slice(0, range.start) + replacement + value.slice(range.end), start: range.start, end: range.start + replacement.length }
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
