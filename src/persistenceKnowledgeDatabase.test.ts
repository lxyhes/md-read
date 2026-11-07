import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeConversation } from './knowledgeConversations'

const appData = new Map<string, string>()
const localValues = new Map<string, string>()
const execute = vi.fn(async (sql: string, params?: unknown[]) => {
  if (sql.includes('INSERT OR REPLACE INTO app_data')) appData.set(String(params?.[0]), String(params?.[1]))
  if (sql.includes('DELETE FROM app_data')) appData.delete(String(params?.[0]))
  return { rowsAffected: 1 }
})
const select = vi.fn(async (sql: string, params?: unknown[]) => {
  if (sql.includes('FROM app_data')) {
    const value = appData.get(String(params?.[0]))
    return value === undefined ? [] : [{ value }]
  }
  return [{ id: 'saved', title: 'Saved', sourceIds: '["doc"]', messages: '[]', createdAt: 1, updatedAt: 2 }]
})

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: async () => ({ execute, select }) } }))

const storage = {
  getItem: (key: string) => localValues.get(key) ?? null,
  setItem: () => { throw new DOMException('quota exceeded', 'QuotaExceededError') },
  removeItem: (key: string) => { localValues.delete(key) },
}
vi.stubGlobal('localStorage', storage)

describe('desktop knowledge persistence', () => {
  beforeEach(() => { execute.mockClear(); select.mockClear(); appData.clear(); localValues.clear() })

  it('keeps SQLite authoritative when the localStorage mirror is full', async () => {
    const { loadKnowledgeConversations, saveAppSetting, saveKnowledgeConversation } = await import('./persistence')
    const conversation: KnowledgeConversation = { id: 'saved', title: 'Saved', sourceIds: ['doc'], createdAt: 1, updatedAt: 2, messages: [] }
    await expect(saveKnowledgeConversation(conversation)).resolves.toBeUndefined()
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('INSERT OR REPLACE INTO knowledge_conversations'))).toBe(true)
    await expect(loadKnowledgeConversations()).resolves.toEqual([conversation])
    await expect(saveAppSetting('moyue:ai-settings', { model: 'qwen3.5:9b' })).resolves.toBeUndefined()
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('INSERT OR REPLACE INTO app_settings'))).toBe(true)
  })

  it('moves legacy large data to SQLite before removing the local copy', async () => {
    const { loadDurableData } = await import('./persistence')
    localValues.set('moyue:clipboard-history', JSON.stringify([{ kind: 'text', text: '保留我' }]))

    await expect(loadDurableData('moyue:clipboard-history', value => Array.isArray(value) ? value : null))
      .resolves.toEqual([{ kind: 'text', text: '保留我' }])
    expect(appData.has('moyue:clipboard-history')).toBe(true)
    expect(localValues.has('moyue:clipboard-history')).toBe(false)
  })
})
