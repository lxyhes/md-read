import { deleteDurableData, loadDurableData, saveDurableData } from './persistence'

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
let draftQueue: Promise<void> = Promise.resolve()

function enqueueDraftWrite(operation: () => Promise<void>) {
  const pending = draftQueue.catch(() => {}).then(operation)
  draftQueue = pending
  return pending
}

function validEditorDraft(value: unknown): EditorDraft | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as EditorDraft
  return typeof draft.path === 'string' && typeof draft.source === 'string' && typeof draft.baseSource === 'string'
    && Number.isFinite(draft.updatedAt) ? draft : null
}

export function readEditorDraft(path: string): Promise<EditorDraft | null>
export function readEditorDraft(path: string, storage: Pick<Storage, 'getItem'>): EditorDraft | null
export function readEditorDraft(path: string, storage?: Pick<Storage, 'getItem'>): EditorDraft | null | Promise<EditorDraft | null> {
  if (!storage) return draftQueue.catch(() => {}).then(() => loadDurableData(key(path), validEditorDraft))
  try {
    const draft: unknown = JSON.parse(storage.getItem(key(path)) ?? 'null')
    return validEditorDraft(draft)
  } catch { return null }
}

export function saveEditorDraft(draft: EditorDraft): Promise<void>
export function saveEditorDraft(draft: EditorDraft, storage: Pick<Storage, 'setItem'>): void
export function saveEditorDraft(draft: EditorDraft, storage?: Pick<Storage, 'setItem'>): void | Promise<void> {
  if (!storage) return enqueueDraftWrite(() => saveDurableData(key(draft.path), draft))
  storage.setItem(key(draft.path), JSON.stringify(draft))
}

export function removeEditorDraft(path: string): Promise<void>
export function removeEditorDraft(path: string, storage: Pick<Storage, 'removeItem'>): void
export function removeEditorDraft(path: string, storage?: Pick<Storage, 'removeItem'>): void | Promise<void> {
  if (!storage) return enqueueDraftWrite(() => deleteDurableData(key(path)))
  storage.removeItem(key(path))
}

export async function migrateEditorDrafts(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((storageKey): storageKey is string => Boolean(storageKey?.startsWith('moyue:editor-draft:')))
  await Promise.all(keys.map((storageKey) => loadDurableData(storageKey, validEditorDraft)))
}

export function hasSaveConflict(base: string, disk: string, proposed: string) {
  return disk !== base && disk !== proposed
}

export function editorAssetMap(store: { getDocumentAssets?: (id: string) => Record<string, string> }, id: string, inline: Record<string, string>) {
  return { ...store.getDocumentAssets?.(id), ...inline }
}
