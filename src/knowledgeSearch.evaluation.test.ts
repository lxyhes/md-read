import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './parser'
import { searchKnowledge } from './knowledgeSearch'

const documents = [
  parseMarkdown('database.md', '# 数据库运维\n\n## 备份\n\n每日创建全量备份，保留七天。\n\n## 恢复\n\n故障后先停止写入，再从最新备份恢复。'),
  parseMarkdown('cache.md', '# 缓存策略\n\n## 过期\n\n默认过期时间为十分钟，热点数据使用主动刷新。\n\n## 穿透\n\n空结果保留三十秒。'),
  parseMarkdown('network.md', '# 网络安全\n\n## TLS 证书\n\n证书到期前三十天开始更换，更换后检查完整证书链。\n\n## 防火墙\n\n公网只开放 443 端口。'),
  parseMarkdown('permissions.md', '# 权限管理\n\n## 审批\n\n生产发布需要两名审批人确认。\n\n## 回收\n\n员工离职后应当在当天撤销访问权限。'),
]

const cases = [
  ['数据库备份保留几天？', 'database.md'],
  ['出现故障时恢复前先做什么？', 'database.md'],
  ['热点缓存怎么更新？', 'cache.md'],
  ['空结果会保留多久？', 'cache.md'],
  ['TLS 证书提前多久更换？', 'network.md'],
  ['公网防火墙开放哪个端口？', 'network.md'],
  ['生产发布需要几个人审批？', 'permissions.md'],
  ['员工离职后什么时候撤销权限？', 'permissions.md'],
] as const

describe('knowledge search quality benchmark', () => {
  it('keeps representative-document Recall@8 and top-result accuracy above the baseline', () => {
    const results = cases.map(([question, expectedPath]) => {
      const paths = searchKnowledge(documents, question, 8).map((match) => match.document.path)
      return { recalled: paths.includes(expectedPath), first: paths[0] === expectedPath }
    })
    const recallAt8 = results.filter((result) => result.recalled).length / results.length
    const topResultAccuracy = results.filter((result) => result.first).length / results.length

    expect(recallAt8).toBeGreaterThanOrEqual(0.95)
    expect(topResultAccuracy).toBeGreaterThanOrEqual(0.75)
  })
})
