import { describe, expect, it } from 'vitest'
import { parseComparisonLayout } from './comparisonLayout'

describe('comparison layout', () => {
  it('splits a short plus comparison into two aligned columns', () => {
    expect(parseComparisonLayout([
      'AI商业化 + 商业AI化',
      '怎么把AI卖出去? 怎么把商业AI化?',
      '技术要变成生意 生意要用上技术',
    ].join('\n'))).toEqual({
      left: { title: 'AI商业化', rows: ['怎么把AI卖出去?', '技术要变成生意'] },
      right: { title: '商业AI化', rows: ['怎么把商业AI化?', '生意要用上技术'] },
    })
  })

  it('leaves ordinary plus prose unchanged', () => {
    expect(parseComparisonLayout('成本 + 收益决定最终结果')).toBeNull()
  })
})
