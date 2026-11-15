import type { ReaderDocument, ReaderRegion } from './types'

export type KnowledgeSearchMatch = {
  document: ReaderDocument
  region: ReaderRegion
  snippet: string
  context: string
  score: number
}

const QUERY_NOISE = /(?:请问|请帮我|帮我|一下|详细|具体|怎么|如何|什么|哪些|这个|这些|关于|讲了什么|告诉我|进行|说明|介绍)/g
const STOP_TERMS = new Set(['一下', '请问', '怎么', '如何', '什么', '哪些', '这个', '这些', '关于', 'the', 'and', 'what', 'how', 'please'])

function termsFor(value: string) {
  const lower = value.toLowerCase()
  const words = lower.match(/[a-z0-9_]+/g) ?? []
  const chineseRuns = lower.match(/[\u4e00-\u9fff]+/g) ?? []
  const chineseTerms = chineseRuns.flatMap((run) => run.length <= 2
    ? [run]
    : Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2)))
  return [...words, ...chineseTerms].filter((term) => term.length > 1 && !STOP_TERMS.has(term))
}

function queryTermsFor(query: string) {
  const useful = query.toLowerCase().replace(QUERY_NOISE, ' ')
  const terms = termsFor(useful)
  return [...new Set(terms.length ? terms : termsFor(query))]
}

type SearchIndex = {
  content: string[]
  headings: string[]
  byTerm: Map<string, Set<number>>
  frequencies: Array<Map<string, number>>
  lengths: number[]
  averageLength: number
}

const indexes = new WeakMap<ReaderDocument, SearchIndex>()

function indexFor(document: ReaderDocument) {
  const saved = indexes.get(document)
  if (saved) return saved
  const headingByRegion = new Map(document.headings.map((heading) => [heading.regionId, heading.text.toLowerCase()]))
  const content: string[] = []
  const headings: string[] = []
  const byTerm = new Map<string, Set<number>>()
  const frequencies: Array<Map<string, number>> = []
  const lengths: number[] = []
  let currentHeading = ''
  document.regions.forEach((region, index) => {
    currentHeading = headingByRegion.get(region.id) ?? currentHeading
    const normalized = region.textContent.replace(/\s+/g, ' ').toLowerCase()
    const tokens = termsFor(normalized)
    const counts = new Map<string, number>()
    content.push(normalized)
    headings.push(currentHeading)
    frequencies.push(counts)
    lengths.push(Math.max(1, tokens.length))
    for (const term of tokens) {
      counts.set(term, (counts.get(term) ?? 0) + 1)
      const matches = byTerm.get(term)
      if (matches) matches.add(index)
      else byTerm.set(term, new Set([index]))
    }
  })
  const created = {
    content, headings, byTerm, frequencies, lengths,
    averageLength: lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, lengths.length),
  }
  indexes.set(document, created)
  return created
}

function sampledRegionIndexes(document: ReaderDocument, limit: number) {
  const meaningful = document.regions.flatMap((region, index) =>
    region.textContent.trim() && !['thematic-break', 'image', 'video'].includes(region.type) ? [index] : [])
  if (meaningful.length <= limit) return meaningful
  return Array.from({ length: limit }, (_, index) => meaningful[Math.round(index * (meaningful.length - 1) / Math.max(1, limit - 1))])
}

function excerpt(text: string, query: string, terms: string[], limit = 1200) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const lower = normalized.toLowerCase()
  const startAt = Math.max(0, [query, ...terms].map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0)
  const start = Math.max(0, startAt - 200)
  const end = Math.min(normalized.length, start + limit)
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`
}

function contextFor(document: ReaderDocument, regionIndex: number, heading: string, query: string, terms: string[]) {
  const text = [regionIndex - 1, regionIndex, regionIndex + 1].flatMap((index) => {
    const region = document.regions[index]
    return region?.textContent.trim() && !['thematic-break', 'image', 'video'].includes(region.type) ? [region.textContent] : []
  }).join('\n')
  const body = excerpt(text, query, terms, 1600)
  return heading && !body.toLowerCase().startsWith(heading) ? `章节：${heading}\n${body}` : body
}

function overviewQuestion(query: string) {
  return /(?:总结|概括|摘要|核心|要点|讲了什么|全文|对比|比较|异同|overview|summar(?:y|ize)|compare)/i.test(query)
}

export function searchKnowledge(documents: ReaderDocument[], query: string, limit = 8): KnowledgeSearchMatch[] {
  const phrase = query.trim().toLowerCase()
  if (!phrase || limit <= 0) return []
  const terms = queryTermsFor(phrase)
  const asksForOverview = overviewQuestion(phrase)
  const documentIndexes = documents.map((document) => ({ document, index: indexFor(document) }))
  const totalRegions = documentIndexes.reduce((sum, item) => sum + item.document.regions.length, 0)
  const documentFrequency = new Map<string, number>()
  for (const term of terms) {
    documentFrequency.set(term, documentIndexes.reduce((sum, item) => sum + (item.index.byTerm.get(term)?.size ?? 0), 0))
  }
  const titleMatchedIds = new Set(documentIndexes.flatMap(({ document }) => {
    const value = `${document.title} ${document.path}`.toLowerCase()
    return terms.some((term) => value.includes(term)) ? [document.id] : []
  }))
  const overviewScope = titleMatchedIds.size ? titleMatchedIds : new Set(documents.map((document) => document.id))

  const ranked = documentIndexes.flatMap(({ document, index }) => {
    const title = `${document.title} ${document.path}`.toLowerCase()
    const titleTerms = terms.filter((term) => title.includes(term))
    const candidateIndexes = new Set(terms.flatMap((term) => [...(index.byTerm.get(term) ?? [])]))
    if (asksForOverview && overviewScope.has(document.id)) {
      for (const regionIndex of sampledRegionIndexes(document, Math.max(limit, 4))) candidateIndexes.add(regionIndex)
    }
    return [...candidateIndexes].flatMap((regionIndex) => {
      const region = document.regions[regionIndex]
      if (!region) return []
      const content = index.content[regionIndex] ?? ''
      const currentHeading = index.headings[regionIndex] ?? ''
      let score = asksForOverview && overviewScope.has(document.id) ? 0.25 : 0
      for (const term of terms) {
        const frequency = index.frequencies[regionIndex]?.get(term) ?? 0
        if (!frequency) continue
        const frequencyAcrossRegions = documentFrequency.get(term) ?? 0
        const idf = Math.log(1 + (totalRegions - frequencyAcrossRegions + 0.5) / (frequencyAcrossRegions + 0.5))
        const length = index.lengths[regionIndex] ?? 1
        score += idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * length / Math.max(1, index.averageLength)))
      }
      if (content.includes(phrase)) score += 8
      score += titleTerms.length * 2.5
      score += terms.filter((term) => currentHeading.includes(term)).length * 2
      if (region.type === 'heading') score += 0.35
      if (score <= 0) return []
      return [{
        document,
        region,
        snippet: excerpt(region.textContent, phrase, terms),
        context: contextFor(document, regionIndex, currentHeading, phrase, terms),
        score,
      }]
    })
  }).sort((a, b) => b.score - a.score)

  const documentCount = new Set(ranked.map((match) => match.document.id)).size
  const perDocumentLimit = documentCount <= 1 ? limit : Math.max(1, Math.ceil(limit / Math.min(documentCount, 3)))
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
