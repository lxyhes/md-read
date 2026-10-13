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
  if (!phrase || limit <= 0) return []
  const terms = termsFor(phrase)
  const ranked = documents.flatMap((document) => {
    const headingByRegion = new Map(document.headings.map((heading) => [heading.regionId, heading.text.toLowerCase()]))
    let currentHeading = ''
    return document.regions.flatMap((region) => {
      currentHeading = headingByRegion.get(region.id) ?? currentHeading
      const content = region.textContent.replace(/\s+/g, ' ').toLowerCase()
      const title = document.title.toLowerCase()
      const path = document.path.toLowerCase()
      const contentTerms = terms.filter((term) => content.includes(term))
      const titleTerms = terms.filter((term) => title.includes(term) || path.includes(term))
      const headingTerms = terms.filter((term) => currentHeading.includes(term))
      const phraseScore = content.includes(phrase) ? 8 : 0
      if (!phraseScore && !contentTerms.length && !titleTerms.length && !headingTerms.length) return []
      const score = phraseScore + contentTerms.length * 2 + titleTerms.length * 4 + headingTerms.length * 3
      return [{ document, region, snippet: excerpt(region.textContent, phrase, terms), score }]
    })
  }).sort((a, b) => b.score - a.score)

  const perDocumentLimit = Math.max(1, Math.ceil(limit / 3))
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
    if (duplicate) continue
    prior.add(termsInSnippet)
    signatures.set(key, prior)
    counts.set(key, count + 1)
    matches.push(match)
    if (matches.length >= limit) break
  }
  return matches
}
