import { knowledgeEvidence, knowledgeRegionText, rankKnowledgeCandidates, selectKnowledgeMatches } from './knowledgeSearch'
import type { ReaderDocument, ReaderRegion } from './types'

export const KNOWLEDGE_EMBEDDING_MODEL = 'qwen3-embedding:0.6b'
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1024
export const KNOWLEDGE_INDEX_VERSION = `2:${KNOWLEDGE_EMBEDDING_DIMENSIONS}`
const CHUNK_SIZE = 800
const CANDIDATE_LIMIT = 24
// shortcut: calibrate the initial relevance floor once real queries have labelled evidence.
const MIN_SIMILARITY = 0.35

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
      const characters = Array.from(text)
      for (let start = 0; start < characters.length; start += CHUNK_SIZE) {
        const part = characters.slice(start, start + CHUNK_SIZE).join('').trim()
        if (part) emit(region, part)
      }
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

export function searchKnowledgeHybrid(documents: ReaderDocument[], indexes: IndexedKnowledgeDocument[], query: string, vector: Float32Array, limit = 8) {
  const lexical = rankKnowledgeCandidates(documents, query, limit)
  const selected = new Map(documents.map(document => [document.id, document]))
  const semantic = indexes.flatMap(({ document, chunks, vectors }) => {
    const current = selected.get(document.id)
    if (!current || current.sourceHash !== document.sourceHash) return []
    return chunks.map((chunk, index) => ({ document: current, chunk, score: cosine(vector, vectors[index]) }))
  }).filter(item => item.score >= MIN_SIMILARITY).sort((left, right) => right.score - left.score)

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
