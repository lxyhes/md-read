import { describe, expect, it } from 'vitest'
import { env } from 'node:process'
import { parseMarkdown } from './parser'
import { searchKnowledge } from './knowledgeSearch'
import { KNOWLEDGE_EMBEDDING_MODEL, knowledgeChunks, knowledgeEmbeddingQuery, normalizeKnowledgeVector, searchKnowledgeHybrid } from './knowledgeHybridSearch'

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

const evidenceGroups = [
  { path: 'database.md', text: '每日创建全量备份，保留七天。', questions: ['数据库备份保留几天？', '每日创建全量备份', '完整副本一周以后还有没有？'] },
  { path: 'database.md', text: '故障后先停止写入，再从最新备份恢复。', questions: ['出现故障时恢复前先做什么？', '先停止写入', '数据库挂了，还能继续让业务提交变更吗？'] },
  { path: 'cache.md', text: '默认过期时间为十分钟，热点数据使用主动刷新。', questions: ['热点缓存怎么更新？', '默认过期时间为十分钟', '热门内容是等失效还是预先重新加载？'] },
  { path: 'cache.md', text: '空结果保留三十秒。', questions: ['空结果会保留多久？', '空结果保留三十秒', '查无此项的记录会记多长时间？'] },
  { path: 'network.md', text: '证书到期前三十天开始更换，更换后检查完整证书链。', questions: ['TLS 证书提前多久更换？', '检查完整证书链', '凭证快失效时，团队要提前多少时间轮换？'] },
  { path: 'network.md', text: '公网只开放 443 端口。', questions: ['公网防火墙开放哪个端口？', '443 端口', '外部用户通过哪个通信号接入？'] },
  { path: 'permissions.md', text: '生产发布需要两名审批人确认。', questions: ['生产发布需要几个人审批？', '生产发布需要两名审批人确认', '把版本推给真实用户要几位同事点头？'] },
  { path: 'permissions.md', text: '员工离职后应当在当天撤销访问权限。', questions: ['员工离职后什么时候撤销权限？', '员工离职后应当在当天撤销访问权限', '同事走了，账号要多久关掉？'] },
]

const passageCases = [
  ...evidenceGroups.flatMap((group, index) => group.questions.map((query, variant) => ({ query, kind: ['direct', 'exact', 'paraphrase'][variant], evidenceIds: [index] }))),
  { query: '发布和恢复前分别有哪些动作？', kind: 'comparison', evidenceIds: [6, 1] },
  { query: '证书什么时候更换，离职后何时撤销权限？', kind: 'comparison', evidenceIds: [4, 7] },
  { query: '对比备份和空结果的保留时长。', kind: 'comparison', evidenceIds: [0, 3] },
  { query: '办公室报销餐费的额度是多少？', kind: 'absent', evidenceIds: [] },
  { query: '默认 VPN 客户端端口是 8443 吗？', kind: 'absent', evidenceIds: [] },
  { query: 'TLS 证书更换完后，运维同事的联系电话是什么？', kind: 'absent', evidenceIds: [] },
]

const evidence = evidenceGroups.map(group => documents.find(document => document.path === group.path)!.regions.find(region => region.textContent === group.text)!)

async function evaluationEmbeddings(input: string[]) {
  const response = await fetch('http://127.0.0.1:11434/api/embed', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: KNOWLEDGE_EMBEDDING_MODEL, input, truncate: false }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Ollama evaluation failed: ${response.status}`)
  const { embeddings } = await response.json() as { embeddings: number[][] }
  expect(embeddings).toHaveLength(input.length)
  return embeddings.map(normalizeKnowledgeVector)
}

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

  it('keeps the labelled passage benchmark resolvable and exact hits first', () => {
    expect(passageCases).toHaveLength(30)
    expect(evidence.every(Boolean)).toBe(true)
    for (const { query, evidenceIds } of passageCases.filter(item => item.kind === 'exact')) {
      expect(searchKnowledge(documents, query)[0]?.region.id, query).toBe(evidence[evidenceIds[0]].id)
    }
  })

  it.skipIf(env.MOYUE_EVAL_OLLAMA !== '1')('reports a real Ollama comparison against the same labelled passages', async () => {
    const indexes = []
    for (const document of documents) {
      const chunks = knowledgeChunks(document)
      indexes.push({ document, chunks, vectors: await evaluationEmbeddings(chunks.map(chunk => chunk.input)) })
    }
    const metrics = ['lexicalAll', 'hybridAll', 'lexicalFirst', 'hybridFirst', 'lexicalAny', 'hybridAny'] as const
    const rows: Array<{ kind: string } & Record<typeof metrics[number], boolean>> = []
    for (const question of passageCases) {
      const [vector] = await evaluationEmbeddings([knowledgeEmbeddingQuery(question.query)])
      const expected = question.evidenceIds.map(index => evidence[index].id)
      const lexical = searchKnowledge(documents, question.query).map(match => match.region.id)
      const semantic = searchKnowledgeHybrid(documents, indexes, question.query, vector).matches.map(match => match.region.id)
      rows.push({
        kind: question.kind,
        lexicalAll: expected.length > 0 && expected.every(id => lexical.includes(id)),
        hybridAll: expected.length > 0 && expected.every(id => semantic.includes(id)),
        lexicalFirst: expected.includes(lexical[0]), hybridFirst: expected.includes(semantic[0]),
        lexicalAny: Boolean(lexical.length), hybridAny: Boolean(semantic.length),
      })
    }
    console.table([...new Set(rows.map(row => row.kind))].map(kind => {
      const group = rows.filter(row => row.kind === kind)
      return { kind, total: group.length, ...Object.fromEntries(metrics.map(metric =>
        [metric, group.filter(row => row[metric]).length])) }
    }))
  }, 180_000)
})
