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

type SearchIndex = {
  content: string[]
  headings: string[]
  byTerm: Map<string, Set<number>>
}

const indexes = new WeakMap<ReaderDocument, SearchIndex>()

function indexFor(document: ReaderDocument) {
  const saved = indexes.get(document)
  if (saved) return saved
  const headingByRegion = new Map(document.headings.map((heading) => [heading.regionId, heading.text.toLowerCase()]))
  const content: string[] = []
  const headings: string[] = []
  const byTerm = new Map<string, Set<number>>()
  let currentHeading = ''
  document.regions.forEach((region, index) => {
    currentHeading = headingByRegion.get(region.id) ?? currentHeading
    const normalized = region.textContent.replace(/\s+/g, ' ').toLowerCase()
    content.push(normalized)
    headings.push(currentHeading)
    const indexedTerms = headingByRegion.has(region.id) ? [...termsFor(normalized), ...termsFor(currentHeading)] : termsFor(normalized)
    for (const term of new Set(indexedTerms)) {
      const matches = byTerm.get(term)
      if (matches) matches.add(index)
      else byTerm.set(term, new Set([index]))
    }
  })
  const created = { content, headings, byTerm }
  indexes.set(document, created)
  return created
}

function sampledRegionIndexes(length: number, limit: number) {
  if (length <= limit) return Array.from({ length }, (_, index) => index)
  return Array.from({ length: limit }, (_, index) => Math.round(index * (length - 1) / Math.max(1, limit - 1)))
}

function excerpt(text: string, query: string, terms: string[]) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const lower = normalized.toLowerCase()
  const startAt = Math.max(0, [query, ...terms].map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0)
  const start = Math.max(0, startAt - 200)
  const end = Math.min(normalized.length, start + 1200)
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`
}

export function searchKnowledge(documents: ReaderDocument[], query: string, limit = 8): KnowledgeSearchMatch[] {
  const phrase = query.trim().toLowerCase()
  if (!phrase || limit <= 0) return []
  const terms = termsFor(phrase)
  const asksForOverview = /(?:总结|概括|摘要|核心|要点|讲了什么|全文|overview|summar(?:y|ize))/i.test(phrase)
  const ranked = documents.flatMap((document) => {
    const index = indexFor(document)
    const title = document.title.toLowerCase()
    const path = document.path.toLowerCase()
    const titleTerms = terms.filter((term) => title.includes(term) || path.includes(term))
    const candidateIndexes = new Set(terms.flatMap((term) => [...(index.byTerm.get(term) ?? [])]))
    if (titleTerms.length && (asksForOverview || !candidateIndexes.size)) {
      for (const regionIndex of sampledRegionIndexes(document.regions.length, limit)) candidateIndexes.add(regionIndex)
    }
    return [...candidateIndexes].flatMap((regionIndex) => {
      const region = document.regions[regionIndex]
      if (!region) return []
      const content = index.content[regionIndex] ?? ''
      const currentHeading = index.headings[regionIndex] ?? ''
      const contentTerms = terms.filter((term) => content.includes(term))
      const headingTerms = terms.filter((term) => currentHeading.includes(term))
      const phraseScore = content.includes(phrase) ? 8 : 0
      if (!phraseScore && !contentTerms.length && !titleTerms.length && !headingTerms.length) return []
      const score = phraseScore + contentTerms.length * 2 + titleTerms.length * 4 + headingTerms.length * 3
      return [{ document, region, snippet: excerpt(region.textContent, phrase, terms), score }]
    })
  }).sort((a, b) => b.score - a.score)

  const documentCount = new Set(ranked.map((match) => match.document.id)).size
  const perDocumentLimit = documentCount <= 1 ? limit : Math.max(1, Math.ceil(limit / 3))
  const counts = new Map<string, number>()
  const signatures = new Map<string, Set<Set<string>>>()
  const matches: KnowledgeSearchMatch[] = []
  for (const match of ranked) {
    const count = counts.get(match.document.id) ?? 0
    if (count >= perDocumentLimit) continue
    const key = match.document.id
    const prior = signatures.get(key) ?? new Set<Set<string>>()
    const termsInSnippet = new Set(termsFor(match.snippet.replace(/…/g, '')))
    const duplicate = [...prior].some((existing) => {
      const intersection = [...termsInSnippet].filter((term) => existing.has(term)).length
      return intersection / Math.max(1, new Set([...termsInSnippet, ...existing]).size) >= 0.82
    })
    if (!asksForOverview && duplicate) continue
    prior.add(termsInSnippet)
    signatures.set(key, prior)
    counts.set(key, count + 1)
    matches.push(match)
    if (matches.length >= limit) break
  }
  return matches
}
