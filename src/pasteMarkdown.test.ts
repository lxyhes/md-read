import { describe, expect, it } from 'vitest'
import courseSource from '../docs/fixtures/直播电商选品-原文.md?raw'
import { formatClipboardToMarkdown } from './pasteMarkdown'
import { parseMarkdown, renderMarkdownFragment } from './parser'

describe('rich clipboard list hierarchy', () => {
  it('renders standalone pasted image links in saved documents and previews', () => {
    const source = '[image](https://img-view-c-sz.drive.quark.cn/assets/preview?token=abc\\&sp=100)'
    const document = parseMarkdown('course.md', source)
    expect(document.regions[0].type).toBe('image')
    expect(document.regions[0].html).toContain('token=abc&amp;sp=100')
    expect(document.regions[0].html).toContain('referrerpolicy="no-referrer"')
    expect(renderMarkdownFragment(source)).toContain('<img ')
    expect(renderMarkdownFragment(`文本 ![图片](https://img-view-c-sz.drive.quark.cn/preview)`)).toContain('referrerpolicy="no-referrer"')
    expect(renderMarkdownFragment('[image](https://example.com/article)')).toContain('<a ')
    expect(renderMarkdownFragment('见 [image](https://example.com/image.png)')).toContain('<a ')
  })
  it('retains every timestamp link in the full user-supplied course, before and after paste formatting', () => {
    const source = courseSource
    const expected = ['10:53', '15:29', '24:21', '38:02', '42:42', '01:02:58', '01:11:02', '01:10:58']
    const seconds = [653, 929, 1461, 2282, 2562, 3778, 4262, 4258]
    for (const input of [source, formatClipboardToMarkdown('', source)]) {
      const document = parseMarkdown('full-course.md', input)
      const headings = document.regions.filter((region) => region.type === 'heading')
      expect(headings).toHaveLength(8)
      headings.forEach((region, index) => {
        expect(region.html).toContain(`#?seek_t=${seconds[index]}"`)
        expect(region.html).toContain(`>${expected[index]}</a>`)
        expect(region.html).not.toContain('\\&')
      })
      const html = document.regions.map((region) => region.html).join('')
      expect(html).toContain('<strong>不看总销量，只看7日趋势图</strong>')
      expect(html).toContain('<strong>空档期</strong>')
    }
  })

  it('renders the supplied course timestamp as a real link when the address is retained', () => {
    const url = 'https://b.quark.cn/apps/5AZ7aRopS/routes/Gj8VNtRtS?debug=0&fid=6b6b109cff1b410399f9d99df58a7b93#?seek_t=653'
    const source = `### 课程导引与基础认知 [10:53](${url})`
    const document = parseMarkdown('course-link.md', formatClipboardToMarkdown('', source))
    expect(document.regions[0].type).toBe('heading')
    expect(document.regions[0].html).toContain(`<a href="${url.replace(/&/g, '&amp;')}"`)
  })

  it('preserves linked timestamps, inline emphasis and step paragraphs in explicit Markdown', () => {
    const source = [
      '### **实战选品策略与平台操作 [38:02](https://example.com/video#?seek_t=2282)**',
      '',
      '- **精选联盟选品四步法**',
      '  - **第二步：聚焦销量趋势**\\',
      '    按“销量”排序后，**不看总销量，只看7日趋势图**，直接放弃。',
      '  - **第四步：时段卡位策略**\\',
      '    统计同行开播时段，主动抢占**空档期**。',
    ].join('\n')
    const pasted = formatClipboardToMarkdown('', source)
    const document = parseMarkdown('steps.md', pasted)
    expect(pasted).toBe(source)
    expect(document.regions.map((region) => region.type)).toEqual(['heading', 'list'])
    expect(document.regions[0].html).toContain('href="https://example.com/video#?seek_t=2282"')
    expect(document.regions[1].html).toContain('<strong>不看总销量，只看7日趋势图</strong>')
    expect(document.regions[1].html).toContain('<strong>空档期</strong>')
    expect(document.regions[1].html).toMatch(/第二步：[\s\S]*按“销量”[\s\S]*<\/li>/)
  })

  it('does not split indented list descriptions at bold prose', () => {
    const source = '- **判断方法**\n\n  **重要判断原则**需要结合数据。'
    expect(formatClipboardToMarkdown('', source)).toBe(source)
    expect(parseMarkdown('description.md', source).regions.map((region) => region.type)).toEqual(['list'])
  })

  it('recognizes hour-long chapter timestamps instead of turning them into bullets', () => {
    const source = '店铺分与产品热度权衡原则 42:42\n\n货带人 vs. 人带货本质区分 01:02:58\n\n新手执行铁律与资源建议 01:11:02'
    const pasted = formatClipboardToMarkdown('', source)
    expect(pasted.match(/^### /gm)).toHaveLength(3)
    expect(pasted).toContain('### 货带人 vs. 人带货本质区分 01:02:58')
    expect(parseMarkdown('hours.md', pasted).headings).toHaveLength(3)
  })

  it('keeps flattened step descriptions inside their nested list item', () => {
    const source = [
      '实战选品策略与平台操作 38:02',
      '精选联盟选品四步法',
      '第二步：聚焦销量趋势',
      '按“销量”排序后，只看最近七天的趋势图，若销量平缓或下滑，直接放弃。',
      '第四步：时段卡位策略',
      '统计同行开播时段，主动抢占空档期，实现流量独占。',
      '店铺分与产品热度权衡原则 42:42',
    ].join('\n')
    const pasted = formatClipboardToMarkdown('', source)
    expect(pasted).toContain('    按“销量”排序后')
    expect(pasted).toContain('    统计同行开播时段')
    const html = parseMarkdown('plain-steps.md', pasted).regions[1].html
    expect(html).toMatch(/第二步：[\s\S]*按“销量”[\s\S]*<\/li><li>/)
  })

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
