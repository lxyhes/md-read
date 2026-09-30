export type EditorSnapshot = { value: string; start: number; end: number }

export function createEditorHistory(snapshot: EditorSnapshot) {
  return { entries: [{ ...snapshot }], index: 0, group: '', time: 0 }
}
export type EditorHistory = ReturnType<typeof createEditorHistory>

export function recordEditorHistory(history: EditorHistory, before: EditorSnapshot, after: EditorSnapshot, group = '', time = Date.now()) {
  const current = history.entries[history.index]
  if (after.value === current.value) return
  const merge = group !== '' && group === history.group && time - history.time < 750
    && history.index === history.entries.length - 1 && history.index > 0
    && current.start === before.start && current.end === before.end
  if (merge) history.entries[history.index] = { ...after }
  else {
    history.entries[history.index] = { ...before }
    history.entries.splice(history.index + 1)
    history.entries.push({ ...after })
    if (history.entries.length > 100) history.entries.shift()
    history.index = history.entries.length - 1
  }
  history.group = group
  history.time = time
}

export function stepEditorHistory(history: EditorHistory, direction: -1 | 1): EditorSnapshot | null {
  const index = history.index + direction
  history.group = ''
  if (index < 0 || index >= history.entries.length) return null
  history.index = index
  return { ...history.entries[index] }
}
