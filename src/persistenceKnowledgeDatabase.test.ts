import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeConversation } from './knowledgeConversations'

const execute = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rowsAffected: 1 }))
const select = vi.fn(async (_sql: string, _params?: unknown[]) => [{
  id: 'saved', title: 'Saved', sourceIds: '["doc"]', messages: '[]', createdAt: 1, updatedAt: 2,
}])

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: async () => ({ execute, select }) } }))

const storage = {
  getItem: () => null,
  setItem: () => { throw new DOMException('quota exceeded', 'QuotaExceededError') },
  removeItem: () => {},
}
vi.stubGlobal('localStorage', storage)

describe('desktop knowledge persistence', () => {
  beforeEach(() => { execute.mockClear(); select.mockClear() })

  it('keeps SQLite authoritative when the localStorage mirror is full', async () => {
    const { loadKnowledgeConversations, saveAppSetting, saveKnowledgeConversation } = await import('./persistence')
    const conversation: KnowledgeConversation = { id: 'saved', title: 'Saved', sourceIds: ['doc'], createdAt: 1, updatedAt: 2, messages: [] }
    await expect(saveKnowledgeConversation(conversation)).resolves.toBeUndefined()
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('INSERT OR REPLACE INTO knowledge_conversations'))).toBe(true)
    await expect(loadKnowledgeConversations()).resolves.toEqual([conversation])
    await expect(saveAppSetting('moyue:ai-settings', { model: 'qwen3.5:9b' })).resolves.toBeUndefined()
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('INSERT OR REPLACE INTO app_settings'))).toBe(true)
  })
})
