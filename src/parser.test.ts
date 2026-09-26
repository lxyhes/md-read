import { describe, expect, it } from 'vitest'
import { hashText, makeImplicitMarkdownHeadingsExplicit, parseMarkdown, renderMarkdownFragment } from './parser'
import { asciiDiagramToMermaid, asciiTreeToTree, markdownToTree } from './asciiDiagram'
import { formatClipboardImage, formatClipboardToMarkdown, formatPastedText, isLikelyProseBlock, normalizeMixedOrderedListSource, suggestPastedMarkdownName } from './pasteMarkdown'
import { resolveMarkdownAssetUrl } from './fileService'

describe('Moyue markdown region parser', () => {
  const source = '# Title\n\nA paragraph.\n\n```mermaid\nflowchart LR\nA --> B\n```'

  it('creates stable regions and headings', () => {
    const first = parseMarkdown('notes/test.md', source)
    const second = parseMarkdown('notes/test.md', source)
    expect(first.regions.map((region) => region.id)).toEqual(second.regions.map((region) => region.id))
    expect(first.headings[0].text).toBe('Title')
    expect(first.regions.map((region) => region.type)).toEqual(['heading', 'paragraph', 'mermaid'])
  })

  it('styles numeric article headings like public-account chapter headings', () => {
    const document = parseMarkdown('notes/article.md', '## 11API Key 怎么配？')
    expect(document.regions[0].html).toContain('class="numbered-heading"')
    expect(document.regions[0].html).toContain('<span class="heading-number">11</span>')
    expect(document.regions[0].html).toContain('<span class="heading-text">API Key 怎么配？</span>')

    const starred = parseMarkdown('notes/article-starred.md', '## ****11API Key 怎么配？')
    expect(starred.regions[0].html).toContain('<span class="heading-number">11</span>')
    expect(starred.regions[0].html).not.toContain('****')
  })

  it('previews Mermaid wrapped inside a generic fenced code block', () => {
    const document = parseMarkdown('notes/nested.md', '~~~~text\n~~~mermaid\nflowchart TD\nA --> B\n~~~\n~~~~')
    expect(document.regions[0].type).toBe('mermaid')
    expect(document.regions[0].metadata?.code).toBe('flowchart TD\nA --> B')
  })

  it('renders inline and block math with KaTeX', () => {
    const document = parseMarkdown('math.md', String.raw`Inline $x^2$.

$$
\frac{a}{b}
$$`)
    expect(document.regions[0].html).toContain('katex')
    expect(document.regions[1].type).toBe('math')
    expect(document.regions[1].html).toContain('frac')
  })

  it('accepts LaTeX parenthesis and bracket delimiters', () => {
    const document = parseMarkdown('latex-delimiters.md', String.raw`Inline \(x^2\).

\[
\frac{a}{b}
\]`)
    expect(document.regions[0].html).toContain('katex')
    expect(document.regions[1].type).toBe('math')
    expect(document.regions[1].html).toContain('frac')
  })

  it('renders footnotes at the end of the document', () => {
    const document = parseMarkdown('footnotes.md', '正文[^1]。\n\n[^1]: 脚注内容。')
    expect(document.regions[0].html).toContain('href="#footnote-1"')
    expect(document.regions.at(-1)?.type).toBe('footnotes')
    expect(document.regions.at(-1)?.html).toContain('脚注内容')
  })

  it('renders GitHub-style callouts', () => {
    const document = parseMarkdown('callout.md', '> [!WARNING]\n> 这是一条提醒。')
    expect(document.regions[0].html).toContain('markdown-callout')
    expect(document.regions[0].html).toContain('这是一条提醒')
    expect(document.regions[0].html).not.toContain('[!WARNING]')
  })

  it('does not emit executable raw HTML', () => {
    const document = parseMarkdown('unsafe.md', '<script>alert(1)</script>\n\n[bad](javascript:alert(1))')
    expect(document.regions[0].html).not.toContain('<script>')
    expect(document.regions[1].html).not.toContain('javascript:')
  })

  it('keeps the hash deterministic', () => {
    expect(hashText('moyue')).toBe(hashText('moyue'))
  })

  it('preserves soft line breaks in prose paragraphs', () => {
    const document = parseMarkdown('notes/redis.md', '详情：RedisKeyUserPrefix + "aiTask:detail:{id}"\n任务列表：RedisKeyUserPrefix + "aiTask:list:{userId}:{page}"')
    expect(document.regions[0].html).toContain('<br />')
  })

  it('recognizes bold markers adjacent to Chinese prose', () => {
    const document = parseMarkdown('notes/article-bold.md', '其实更像**“判断题”**。\n\nJev 更像***“调度员 + 质检员 + 守门员”***。\n\n```text\n中文 **代码里的标记** 保持原样\n```')
    expect(document.regions[0].html).toContain('<strong>“判断题”</strong>')
    expect(document.regions[1].html).toContain('<strong>“调度员 + 质检员 + 守门员”</strong>')
    expect(document.regions[1].html).not.toContain('*')
    expect(document.regions[2].textContent).toContain('**代码里的标记**')
  })

  it('includes standalone bold sections in the outline without replacing the document title', () => {
    const document = parseMarkdown('notes/article.md', '引导正文\n\n**内容层：选题和情绪设计**\n\n章节内容')
    expect(document.title).toBe('article.md')
    expect(document.headings.map(({ text, depth }) => ({ text, depth }))).toEqual([{ text: '内容层：选题和情绪设计', depth: 2 }])
    expect(document.regions[1]?.type).toBe('paragraph')
  })

  it('preserves leading spaces that exist in the source paragraph', () => {
    const document = parseMarkdown('notes/indent.md', '  第一段\n\n   第二段\n\n普通段落')
    expect(document.regions[0].html).toContain('<p>&nbsp;&nbsp;第一段</p>')
    expect(document.regions[1].html).toContain('<p>&nbsp;&nbsp;&nbsp;第二段</p>')
    expect(document.regions[2].html).toBe('<p>普通段落</p>')
  })

  it('preserves leading spaces on every soft-wrapped source line', () => {
    const document = parseMarkdown('notes/lines.md', '第一行\n  第二行\n   第三行')
    expect(document.regions[0].html).toBe('<p>第一行<br />&nbsp;&nbsp;第二行<br />&nbsp;&nbsp;&nbsp;第三行</p>')
  })

  it('resolves relative assets without changing external URLs', () => {
    const document = parseMarkdown('notes/readme.md', '![local](assets/cover.png)\n\n[remote](https://example.com)', (url) => url.startsWith('assets/') ? `asset://${url}` : url)
    expect(document.regions[0].html).toContain('src="asset://assets/cover.png"')
    expect(document.regions[1].html).toContain('href="https://example.com"')
  })

  it('shortens bare external URLs visually while preserving the full destination', () => {
    const document = parseMarkdown('notes/readme.md', '## 资料 (https://example.com/articles/design-system?chapter=2)')
    expect(document.regions[0].html).toContain('class="bare-url"')
    expect(document.regions[0].html).toContain('href="https://example.com/articles/design-system?chapter=2"')
    expect(document.regions[0].html).toContain('example.com/…/design-system')
    expect(document.regions[0].html).not.toContain('>https://example.com/articles/design-system?chapter=2</a>')
  })

  it('treats a standalone markdown image paragraph as an image region', () => {
    const document = parseMarkdown('notes/readme.md', '![cover](https://example.com/cover.png)')
    expect(document.regions[0].type).toBe('image')
    expect(document.regions[0].metadata?.url).toBe('https://example.com/cover.png')
    expect(document.regions[0].html).toContain('loading="eager"')
  })

  it('resolves browser assets relative to the Markdown file', () => {
    const document = parseMarkdown('notes/readme.md', '![local](../assets/cover%20image.png)', (url) => resolveMarkdownAssetUrl('notes/readme.md', url, { 'assets/cover image.png': 'blob:test-image' }))
    expect(document.regions[0].html).toContain('src="blob:test-image"')
  })

  it('preserves the slash after a Windows drive letter', () => {
    const document = parseMarkdown('E:/notes/readme.md', '![local](./assets/cover.png)', (url) => resolveMarkdownAssetUrl('E:/notes/readme.md', url, { 'e:/notes/assets/cover.png': 'blob:test-image' }))
    expect(document.regions[0].html).toContain('src="blob:test-image"')
  })

  it('keeps relative asset query strings after resolving them', () => {
    const document = parseMarkdown('notes/readme.md', '![local](../assets/cover.png?raw=1#top)', (url) => resolveMarkdownAssetUrl('notes/readme.md', url, { 'assets/cover.png': 'blob:test-image' }))
    expect(document.regions[0].html).toContain('src="blob:test-image?raw=1#top"')
  })

  it('converts box-and-arrow text diagrams into Mermaid', () => {
    const diagram = [
      '┌──────────────┐',
      '│ Matr         │',
      '│ 物资           │',
      '└──────┬───────┘',
      '       │ categoryId',
      '       ↓',
      '┌──────────────┐',
      '│ MatrCategory   │',
      '└──────────────┘',
    ].join('\n')
    expect(asciiDiagramToMermaid(diagram)).toContain('n0 -->|\u00a0categoryId\u00a0| n1')
    expect(asciiDiagramToMermaid('普通文本')).toBeNull()
  })

  it('converts mixed box diagrams and labelled horizontal relations', () => {
    const diagram = [
      '┌────────────┐',
      '&#x20;          │   Matr     │',
      '&#x20;          │  物资       │',
      '&#x20;          └─────┬──────┘',
      '&#x20;                │ categoryId',
      '&#x20;                ↓',
      '&#x20;         ┌────────────┐',
      '&#x20;         │MatrCategory│',
      '&#x20;         └────────────┘',
      '',
      'Matr ── supplierId ──➝ Supplier       供应商',
      'Matr ── mfgId      ──➝ Mfg            厂商',
      'Matr ── matrId     ──➝ MatrUnit      多单位',
      'Matr ── hisCode    ──➝ HIS           收费编码',
      'Matr ── hrpCode    ──➝ HRP           对码',
      '',
      'Dept ── warehouseId ──➝ Warehouse',
      'Warehouse ── locationId ──➝ Location',
      'User ── UserWarehouse ──➝ 可操作仓库',
      '',
      'Dept ── WarehouseMap ──➝ 高值/低值业务仓库',
    ].join('\n')
    const mermaid = asciiDiagramToMermaid(diagram)
    expect(mermaid).toContain('flowchart LR')
    for (const label of ['categoryId', 'supplierId', 'mfgId', 'matrId', 'hisCode', 'hrpCode', 'warehouseId', 'locationId', 'UserWarehouse', 'WarehouseMap']) {
      expect(mermaid).toContain(label)
    }
    for (const node of ['MatrCategory', 'Supplier', 'Mfg', 'MatrUnit', 'HIS', 'HRP', 'Warehouse', 'Location', '可操作仓库', '高值/低值业务仓库']) {
      expect(mermaid).toContain(node)
    }
    expect(mermaid).toContain('物资\u00a0"]')
    expect(mermaid).not.toContain('物资       │')
    expect(mermaid).toContain('\u00a0MatrCategory\u00a0')
  })

  it('parses directory trees without flattening their hierarchy', () => {
    const tree = asciiTreeToTree([
      '墨阅',
      '',
      '├── 我的空间',
      '│',
      '├── 文档库',
      '│   ├── 全部文档',
      '│   ├── 最近阅读',
      '│   └── 收藏',
      '├── Markdown Reader',
      '│   ├── 大纲',
      '│   └── 内容导航',
      '└── 设置',
    ].join('\n'))
    expect(tree).toEqual({
      label: '墨阅',
      children: [
        { label: '我的空间', children: [] },
        { label: '文档库', children: [
          { label: '全部文档', children: [] },
          { label: '最近阅读', children: [] },
          { label: '收藏', children: [] },
        ] },
        { label: 'Markdown Reader', children: [
          { label: '大纲', children: [] },
          { label: '内容导航', children: [] },
        ] },
        { label: '设置', children: [] },
      ],
    })
    expect(asciiTreeToTree('普通文本')).toBeNull()
  })

  it('normalizes plain clipboard text into Markdown lists', () => {
    expect(formatPastedText('标题\r\n\r\n• 第一项\r\n2) 第二项\r\n\r\n')).toBe('标题\n\n- 第一项\n2. 第二项')
  })

  it('repairs mixed bullet and ordered markers before editor paste', () => {
    expect(normalizeMixedOrderedListSource('- 1. 第一项\n\n- 1. 第二项\n\n- 1. 第三项')).toEqual({
      source: '1. 第一项\n\n2. 第二项\n\n3. 第三项',
      converted: 3,
    })
    expect(normalizeMixedOrderedListSource('- 1. 第一项\n2. 第二项\n3. 第三项')).toEqual({
      source: '1. 第一项\n2. 第二项\n3. 第三项',
      converted: 3,
    })
  })

  it('flattens mixed list markers into one ordered list', () => {
    const document = parseMarkdown('mixed-list.md', '- 1. 第一项\n2. 第二项\n3. 第三项')
    expect(document.regions[0]?.html).toContain('<ol>')
    expect(document.regions[0]?.html).not.toContain('<ul>')
    expect(document.regions[0]?.html).toContain('第一项')
    expect(document.regions[0]?.html).toContain('第二项')
  })

  it('removes common clipboard indentation that would create a plain code block', () => {
    const pasted = formatPastedText([
      '    课程背景与核心价值主张 00:00',
      '    当前AI行业现状：虽然AI火热，但真正盈利的公司寥寥无几。',
      '    - 个体变现路径：利用AI做IP。',
    ].join('\n'))
    expect(pasted).toContain('课程背景与核心价值主张 00:00')
    expect(pasted).not.toMatch(/^ {4}/m)
    expect(parseMarkdown('pasted.md', pasted).regions[0]?.type).not.toBe('code')
  })

  it('handles non-breaking indentation from rich-text platforms', () => {
    const pasted = formatPastedText([
      '\u00a0\u00a0\u00a0\u00a0课程背景与核心价值主张 00:00',
      '\u00a0\u00a0\u00a0\u00a0当前AI行业现状：虽然AI火热，但真正盈利的公司寥寥无几。',
    ].join('\n'))
    expect(parseMarkdown('rich-pasted.md', pasted).regions[0]?.type).not.toBe('code')
  })

  it('recognizes a rich-text prose block without swallowing real code', () => {
    expect(isLikelyProseBlock('课程背景与核心价值主张 00:00\n当前AI行业现状：虽然AI火热，但真正盈利的公司寥寥无几。')).toBe(true)
    expect(isLikelyProseBlock('const total = items.length\nreturn total')).toBe(false)
  })

  it('keeps Markdown plain text when clipboard HTML is also present', () => {
    const markdown = formatClipboardToMarkdown('<p>普通 HTML 段落</p>', '- **课程结构**[**26:19**](https://example.com)\n  - 具体内容')
    expect(markdown).toContain('- **课程结构**')
    expect(markdown).toContain('[**26:19**](https://example.com)')
    expect(markdown).not.toContain('普通 HTML 段落')

    const nested = formatClipboardToMarkdown('<div>丢失列表结构的 HTML</div>', '• 影响力作为最高能力的论证\n  ◦ 能力层级对比\n    ▪ 销售、管理、领导力')
    expect(nested).toContain('- 影响力作为最高能力的论证')
    expect(nested).toContain('  - 能力层级对比')
    expect(nested).toContain('    - 销售、管理、领导力')
  })

  it('restores timestamped section emphasis from old plain documents', () => {
    const document = parseMarkdown('plain-course.md', '课程结构与“道法术器”体系 26:19\n\n周文强负责：IP之“道”与“法”。\n\n其他讲师负责：IP之“术”与“器”。\n\n作业执行与陪跑机制 28:06\n\n落地重要性：必须完成作业才能算结业。\n\n作业示例：通过实践获得真实感受。')
    expect(document.regions[0]?.html).toContain('<strong>课程结构与“道法术器”体系 26:19</strong>')
    expect(document.regions[1]?.type).toBe('list')
    expect(document.regions[1]?.html).toContain('<li>')
    expect(document.regions[2]?.html).toContain('<strong>作业执行与陪跑机制 28:06</strong>')

    const linked = parseMarkdown('linked-course.md', '课程主旨与IP四维模型 [00:02](https://example.com/watch?debug=0&fid=doc#?seek_t=2)\n\n章节内容一。\n\n章节内容二。\n\n下一章 [00:36](https://example.com/watch?debug=0&fid=doc#?seek_t=36)\n\n下一章内容。')
    expect(linked.regions[0]?.html).toContain('<strong>课程主旨与IP四维模型')
    expect(linked.regions[0]?.html).toContain('href="https://example.com/watch?debug=0&amp;fid=doc#?seek_t=2"')
    expect(linked.regions[1]?.type).toBe('list')
    expect(linked.regions[1]?.html).toContain('章节内容一。')
    expect(linked.regions[2]?.html).toContain('<strong>下一章')
  })

  it('keeps linked chapter lists and nested points together', () => {
    const source = String.raw`- **课程主旨与IP四维模型&#xA0;**[**00:02**](https://b.quark.cn/apps/5AZ7aRopS/routes/Gj8VNtRtS?debug=0\&fid=example#?seek_t=2)
  - 介绍课程内容。
  - **录制艰辛**：
    - 利用间隙录制。
- **下一章&#xA0;**[**00:36**](https://b.quark.cn/apps/5AZ7aRopS/routes/Gj8VNtRtS?debug=0\&fid=example#?seek_t=36)
  - 解释“道”的本质。`
    const document = parseMarkdown('chapter-list.md', source)
    expect(document.regions.map((region) => region.type)).toEqual(['list'])
    const html = document.regions[0].html
    expect(html).toContain('课程主旨与IP四维模型')
    expect(html).toContain('<strong>录制艰辛</strong>')
    expect(html).toContain('利用间隙录制。')
    expect(html).toContain('href="https://b.quark.cn/apps/5AZ7aRopS/routes/Gj8VNtRtS?debug=0&amp;fid=example#?seek_t=2"')
    expect((html.match(/<li(?:\s|>)/g) ?? []).length).toBe(6)
    expect(formatPastedText(source)).toContain('  - **录制艰辛**：\n    - 利用间隙录制。')
    const tree = markdownToTree(source, '视频')
    expect(tree?.children.map((child) => child.label)).toEqual(['课程主旨与IP四维模型 [00:02]', '下一章 [00:36]'])
    expect(tree?.children[0]?.children[0]?.detail).toContain('  - **录制艰辛**：\n    - 利用间隙录制。')
  })

  it('removes empty list rows left by trailing bullet markers', () => {
    const document = parseMarkdown('empty-list-row.md', '- P4：承担过某一模块负责人或核心开发人员。\n- P5：担任过一个以上中型研发项目负责人。\n  - 能力要求\n    - 具备培训和教导新员工的能力。\n-')
    expect(document.regions[0]?.html).toContain('P4：承担过某一模块负责人或核心开发人员。')
    expect(document.regions[0]?.html).toContain('具备培训和教导新员工的能力。')
    expect(document.regions[0]?.html).not.toContain('<li></li>')
    expect(document.regions[0]?.html).not.toContain('<li><p></p></li>')
  })

  it('can make legacy implicit headings explicit in the Markdown source', () => {
    const source = '课程主旨与IP四维模型 00:02\n\n普通正文。\n\n**平台规则与起心动念 03:02**\n\n```text\n不要改动 04:00\n```'
    const result = makeImplicitMarkdownHeadingsExplicit(source)
    expect(result.converted).toBe(2)
    expect(result.source).toContain('## 课程主旨与IP四维模型 00:02')
    expect(result.source).toContain('## **平台规则与起心动念 03:02**')
    expect(result.source).toContain('不要改动 04:00')
    expect(result.source).toContain('普通正文。')
  })

  it('re-parses saved plain prose blocks as Markdown', () => {
    const pasted = parseMarkdown('saved-paste.md', '```plain\n**课程背景与核心价值主张** 00:00\n\n- 当前AI行业现状：虽然AI火热。\n- 个体变现路径：利用AI做IP。\n```')
    expect(pasted.regions.map((region) => region.type)).toEqual(['paragraph', 'list'])
    expect(pasted.regions[0]?.html).toContain('<strong>课程背景与核心价值主张</strong>')
    expect(pasted.regions[1]?.html).toContain('当前AI行业现状')

    const code = parseMarkdown('real-code.md', '```plain\nconst total = items.length\nreturn total\n```')
    expect(code.regions[0]?.type).toBe('code')
  })

  it('removes decorative four-star prefixes from pasted article headings', () => {
    expect(formatPastedText('****11API Key 怎么配？\n\n#### ****12 下一节')).toBe('11API Key 怎么配？\n\n#### 12 下一节')
    expect(formatPastedText('```text\n****11 代码内容\n```')).toBe('```text\n****11 代码内容\n```')
  })

  it('keeps bold article section headings separate from surrounding prose', () => {
    expect(formatPastedText('上一段正文。**内容层：把瓶颈从生产移回选题和情绪设计**绝大多数 AI 短剧的生产逻辑')).toBe('上一段正文。\n\n**内容层：把瓶颈从生产移回选题和情绪设计**\n\n绝大多数 AI 短剧的生产逻辑')
    expect(formatPastedText('生产层：人物一致性和声音演技是最耗时的硬功夫\nAI 短剧的观众流失往往不发生在剧情')).toBe('生产层：人物一致性和声音演技是最耗时的硬功夫\n\nAI 短剧的观众流失往往不发生在剧情')
    expect(formatPastedText('上一段正文。\n**窗口期判断**\n下一段正文。')).toBe('上一段正文。\n\n**窗口期判断**\n\n下一段正文。')
    expect(formatPastedText('下面把几个层面拆开说。**先看整体盘子：规模是真的，亏损也是真的**2026年国内AI短剧市场规模预计超400亿元。')).toBe('下面把几个层面拆开说。\n\n**先看整体盘子：规模是真的，亏损也是真的**\n\n2026年国内AI短剧市场规模预计超400亿元。')
    expect(formatPastedText('行业利润集中在少数公司。**绝大多数创作者的真实收入**普通人的账本远比宣传残酷。')).toBe('行业利润集中在少数公司。\n\n**绝大多数创作者的真实收入**\n\n普通人的账本远比宣传残酷。')
    expect(formatPastedText('上一段正文。**钱被谁赚走了：****四个收费站** AI短剧本质上是一条流量生意链。')).toBe('上一段正文。\n\n**钱被谁赚走了：四个收费站**\n\nAI短剧本质上是一条流量生意链。')
    expect(formatPastedText('```text\n**内容层：不要拆开代码**\n```')).toBe('```text\n**内容层：不要拆开代码**\n```')
  })

  it('suggests readable names for pasted Markdown', () => {
    expect(suggestPastedMarkdownName('# AI短剧商业化分析\n\n正文内容')).toBe('AI短剧商业化分析')
    expect(suggestPastedMarkdownName('AI短剧的商业化能不能赚钱，答案取决于你站在产业链的哪个位置。后文')).toBe('AI短剧的商业化能不能赚钱，答案取决于你站在产业链的哪个位置')
  })

  it('keeps pasted raster images renderable as Markdown data URLs', () => {
    const source = formatClipboardImage('data:image/png;base64,aGVsbG8=')
    expect(source).toBe('![剪贴板图片](data:image/png;base64,aGVsbG8=)')
    expect(parseMarkdown('clipboard-image.md', source).regions[0]?.html).toContain('src="data:image/png;base64,aGVsbG8="')
  })

  it('builds a mind map from Markdown and bold section headings', () => {
    expect(markdownToTree('# 文章\n导读内容\n\n## 第一部分\n第一部分内容\n\n**第二部分**\n第二部分内容\n\n### 细节\n细节内容', '文章')).toEqual({
      label: '文章',
      children: [
        { label: '导读：导读内容', detail: '导读内容', children: [] },
        { label: '第一部分', children: [{ label: '内容：第一部分内容', detail: '第一部分内容', children: [] }] },
        { label: '第二部分', children: [
          { label: '内容：第二部分内容', detail: '第二部分内容', children: [] },
          { label: '细节', children: [{ label: '内容：细节内容', detail: '细节内容', children: [] }] },
        ] },
      ],
    })

    const tableTree = markdownToTree('# 文章\n\n## 产品\n| 场景 | 体验 |\n| --- | --- |\n| 阅读 | 清晰 |', '文章')
    expect(tableTree?.children[0].children[0]).toEqual({ label: '内容：场景 · 体验 阅读 · 清晰', detail: '| 场景 | 体验 |\n| --- | --- |\n| 阅读 | 清晰 |', children: [] })

    const linkTree = markdownToTree('# 文章\n\n## 产品介绍 [00:00] (https://example.com/watch?seek_t=0)\n正文\n-', '文章')
    expect(linkTree?.children[0]).toMatchObject({ label: '产品介绍 [00:00]', href: 'https://example.com/watch?seek_t=0' })
    expect(linkTree?.children[0].children[0]).toEqual({ label: '内容：正文', detail: '正文', children: [] })

    const linkedListTree = markdownToTree('# 文章\n\n- **产品介绍 [00:00](https://example.com/watch?seek_t=0)**\n  - 正文\n\n- **下一章 [00:43](https://example.com/watch?seek_t=43)**', '文章')
    expect(linkedListTree?.children[0]).toMatchObject({ label: '产品介绍 [00:00]', href: 'https://example.com/watch?seek_t=0' })
    expect(linkedListTree?.children[1]).toMatchObject({ label: '下一章 [00:43]', href: 'https://example.com/watch?seek_t=43' })

    const quarkTree = markdownToTree(String.raw`# 视频

视频导读。

- **课程主旨与IP四维模型&#xA0;**[**00:02**](https://b.quark.cn/apps/5AZ7aRopS/routes/Gj8VNtRtS?debug=0\&fid=b108e6f648e84c199fde76713d570f81#?seek_t=2)
  - 介绍课程内容。

- **“道”的本质与合道的重要性&#xA0;**[**00:36**](https://b.quark.cn/apps/5AZ7aRopS/routes/Gj8VNtRtS?debug=0\&fid=b108e6f648e84c199fde76713d570f81#?seek_t=36)
  - 解释“道”的本质。`, '视频')
    expect(quarkTree?.children[1]).toMatchObject({
      label: '课程主旨与IP四维模型 [00:02]',
      href: 'https://b.quark.cn/apps/5AZ7aRopS/routes/Gj8VNtRtS?debug=0&fid=b108e6f648e84c199fde76713d570f81#?seek_t=2',
      linkText: '[00:02]',
    })
    expect(quarkTree?.children[2]).toMatchObject({ label: '“道”的本质与合道的重要性 [00:36]', linkText: '[00:36]' })

    const plainLinkedTree = markdownToTree('# 视频\n\n课程主旨与IP四维模型 [00:02](https://example.com/watch?seek_t=2)\n介绍课程内容。', '视频')
    expect(plainLinkedTree?.children[0]).toMatchObject({
      label: '课程主旨与IP四维模型 [00:02]',
      href: 'https://example.com/watch?seek_t=2',
      linkText: '[00:02]',
    })

    const pastedTree = markdownToTree('课程背景与核心价值主张 00:00\n\n当前AI行业现状：虽然AI火热。\n\n课程介绍与师资阵容 00:37\n\n课程定价与规格：价格为2800元。', '课程总结')
    expect(pastedTree?.children.map((child) => child.label)).toEqual(['课程背景与核心价值主张 00:00', '课程介绍与师资阵容 00:37'])
  })

  it('renders Markdown syntax used inside mind map summaries', () => {
    const html = renderMarkdownFragment('**重点**\n\n- `code`\n\n| 字段 | 值 |\n| --- | --- |\n| 状态 | 正常 |')
    expect(html).toContain('<strong>重点</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<table>')
  })
})
