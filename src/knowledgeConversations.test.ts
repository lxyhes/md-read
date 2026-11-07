import { describe, expect, it } from 'vitest'
import { availableKnowledgeSourceIds, citationRegionId, citationState, createKnowledgeMessage, filterKnowledgeConversations, knowledgeRetrievalQuery, localDayKey, messagesForKnowledgeQuestion, migrateKnowledgeDocument, recentKnowledgeContext, summarizeKnowledgeActivity, validatedKnowledgeAnswer, type KnowledgeCitation, type KnowledgeMessage, type KnowledgeConversation } from './knowledgeConversations'
import { parseMarkdown } from './parser'

describe('knowledge conversation helpers', () => {
  it('resolves consecutive follow-ups without carrying context into a new topic', () => {
    const messages = [createKnowledgeMessage('user', '向量数据库如何部署？'), createKnowledgeMessage('assistant', '先配置数据库'), createKnowledgeMessage('user', '继续解释')]
    expect(knowledgeRetrievalQuery('举个例子', messages)).toContain('向量数据库如何部署')
    expect(knowledgeRetrievalQuery('请总结缓存策略', messages)).toBe('请总结缓存策略')
    expect(knowledgeRetrievalQuery('继续解释', [])).toBe('继续解释')
    const longHistory = Array.from({ length: 20 }, () => createKnowledgeMessage('user', `继续${'解释'.repeat(1000)}`))
    expect(knowledgeRetrievalQuery('举例', longHistory).length).toBeLessThanOrEqual(2006)
  })

  it('searches all conversation bodies and titles, newest first, without mutation', () => {
    const conversations: KnowledgeConversation[] = Array.from({ length: 15 }, (_, index) => ({
      id: String(index), title: `对话 ${index}`, sourceIds: [], createdAt: index, updatedAt: index,
      messages: [createKnowledgeMessage('assistant', index === 0 ? 'Ollama 模型部署' : '一般内容')],
    }))
    expect(filterKnowledgeConversations(conversations, '')).toHaveLength(15)
    expect(filterKnowledgeConversations(conversations, '')[0].id).toBe('14')
    expect(filterKnowledgeConversations(conversations, 'ollama 部署').map((item) => item.id)).toEqual(['0'])
    expect(filterKnowledgeConversations(conversations, '不存在')).toEqual([])
    expect(conversations[0].id).toBe('0')
  })
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

  it('retries a failed question without duplicating the user message', () => {
    const question = createKnowledgeMessage('user', '如何部署？')
    const failure = createKnowledgeMessage('assistant', 'AI 服务暂时不可用：timeout')
    expect(messagesForKnowledgeQuestion([question, failure], '如何部署？')).toEqual([question])
    expect(messagesForKnowledgeQuestion([question], '如何部署？')).toEqual([question])
    expect(messagesForKnowledgeQuestion([question], '如何回滚？').at(-1)?.content).toBe('如何回滚？')
  })

  it('keeps only valid citations actually used by an AI answer', () => {
    const citations = [1, 2].map((index) => ({ index, documentId: 'doc', documentTitle: 'Doc', documentPath: 'doc.md', regionId: `region-${index}`, excerpt: 'Excerpt', sourceHash: 'hash' }))
    expect(validatedKnowledgeAnswer('First [1], invalid [9].', citations)).toEqual({ content: 'First [1], invalid .', citations: [citations[0]] })
  })

  it('keeps only available unique sources for a new conversation', () => {
    expect(availableKnowledgeSourceIds(['a', 'missing', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b'])
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
    expect(citationState({ ...citation, regionId: 'missing-region', excerpt: '不存在的原文' }, [document])).toBe('position-missing')
    expect(citationState(citation, [])).toBe('removed')
  })

  it('relocates citations after earlier text changes and migrates them after a rename', () => {
    const previous = parseMarkdown('guide.md', '# Guide\n\nSource passage.')
    const region = previous.regions.find((item) => item.type === 'paragraph')!
    const citation: KnowledgeCitation = { index: 1, documentId: previous.id, documentTitle: previous.title, documentPath: previous.path, regionId: region.id, excerpt: 'Source passage.', sourceHash: previous.sourceHash }
    const edited = parseMarkdown('guide.md', '# Guide\n\nNew introduction.\n\nSource passage.')
    expect(citationRegionId(citation, [edited])).toBe(edited.regions.at(-1)?.id)
    expect(citationState(citation, [edited])).toBe('updated')

    const renamed = parseMarkdown('renamed.md', previous.source)
    const conversation: KnowledgeConversation = { id: 'conversation', title: 'Guide', sourceIds: [previous.id], createdAt: 1, updatedAt: 1, messages: [{ id: 'answer', role: 'assistant', content: 'Answer', createdAt: 1, citations: [citation] }] }
    const migrated = migrateKnowledgeDocument(conversation, previous, renamed)
    expect(migrated.sourceIds).toEqual([renamed.id])
    expect(migrated.messages[0]?.citations[0]).toMatchObject({ documentId: renamed.id, documentPath: 'renamed.md', regionId: renamed.regions[1]?.id })
  })
})
