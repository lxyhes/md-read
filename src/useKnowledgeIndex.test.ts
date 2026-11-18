import { invoke } from '@tauri-apps/api/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS, KNOWLEDGE_INDEX_VERSION } from './knowledgeHybridSearch'
import { parseMarkdown } from './parser'
import { loadKnowledgeVectors, saveKnowledgeVectors } from './persistence'
import { useKnowledgeIndex } from './useKnowledgeIndex'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('./persistence', () => ({
  loadKnowledgeVectors: vi.fn(), saveKnowledgeVectors: vi.fn(), deleteKnowledgeVectors: vi.fn(),
}))

const direction = Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, (_, index) => Number(index === 0))

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('desktop knowledge index', () => {
  it('restores a saved index and drops old vectors as soon as a source changes', async () => {
    vi.useFakeTimers()
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === 'knowledge_embedding_digest') return 'model-a'
      return Array.from({ length: (args as { inputs: string[] }).inputs.length }, () => direction)
    })
    const first = parseMarkdown('access.md', '# 权限手册\n\n人员离岗当日注销凭证。')
    const edited = parseMarkdown('access.md', '# 权限手册\n\n离职后隔天处理权限。')
    const sources = ref([first])
    const scope = effectScope()
    let restoredScope: ReturnType<typeof effectScope> | undefined
    try {
      const index = scope.run(() => useKnowledgeIndex(() => sources.value, () => sources.value, () => true, () => true))!
      expect((await index.search([first], '员工走了怎么关账号？')).keywordFallback).toBe(true)
      await vi.advanceTimersByTimeAsync(200)
      expect(index.indexCount.value).toBe(1)
      expect((await index.search([first], '员工走了怎么关账号？')).matches[0]?.snippet).toBe('人员离岗当日注销凭证。')

      const [id, hash, digest, version, payload] = vi.mocked(saveKnowledgeVectors).mock.calls[0]
      expect([id, hash, digest, version]).toEqual([first.id, first.sourceHash, 'model-a', KNOWLEDGE_INDEX_VERSION])
      scope.stop()
      vi.mocked(loadKnowledgeVectors).mockImplementation(async (_id, sourceHash) => sourceHash === hash ? payload : undefined)
      vi.mocked(saveKnowledgeVectors).mockClear()
      restoredScope = effectScope()
      const restored = restoredScope.run(() => useKnowledgeIndex(() => sources.value, () => sources.value, () => true, () => true))!
      await vi.advanceTimersByTimeAsync(200)
      expect(restored.indexCount.value).toBe(1)
      expect(saveKnowledgeVectors).not.toHaveBeenCalled()

      sources.value = [edited]
      expect(restored.indexCount.value).toBe(0)
      const result = await restored.search([first], '离职后怎么处理权限？')
      expect(result.keywordFallback).toBe(true)
      expect(result.matches.length).toBeGreaterThan(0)
      expect(result.matches.every(match => match.document.sourceHash === edited.sourceHash)).toBe(true)
      await vi.advanceTimersByTimeAsync(200)
      expect(restored.indexCount.value).toBe(1)
      expect(saveKnowledgeVectors).toHaveBeenCalledWith(edited.id, edited.sourceHash, 'model-a', KNOWLEDGE_INDEX_VERSION, expect.any(String))
    } finally {
      scope.stop()
      restoredScope?.stop()
    }
  })
})
