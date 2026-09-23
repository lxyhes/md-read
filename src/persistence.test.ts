import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDocument, loadDocumentSnapshots, saveDocumentSnapshot } from './persistence'
import type { ReaderDocument } from './types'

const values = new Map<string, string>()
const memoryStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value) },
  removeItem: (key: string) => { values.delete(key) },
  clear: () => { values.clear() },
}

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage })

function documentOf(id: string, title = id): ReaderDocument {
  return {
    id,
    path: `${id}.md`,
    title,
    headings: [],
    regions: [],
    wordCount: 0,
    estimatedReadMinutes: 1,
    sourceHash: id,
    source: `# ${title}`,
    updatedAt: 1,
  }
}

describe('document snapshot persistence', () => {
  beforeEach(() => memoryStorage.clear())

  it('migrates legacy snapshots and updates one document independently', async () => {
    const first = documentOf('first')
    const second = documentOf('second')
    memoryStorage.setItem('moyue:documents:full', JSON.stringify([first, second]))

    expect(loadDocumentSnapshots().map((document) => document.id)).toEqual(['first', 'second'])
    await saveDocumentSnapshot({ ...first, title: 'Updated' })

    expect(loadDocumentSnapshots().map((document) => document.title)).toEqual(['Updated', 'second'])
    expect(memoryStorage.getItem('moyue:documents:full')).toBeNull()
  })

  it('removes a keyed snapshot without rewriting other documents', async () => {
    await saveDocumentSnapshot(documentOf('first'))
    await saveDocumentSnapshot(documentOf('second'))
    await deleteDocument('first')

    expect(loadDocumentSnapshots().map((document) => document.id)).toEqual(['second'])
  })
})
