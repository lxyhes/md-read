import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './parser'
import { searchKnowledge } from './knowledgeSearch'

describe('knowledge search', () => {
  it('finds relevant Markdown regions and returns a readable excerpt', () => {
    const document = parseMarkdown('guide.md', '# 阅读指南\n\n离线知识库可以帮助你快速找到已经保存的资料。')
    const matches = searchKnowledge([document], '知识库')

    expect(matches).toHaveLength(1)
    expect(matches[0].document.title).toBe('阅读指南')
    expect(matches[0].snippet).toContain('知识库')
  })
})
