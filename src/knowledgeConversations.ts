import type { KnowledgeSearchMatch } from './knowledgeSearch'
import type { ReaderDocument } from './types'
import type { AiMessage } from './aiProvider'

export type KnowledgeCitation = {
  index: number
  documentId: string
  documentTitle: string
  documentPath: string
  regionId: string
  excerpt: string
  sourceHash: string
}

export type KnowledgeMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  citations: KnowledgeCitation[]
}

export type KnowledgeConversation = {
  id: string
  title: string
  sourceIds: string[]
  createdAt: number
  updatedAt: number
  messages: KnowledgeMessage[]
}

export type KnowledgeActivity = Record<string, number>
export type CitationState = 'current' | 'updated' | 'removed' | 'position-missing'

export function createKnowledgeId() {
  return globalThis.crypto?.randomUUID?.() ?? `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createKnowledgeMessage(role: KnowledgeMessage['role'], content: string, citations: KnowledgeCitation[] = [], createdAt = Date.now()): KnowledgeMessage {
  return { id: createKnowledgeId(), role, content, citations, createdAt }
}

export function titleForKnowledgeQuestion(question: string) {
  const title = question.replace(/\s+/g, ' ').trim()
  return title.length > 42 ? `${title.slice(0, 41)}…` : title || '新对话'
}

export function availableKnowledgeSourceIds(sourceIds: string[], availableIds: string[]) {
  const available = new Set(availableIds)
  return [...new Set(sourceIds.filter((id) => available.has(id)))]
}

export function citationsForMatches(matches: KnowledgeSearchMatch[]): KnowledgeCitation[] {
  return matches.map((match, index) => ({
    index: index + 1,
    documentId: match.document.id,
    documentTitle: match.document.title,
    documentPath: match.document.path,
    regionId: match.region.id,
    excerpt: match.snippet,
    sourceHash: match.document.sourceHash,
  }))
}

export function recentKnowledgeContext(messages: KnowledgeMessage[], limit = 4, characterLimit = 8000): AiMessage[] {
  const recent = messages.filter((message) => (message.role === 'user' || message.role === 'assistant')
    && !(message.role === 'assistant' && message.content.startsWith('AI 服务暂时不可用：'))).slice(-limit)
  let remaining = characterLimit
  const bounded: AiMessage[] = []
  for (let index = recent.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = recent[index]
    const content = message.content.length > remaining
      ? `${remaining > 1 ? '…' : ''}${message.content.slice(-(remaining > 1 ? remaining - 1 : 1))}`
      : message.content
    bounded.unshift({ role: message.role, content })
    remaining -= content.length
  }
  return bounded
}

export function localDayKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function summarizeKnowledgeActivity(activity: KnowledgeActivity, now = new Date()) {
  let activeDays = 0
  let answers = 0
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12)
    const count = Math.max(0, activity[localDayKey(day)] ?? 0)
    if (count > 0) activeDays += 1
    answers += count
  }
  return { activeDays, answers }
}

export function citationState(citation: KnowledgeCitation, documents: ReaderDocument[]): CitationState {
  const document = documents.find((item) => item.id === citation.documentId)
  if (!document) return 'removed'
  if (!document.regions.some((region) => region.id === citation.regionId)) return 'position-missing'
  return document.sourceHash === citation.sourceHash ? 'current' : 'updated'
}
