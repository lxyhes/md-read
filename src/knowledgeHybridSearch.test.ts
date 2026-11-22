import { describe, expect, it } from 'vitest'
import { citationsForMatches, citationRegionId } from './knowledgeConversations'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS, knowledgeChunks, normalizeKnowledgeVector, searchKnowledgeHybrid } from './knowledgeHybridSearch'
import { parseMarkdown } from './parser'

function axis(index: number) {
  return normalizeKnowledgeVector(Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, (_, dimension) => Number(dimension === index)))
}

describe('hybrid knowledge retrieval', () => {
  it('retrieves a paraphrase within the selected scope and links to the cited paragraph', () => {
    const document = parseMarkdown('access.md', '# 权限手册\n\n## 回收\n\n人员离岗当日注销凭证。\n\n## 入职\n\n需要主管批准。')
    const outside = parseMarkdown('private.md', '# 私人资料\n\n年底请假。')
    const stale = parseMarkdown('access.md', '# 权限手册\n\n这份旧内容已过期。')
    const indexes = [
      { document, chunks: knowledgeChunks(document), vectors: [axis(0), axis(1)] },
      { document: outside, chunks: knowledgeChunks(outside), vectors: [axis(0)] },
      { document: stale, chunks: knowledgeChunks(stale), vectors: [axis(0)] },
    ]
    const result = searchKnowledgeHybrid([document], indexes, '员工走了怎么关账号？', axis(0))
    expect(result.hybrid).toBe(true)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].snippet).toBe('人员离岗当日注销凭证。')
    expect(result.matches[0].context).not.toContain('入职')
    const [citation] = citationsForMatches(result.matches)
    expect(citationRegionId(citation, [document])).toBe(result.matches[0].region.id)
  })

  it('preserves a precise table hit against a higher vector match', () => {
    const document = parseMarkdown('network.md', '# 网络配置\n\n| 项目 | 值 |\n| --- | --- |\n| TLS | 443 |\n\n内部诊断通道另行配置。')
    const chunks = knowledgeChunks(document)
    expect(chunks[0].input).toContain('项目 | 值\nTLS | 443')
    const result = searchKnowledgeHybrid([document], [{ document, chunks, vectors: [axis(1), axis(0)] }], 'TLS 443', axis(0))
    expect(result.matches[0].region.type).toBe('table')
    expect(result.matches[0].context).toContain('项目 | 值\nTLS | 443')
  })

  it('uses the specific paragraph matched by the vector within a section', () => {
    const document = parseMarkdown('access.md', '# 运维\n\n周会安排在周一。\n\n打印机放在二楼。\n\n账户停用期限为一天。')
    const [match] = searchKnowledgeHybrid([document], [{
      document, chunks: knowledgeChunks(document), vectors: [axis(0), axis(1), axis(2)],
    }], '同事走了账号多久关掉', axis(2)).matches
    expect(match.snippet).toBe('账户停用期限为一天。')
    expect(match.context).toContain('账户停用期限为一天。')
    expect(citationRegionId(citationsForMatches([match])[0], [document])).toBe(document.regions.at(-1)?.id)
  })

  it('repeats table headers across chunks and validates vector dimensions', () => {
    const rows = Array.from({ length: 30 }, (_, index) => `| ${index} | ${'检查记录'.repeat(10)} |`).join('\n')
    const document = parseMarkdown('records.md', `# 检查记录\n\n| 行号 | 内容 |\n| --- | --- |\n${rows}`)
    const chunks = knowledgeChunks(document)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.input.includes('行号 | 内容'))).toBe(true)
    expect(chunks.at(-1)?.input).toContain('29 | ')
    expect(() => normalizeKnowledgeVector([0, 2])).toThrow('向量维度或数值无效')
  })
})
