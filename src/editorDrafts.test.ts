import { describe, expect, it } from 'vitest'
import { hasSaveConflict, readEditorDraft, removeEditorDraft, saveEditorDraft } from './editorDrafts'

describe('editor recovery and conflict guards', () => {
  it('recovers an exact draft by canonical Windows path without touching its baseline', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    const draft = { path: 'E:\\Notes\\a.md', source: '草稿\r\n\n$x$', baseSource: '原文', updatedAt: 1 }
    saveEditorDraft(draft, storage)
    expect(readEditorDraft('e:/notes/a.md', storage)).toEqual(draft)
    removeEditorDraft(draft.path, storage)
    expect(readEditorDraft(draft.path, storage)).toBeNull()
  })
  it('never silently ignores storage failure or accepts a corrupted backup', () => {
    expect(() => saveEditorDraft({ path: 'a', source: 'b', baseSource: '', updatedAt: 1 }, { setItem() { throw Error('quota') } })).toThrow('quota')
    expect(readEditorDraft('a', { getItem: () => '{broken' })).toBeNull()
    expect(readEditorDraft('a', { getItem: () => '{"path":"a","updatedAt":1}' })).toBeNull()
  })
  it('blocks external edits, but accepts unchanged disk and already-completed saves', () => {
    expect(hasSaveConflict('base', 'external', 'draft')).toBe(true)
    expect(hasSaveConflict('base', 'base', 'draft')).toBe(false)
    expect(hasSaveConflict('base', 'draft', 'draft')).toBe(false)
  })
})
