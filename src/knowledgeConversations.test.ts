import { describe, expect, it } from 'vitest'
import { citationState, localDayKey, recentKnowledgeContext, summarizeKnowledgeActivity, type KnowledgeCitation, type KnowledgeMessage } from './knowledgeConversations'
import { parseMarkdown } from './parser'

describe('knowledge conversation helpers', () => {
  it('keeps only the two most recent turns for model context', () => {
    const messages = ['问题一', '回答一', '问题二', '回答二', '问题三', '回答三'].map((content, index) => ({
      id: String(index), role: index % 2 === 0 ? 'user' : 'assistant', content, createdAt: index, citations: [],
    })) as KnowledgeMessage[]
    expect(recentKnowledgeContext(messages)).toEqual([
      { role: 'user', content: '问题二' }, { role: 'assistant', content: '回答二' },
      { role: 'user', content: '问题三' }, { role: 'assistant', content: '回答三' },
    ])
  })

  it('bounds long history and excludes failed-service diagnostics from the next model request', () => {
    const messages: KnowledgeMessage[] = [
      { id: 'q', role: 'user', content: '旧问题', createdAt: 1, citations: [] },
      { id: 'failure', role: 'assistant', content: 'AI 服务暂时不可用：token endpoint failed', createdAt: 2, citations: [] },
      { id: 'long', role: 'assistant', content: '很长的回答。'.repeat(2000), createdAt: 3, citations: [] },
      { id: 'latest', role: 'user', content: '最新追问', createdAt: 4, citations: [] },
    ]
    const context = recentKnowledgeContext(messages)
    expect(context.some((message) => message.content.includes('token endpoint'))).toBe(false)
    expect(context.at(-1)?.content).toBe('最新追问')
    expect(context.reduce((size, message) => size + message.content.length, 0)).toBeLessThanOrEqual(8000)
  })

  it('counts successful answers and active days across the local last seven days', () => {
    const now = new Date(2026, 9, 13, 15)
    const yesterday = new Date(2026, 9, 12, 15)
    const outsideWindow = new Date(2026, 9, 5, 15)
    expect(summarizeKnowledgeActivity({ [localDayKey(now)]: 2, [localDayKey(yesterday)]: 1, [localDayKey(outsideWindow)]: 5 }, now))
      .toEqual({ activeDays: 2, answers: 3 })
  })

  it('marks a citation as current, updated, missing, or removed', () => {
    const document = parseMarkdown('guide.md', '# Guide\n\nSource passage.')
    const region = document.regions.find((item) => item.type === 'paragraph')!
    const citation: KnowledgeCitation = { index: 1, documentId: document.id, documentTitle: document.title, documentPath: document.path, regionId: region.id, excerpt: 'Source passage.', sourceHash: document.sourceHash }
    expect(citationState(citation, [document])).toBe('current')
    expect(citationState({ ...citation, sourceHash: 'older-hash' }, [document])).toBe('updated')
    expect(citationState({ ...citation, regionId: 'missing-region' }, [document])).toBe('position-missing')
    expect(citationState(citation, [])).toBe('removed')
  })
})
