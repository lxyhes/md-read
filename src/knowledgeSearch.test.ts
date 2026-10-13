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

  it('ranks title and heading matches higher and spreads results across documents', () => {
    const first = parseMarkdown('guide.md', '# 部署指南\n\n部署需要先准备环境。\n\n部署后检查日志。\n\n部署完成后验证服务。\n\n部署问题请查看运行记录。')
    const second = parseMarkdown('operations.md', '# 运维手册\n\n部署失败时先检查数据库连接。')
    const matches = searchKnowledge([first, second], '部署', 8)

    expect(matches[0]?.region.type).toBe('heading')
    expect(matches.filter((match) => match.document.id === first.id)).toHaveLength(3)
    expect(matches.some((match) => match.document.id === second.id)).toBe(true)
  })

  it('removes highly similar excerpts from the same document', () => {
    const document = parseMarkdown('repeat.md', '# 说明\n\n知识库支持跨文档检索和原文引用。\n\n知识库支持跨文档检索和原文引用。')
    expect(searchKnowledge([document], '知识库')).toHaveLength(1)
  })
})
