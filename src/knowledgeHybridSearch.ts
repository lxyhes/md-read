import { knowledgeEvidence, knowledgeRegionText, rankKnowledgeCandidates, selectKnowledgeMatches } from './knowledgeSearch'
import type { ReaderDocument, ReaderRegion } from './types'

export const KNOWLEDGE_EMBEDDING_MODEL = 'qwen3-embedding:0.6b'
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1024
export const KNOWLEDGE_INDEX_VERSION = `2:${KNOWLEDGE_EMBEDDING_DIMENSIONS}`
const CHUNK_SIZE = 800
const CANDIDATE_LIMIT = 24
// 语义召回的余弦相似度下限。作为可配置的导出常量，便于在评测集上按
// 「证据召回率 vs 误召回」扫描校准；默认值沿用原原型起点，待有标注证据后固化。
export const MIN_SIMILARITY = 0.35
// 全量余弦扫描的 chunk 数量阈值。当前语义检索是对所有已索引 chunk 做 O(N)
// 余弦扫描（无 ANN 索引），超过该规模后检索延迟会线性恶化，需要换 HNSW 等
// 向量索引引擎。这里仅在开发环境给出告警，不影响检索结果。
export const SCAN_CHUNK_WARNING_THRESHOLD = 20_000

export function knowledgeEmbeddingQuery(query: string) {
  return `Instruct: Given a question, retrieve relevant passages that provide evidence for the answer.\nQuery: ${query}`
}

type KnowledgeChunk = { input: string; region: ReaderRegion; text: string }
export type IndexedKnowledgeDocument = {
  document: ReaderDocument
  chunks: KnowledgeChunk[]
  vectors: Float32Array[]
}

function splitText(text: string, separator: string, prefix = '') {
  const parts: string[] = []
  let current = ''
  for (const line of text.split(separator)) {
    if (current && prefix.length + current.length + separator.length + line.length > CHUNK_SIZE) {
      parts.push(prefix + current)
      current = ''
    }
    current = current ? current + separator + line : line
  }
  if (current) parts.push(prefix + current)
  return parts
}

// 把长段落按语义边界切分，优先在句子结尾（中英文句号、问号、感叹号、换行）处断开，
// 避免按字符硬切把句子从中间截断、破坏 chunk 的语义完整性。句子边界不可用时退回字符硬切。
const SENTENCE_BOUNDARY = /(?<=[。！？!?；;\n])|(?<=\.)\s+/u

function splitTextBySentence(text: string, size: number) {
  const sentences = text.split(SENTENCE_BOUNDARY).map(part => part.trim()).filter(Boolean)
  const parts: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > size) {
      parts.push(current)
      current = ''
    }
    // 单句超过上限时，退回按字符硬切，避免无法收敛。
    if (sentence.length > size) {
      if (current) { parts.push(current); current = '' }
      for (const piece of Array.from(sentence).reduce<string[]>((acc, character) => {
        const last = acc.length ? acc[acc.length - 1] : ''
        if (last.length >= size) { acc.push(character) } else { acc[acc.length - 1] = last + character }
        return acc
      }, [])) parts.push(piece)
      continue
    }
    current = current ? current + sentence : sentence
  }
  if (current) parts.push(current)
  return parts.filter(Boolean)
}

export function knowledgeChunks(document: ReaderDocument): KnowledgeChunk[] {
  const headings = new Map(document.headings.map(heading => [heading.regionId, heading]))
  const path: ReaderDocument['headings'] = []
  const chunks: KnowledgeChunk[] = []
  const emit = (region: ReaderRegion, text: string) => {
    const heading = [...new Set([document.title, ...path.map(item => item.text)])].join(' / ')
    chunks.push({ input: `${heading}\n${text}`, region, text })
  }
  for (const region of document.regions) {
    const heading = headings.get(region.id)
    if (heading) {
      while (path.length && path[path.length - 1].depth >= heading.depth) path.pop()
      path.push(heading)
      continue
    }
    const text = region.textContent.trim()
    if (!text || ['image', 'video', 'thematic-break', 'footnotes'].includes(region.type)) continue
    const rows = region.metadata?.tableRows
    if (region.type === 'table' && Array.isArray(rows) && rows.length) {
      const parts = rows.length === 1 ? rows : splitText(rows.slice(1).join('\n'), '\n', `${rows[0]}\n`)
      for (const part of parts) emit(region, part)
    } else if (['code', 'mermaid', 'table', 'math', 'list'].includes(region.type)) {
      for (const part of splitText(text, '\n')) emit(region, part)
    } else if (text.length > CHUNK_SIZE) {
      for (const part of splitTextBySentence(text, CHUNK_SIZE)) emit(region, part)
    } else {
      emit(region, text)
    }
  }
  return chunks
}

export function normalizeKnowledgeVector(values: number[]) {
  const norm = Math.hypot(...values)
  if (values.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS || !Number.isFinite(norm) || !norm) throw new Error('向量维度或数值无效')
  return Float32Array.from(values, value => value / norm)
}

function cosine(left: Float32Array, right: Float32Array) {
  let score = 0
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index]
  return score
}

const warned = new Set<string>()
function warnOnce(key: string, message: string) {
  if (warned.has(key) || typeof console === 'undefined') return
  warned.add(key)
  console.warn(`[墨阅知识库] ${message}`)
}

export function searchKnowledgeHybrid(documents: ReaderDocument[], indexes: IndexedKnowledgeDocument[], query: string, vector: Float32Array, limit = 8) {
  const lexical = rankKnowledgeCandidates(documents, query, limit)
  const selected = new Map(documents.map(document => [document.id, document]))
  const semantic = indexes.flatMap(({ document, chunks, vectors }) => {
    const current = selected.get(document.id)
    if (!current || current.sourceHash !== document.sourceHash) return []
    return chunks.map((chunk, index) => ({ document: current, chunk, score: cosine(vector, vectors[index]) }))
  }).filter(item => item.score >= MIN_SIMILARITY).sort((left, right) => right.score - left.score)

  if (indexes.reduce((total, item) => total + item.chunks.length, 0) > SCAN_CHUNK_WARNING_THRESHOLD) {
    warnOnce('knowledge-scan-scale', '语义检索已索引的 chunk 超过阈值，全量余弦扫描可能明显变慢，建议接入 HNSW 等向量索引。')
  }

  const semanticMatches = new Map<string, ReturnType<typeof knowledgeEvidence>>()
  for (const { document, chunk, score } of semantic) {
    if (semanticMatches.has(chunk.region.id)) continue
    semanticMatches.set(chunk.region.id, knowledgeEvidence(document, chunk.region, query, score, chunk.text))
    if (semanticMatches.size === CANDIDATE_LIMIT) break
  }
  if (!semanticMatches.size) return { matches: selectKnowledgeMatches(lexical, query, limit), hybrid: false }

  const ranked = new Map<string, ReturnType<typeof knowledgeEvidence>>()
  const technicalTerms = query.match(/\b(?:[A-Z][A-Z0-9]{1,}|[a-zA-Z]\w*[_-][\w-]+|\d+(?:\.\d+)*|[a-z]\w*[A-Z]\w*)\b/g) ?? []
  const exactRegionIds = new Set<string>()
  lexical.slice(0, CANDIDATE_LIMIT).forEach((match, rank) => {
    const tokens = new Set(knowledgeRegionText(match.region).toLowerCase().match(/[a-z0-9_.-]+/g) ?? [])
    const exact = technicalTerms.length && technicalTerms.every(term => tokens.has(term.toLowerCase()))
    if (exact) exactRegionIds.add(match.region.id)
    ranked.set(match.region.id, knowledgeEvidence(match.document, match.region, query, 1 / (60 + rank + 1) + (exact ? 0.04 : 0)))
  })
  Array.from(semanticMatches.values()).forEach((match, rank) => {
    const existing = ranked.get(match.region.id)
    const evidence = existing && exactRegionIds.has(match.region.id) ? existing : match
    ranked.set(match.region.id, { ...evidence, score: (existing?.score ?? 0) + 1 / (60 + rank + 1) })
  })
  return { matches: selectKnowledgeMatches([...ranked.values()].sort((left, right) => right.score - left.score), query, limit), hybrid: true }
}
