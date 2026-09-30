export interface EditorDraft {
  path: string
  source: string
  baseSource: string
  updatedAt: number
}

const key = (path: string) => {
  const normalized = path.replace(/\\/g, '/')
  return `moyue:editor-draft:${encodeURIComponent(/^(?:[a-z]:|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized)}`
}

export function readEditorDraft(path: string, storage: Pick<Storage, 'getItem'> = localStorage): EditorDraft | null {
  try {
    const draft: unknown = JSON.parse(storage.getItem(key(path)) ?? 'null')
    if (!draft || typeof draft !== 'object') return null
    const value = draft as EditorDraft
    return typeof value.path === 'string' && typeof value.source === 'string' && typeof value.baseSource === 'string'
      && Number.isFinite(value.updatedAt) ? value : null
  } catch { return null }
}

// A crash must not depend on a pending debounce timer.
export function saveEditorDraft(draft: EditorDraft, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(key(draft.path), JSON.stringify(draft))
}

export function removeEditorDraft(path: string, storage: Pick<Storage, 'removeItem'> = localStorage) {
  storage.removeItem(key(path))
}

export function hasSaveConflict(base: string, disk: string, proposed: string) {
  return disk !== base && disk !== proposed
}
