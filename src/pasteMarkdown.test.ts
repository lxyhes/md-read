import { describe, expect, it } from 'vitest'
import { formatClipboardToMarkdown } from './pasteMarkdown'

describe('rich clipboard list hierarchy', () => {
  it('keeps audience labels as nested list items', () => {
    const source = [
      '课程导引与基础认知 10:53',
      '',
      '主力客群定义与层级',
      '第一标签客群：需求最强烈、最可能成交的核心用户；',
      '第二标签客群：次主力，可买可不买；',
      '第三标签客群：被其他直播间种草但未下单者。',
      '',
      '产品生命周期与标签建模逻辑 15:29',
    ].join('\n')

    expect(formatClipboardToMarkdown('', source)).toContain([
      '- **主力客群定义与层级**',
      '  - **第一标签客群：** 需求最强烈、最可能成交的核心用户；',
      '  - **第二标签客群：** 次主力，可买可不买；',
      '  - **第三标签客群：** 被其他直播间种草但未下单者。',
    ].join('\n'))
  })

  it('keeps scenario and trap details nested', () => {
    const source = [
      '店铺分与产品热度权衡原则 42:42',
      '',
      '店铺分适用场景',
      '当同一产品存在多个供应链时，必须选择店铺分更高者；',
      '当产品为独家且热度极高时，店铺分低无需纠结。',
      '',
      '选品两大陷阱与识别方法 24:21',
      '',
      '陷阱一：产品寿命耗尽',
      '判定标准：同行直播间热卖单量断崖下跌；',
      '后果：直播间长期个位数在线。',
    ].join('\n')

    expect(formatClipboardToMarkdown('', source)).toContain('  - 当同一产品存在多个供应链时，必须选择店铺分更高者；')
    expect(formatClipboardToMarkdown('', source)).toContain('  - 判定标准：同行直播间热卖单量断崖下跌；')
  })
})
