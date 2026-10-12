import type { ReaderDocument, ReaderRegion } from './types'

export type KnowledgeSearchMatch = {
  document: ReaderDocument
  region: ReaderRegion
  snippet: string
  score: number
}

function termsFor(query: string) {
  const lower = query.toLowerCase()
  const words = lower.match(/[a-z0-9_]+/g) ?? []
  const chineseRuns = lower.match(/[\u4e00-\u9fff]+/g) ?? []
  const chineseTerms = chineseRuns.flatMap((run) => [run, ...Array.from({ length: Math.max(0, run.length - 1) }, (_, index) => run.slice(index, index + 2))])
  return [...new Set([...words, ...chineseTerms].filter((term) => term.length > 1))]
}

function excerpt(text: string, query: string, terms: string[]) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const lower = normalized.toLowerCase()
  const startAt = Math.max(0, [query, ...terms].map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0)
  const start = Math.max(0, startAt - 46)
  const end = Math.min(normalized.length, start + 150)
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`
}

export function searchKnowledge(documents: ReaderDocument[], query: string, limit = 8): KnowledgeSearchMatch[] {
  const phrase = query.trim().toLowerCase()
  if (!phrase) return []
  const terms = termsFor(phrase)
  return documents.flatMap((document) => document.regions.flatMap((region) => {
    const text = `${document.title} ${document.path} ${region.textContent}`.replace(/\s+/g, ' ')
    const lower = text.toLowerCase()
    const phraseScore = lower.includes(phrase) ? 6 : 0
    const termScore = terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0)
    if (!phraseScore && !termScore) return []
    const score = phraseScore + termScore + (lower.startsWith(document.title.toLowerCase()) && lower.includes(phrase) ? 2 : 0)
    return [{ document, region, snippet: excerpt(region.textContent, phrase, terms), score }]
  })).sort((a, b) => b.score - a.score).slice(0, limit)
}
