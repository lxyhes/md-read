import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDocument, deleteKnowledgeConversation, loadDocumentSnapshots, loadKnowledgeActivity, loadKnowledgeConversations, recordKnowledgeAnswer, saveDocumentSnapshot, saveKnowledgeConversation } from './persistence'
import type { KnowledgeConversation } from './knowledgeConversations'
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

function conversationOf(id: string, updatedAt = 1): KnowledgeConversation {
  return { id, title: id, sourceIds: ['doc-1'], createdAt: 1, updatedAt, messages: [{
    id: `message-${id}`, role: 'assistant', content: '回答', createdAt: updatedAt,
    citations: [{ index: 1, documentId: 'doc-1', documentTitle: '资料', documentPath: 'doc-1.md', regionId: 'region-1', excerpt: '原文摘录', sourceHash: 'hash-1' }],
  }] }
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

describe('knowledge workspace persistence', () => {
  beforeEach(() => memoryStorage.clear())

  it('restores whole conversations and deleting one leaves the others intact', async () => {
    await saveKnowledgeConversation(conversationOf('first'))
    await saveKnowledgeConversation(conversationOf('second', 2))
    expect((await loadKnowledgeConversations()).map((conversation) => conversation.id)).toEqual(['second', 'first'])

    await deleteKnowledgeConversation('first')
    expect((await loadKnowledgeConversations()).map((conversation) => conversation.id)).toEqual(['second'])
    expect((await loadKnowledgeConversations())[0].messages[0].citations[0].excerpt).toBe('原文摘录')
  })

  it('increments only the requested local day for successful answers', async () => {
    expect(await recordKnowledgeAnswer('2026-10-13')).toEqual({ '2026-10-13': 1 })
    expect(await recordKnowledgeAnswer('2026-10-13')).toEqual({ '2026-10-13': 2 })
    expect(await recordKnowledgeAnswer('2026-10-12')).toEqual({ '2026-10-13': 2, '2026-10-12': 1 })
    expect(await loadKnowledgeActivity()).toEqual({ '2026-10-13': 2, '2026-10-12': 1 })
  })
})
