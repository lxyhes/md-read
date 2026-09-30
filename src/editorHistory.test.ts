import { describe, expect, it } from 'vitest'
import { createEditorHistory, recordEditorHistory, stepEditorHistory } from './editorHistory'

const snapshot = (value: string, start = value.length, end = start) => ({ value, start, end })

describe('source editor history', () => {
  it('undoes formatting and restores both selection endpoints', () => {
    const before = snapshot('word', 0, 4)
    const after = snapshot('**word**', 2, 6)
    const history = createEditorHistory(before)
    recordEditorHistory(history, before, after)
    expect(stepEditorHistory(history, -1)).toEqual(before)
    expect(stepEditorHistory(history, 1)).toEqual(after)
  })
  it('merges adjacent typing but keeps toolbar edits separate', () => {
    const history = createEditorHistory(snapshot(''))
    recordEditorHistory(history, snapshot(''), snapshot('a'), 'insertText', 100)
    recordEditorHistory(history, snapshot('a'), snapshot('ab'), 'insertText', 200)
    recordEditorHistory(history, snapshot('ab'), snapshot('**ab**'))
    expect(stepEditorHistory(history, -1)?.value).toBe('ab')
    expect(stepEditorHistory(history, -1)?.value).toBe('')
  })
  it('separates typing after a pause or caret jump', () => {
    const history = createEditorHistory(snapshot(''))
    recordEditorHistory(history, snapshot(''), snapshot('a'), 'insertText', 100)
    recordEditorHistory(history, snapshot('a'), snapshot('ab'), 'insertText', 1000)
    recordEditorHistory(history, snapshot('ab', 0), snapshot('xab', 1), 'insertText', 1100)
    expect(history.entries).toHaveLength(4)
  })
  it('discards redo after a new edit without merging into the old branch', () => {
    const history = createEditorHistory(snapshot(''))
    recordEditorHistory(history, snapshot(''), snapshot('a'), 'insertText', 100)
    recordEditorHistory(history, snapshot('a'), snapshot('ab'), '', 200)
    stepEditorHistory(history, -1)
    recordEditorHistory(history, snapshot('a'), snapshot('ax'), 'insertText', 300)
    expect(stepEditorHistory(history, 1)).toBeNull()
    expect(stepEditorHistory(history, -1)?.value).toBe('a')
  })
  it('ignores selection-only changes and stops at history boundaries', () => {
    const history = createEditorHistory(snapshot('text'))
    recordEditorHistory(history, snapshot('text'), snapshot('text', 0))
    expect(history.entries).toHaveLength(1)
    expect(stepEditorHistory(history, -1)).toBeNull()
    expect(stepEditorHistory(history, 1)).toBeNull()
  })
  it('bounds retained snapshots to 100', () => {
    const history = createEditorHistory(snapshot('0'))
    for (let i = 1; i <= 110; i++) recordEditorHistory(history, snapshot(String(i - 1)), snapshot(String(i)))
    expect(history.entries).toHaveLength(100)
    expect(history.entries[0].value).toBe('11')
    expect(history.index).toBe(99)
  })
})
