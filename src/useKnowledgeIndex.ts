import { computed, onScopeDispose, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS, KNOWLEDGE_INDEX_VERSION, knowledgeChunks, knowledgeEmbeddingQuery, normalizeKnowledgeVector, searchKnowledgeHybrid, type IndexedKnowledgeDocument } from './knowledgeHybridSearch'
import { deleteKnowledgeVectors, loadKnowledgeVectors, saveKnowledgeVectors } from './persistence'
import { searchKnowledge } from './knowledgeSearch'
import type { ReaderDocument } from './types'

const BATCH_SIZE = 8
const QUERY_BUDGET_MS = 2_000

function packVectors(vectors: Float32Array[]) {
  return vectors.map(vector => btoa(String.fromCharCode(...new Uint8Array(vector.buffer)))).join('.')
}

function unpackVectors(packed: string | undefined, count: number): Float32Array[] | null {
  if (packed === undefined) return null
  if (!packed) return count === 0 ? [] : null
  try {
    const values = packed.split('.').map(part => {
      const bytes = Uint8Array.from(atob(part), character => character.charCodeAt(0))
      return new Float32Array(bytes.buffer)
    })
    return values.length === count && values.every(vector => {
      if (vector.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) return false
      const norm = Math.hypot(...vector)
      return Math.abs(norm - 1) < 0.001
    }) ? values : null
  } catch { return null }
}

async function embed(inputs: string[], digest: string, query = false) {
  const values = await invoke<number[][]>('knowledge_embed', { inputs, digest, query })
  if (values.length !== inputs.length) throw new Error('本机 Ollama 返回的向量条数不匹配')
  return values.map(normalizeKnowledgeVector)
}

async function withinQueryBudget<T>(request: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([request, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), QUERY_BUDGET_MS) })])
  } finally { clearTimeout(timer) }
}

export function useKnowledgeIndex(sources: () => ReaderDocument[], allDocuments: () => ReaderDocument[], enabled: () => boolean, active: () => boolean) {
  const digest = ref('')
  const error = ref('')
  const indexing = ref(false)
  const indexCount = ref(0)
  const indexes = new Map<string, IndexedKnowledgeDocument>()
  let revision = 0
  let modelCheck = 0
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const versions = computed(() => JSON.stringify(sources().map(document => [document.id, document.sourceHash]).sort()))

  function updateCount() {
    const selected = new Map(sources().map(document => [document.id, document.sourceHash]))
    for (const [id, index] of indexes) if (selected.get(id) !== index.document.sourceHash) indexes.delete(id)
    indexCount.value = indexes.size
  }

  function setDigest(next: string) {
    if (next !== digest.value) indexes.clear()
    digest.value = next
    updateCount()
  }

  async function checkModel() {
    const check = ++modelCheck
    try {
      const next = await invoke<string>('knowledge_embedding_digest')
      if (check !== modelCheck) return ''
      if (enabled()) setDigest(next)
      error.value = ''
      return next
    } catch (failure) {
      if (check !== modelCheck) return ''
      if (enabled()) setDigest('')
      error.value = String(failure)
      return ''
    }
  }

  async function indexSources(job: number) {
    const model = await checkModel()
    const current = () => job === revision && model === digest.value && enabled() && active()
    if (!model || !current()) return
    for (const document of sources()) {
      if (!current()) return
      if (indexes.has(document.id)) continue
      try {
        const chunks = knowledgeChunks(document)
        const cached = await loadKnowledgeVectors(document.id, document.sourceHash, model, KNOWLEDGE_INDEX_VERSION)
        if (!current()) return
        const loaded = unpackVectors(cached, chunks.length)
        const vectors = loaded ?? []
        if (!loaded) {
          for (let offset = 0; offset < chunks.length; offset += BATCH_SIZE) {
            vectors.push(...await embed(chunks.slice(offset, offset + BATCH_SIZE).map(chunk => chunk.input), model))
            if (!current()) return
          }
          await saveKnowledgeVectors(document.id, document.sourceHash, model, KNOWLEDGE_INDEX_VERSION, packVectors(vectors))
          if (!allDocuments().some(item => item.id === document.id)) await deleteKnowledgeVectors(document.id)
          if (!current()) return
        }
        indexes.set(document.id, { document, chunks, vectors })
        updateCount()
      } catch (failure) {
        if (current()) error.value = `「${document.title}」语义索引失败：${String(failure)}`
      }
    }
  }

  async function run() {
    if (running || !enabled() || !active() || !sources().length) return
    running = true
    indexing.value = true
    const job = revision
    try { await indexSources(job) }
    catch (failure) { if (job === revision) error.value = String(failure) }
    finally {
      running = false
      indexing.value = false
      if (job !== revision) void run()
    }
  }

  function schedule() {
    revision += 1
    updateCount()
    clearTimeout(timer)
    timer = setTimeout(() => { void run() }, 180)
  }

  watch([versions, enabled, active], () => {
    if (!enabled()) { setDigest(''); error.value = '' }
    schedule()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { revision += 1; clearTimeout(timer) })

  async function search(documents: ReaderDocument[], query: string) {
    const currentSources = () => {
      const submitted = new Set(documents.map(document => document.id))
      return sources().filter(document => submitted.has(document.id))
    }
    const fallback = () => ({ matches: searchKnowledge(currentSources(), query), keywordFallback: enabled() })
    if (!enabled()) return fallback()
    const model = digest.value
    if (!model || ![...indexes.values()].some(index => index.vectors.length)) {
      if (!running) schedule()
      return fallback()
    }
    try {
      const vectors = await withinQueryBudget(embed([knowledgeEmbeddingQuery(query)], model, true))
      if (!vectors || !enabled() || model !== digest.value) return fallback()
      const { matches, hybrid } = searchKnowledgeHybrid(currentSources(), [...indexes.values()], query, vectors[0])
      if (!running && error.value) schedule()
      return { matches, keywordFallback: !hybrid }
    } catch {
      if (!running) schedule()
      return fallback()
    }
  }

  return { indexCount, indexing, error, checkModel, schedule, search }
}
