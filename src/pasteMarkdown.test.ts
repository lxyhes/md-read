// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import courseSource from '../docs/fixtures/直播电商选品-原文.md?raw'
import { formatClipboardToMarkdown } from './pasteMarkdown'
import { parseMarkdown, renderMarkdownFragment } from './parser'

describe('Word clipboard paste', () => {
  it('keeps Word headings, inline formatting, nested numbering and table paragraphs', () => {
    const html = `<div class="WordSection1">
      <p class="MsoHeading2">研发 &amp; 交付计划</p>
      <p class="MsoNormal">保留 <b>加粗</b>、<i>斜体</i>和<a href="https://example.com/guide">文档链接</a></p>
      <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><!--[if !supportLists]><span style="mso-list:Ignore">5.<span>&nbsp;</span></span><![endif]-->准备资料</p>
      <p class="MsoListParagraph" style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">&nbsp;</span>确认范围</p>
      <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">6.&nbsp;</span>正式发布</p>
      <table><tr><td>状态</td><td>说明</td></tr><tr><td>待办</td><td><p>第一行</p><p>第二行</p></td></tr></table>
    </div>`
    const text = '研发 & 交付计划\n保留 加粗、斜体和文档链接\n5. 准备资料\n• 确认范围\n6. 正式发布'
    const source = formatClipboardToMarkdown(html, text)
    expect(source).toBe([
      '## 研发 & 交付计划',
      '',
      '保留 **加粗**、*斜体*和[文档链接](https://example.com/guide)',
      '',
      '5. 准备资料',
      '   - 确认范围',
      '6. 正式发布',
      '',
      '| 状态 | 说明 |',
      '| --- | --- |',
      '| 待办 | 第一行<br>第二行 |',
    ].join('\n'))
    const rendered = parseMarkdown('word-paste.md', source).regions.map(region => region.html).join('')
    const document = new DOMParser().parseFromString(rendered, 'text/html')
    const list = document.querySelector('ol[start="5"]')
    expect(list?.querySelector('li > ul > li')?.textContent).toBe('确认范围')
    expect(list?.lastElementChild?.textContent).toBe('正式发布')
    expect(document.querySelector('tbody td:nth-child(2)')?.innerHTML).toMatch(/第一行<br\s*\/?>第二行/)
  })

  it('uses plain text when the Word HTML and text describe different selections', () => {
    expect(formatClipboardToMarkdown('<p class="MsoNormal"><b>Unrelated text</b></p>', 'New clipboard text')).toBe('New clipboard text')
  })
})

describe('WeChat article paste', () => {
  it('keeps centered or semantic image captions attached through paste and rendering', () => {
    const html = `<p><img src="https://example.com/diagram.png" alt="流程图"></p>
      <p style="text-align: center">流程图与<a href="https://example.com/guide">说明</a></p>
      <p>下一段普通正文。</p>
      <figure><img src="https://example.com/sample.png" alt="示例图"><figcaption>示例说明</figcaption></figure>`
    for (const format of ['default', 'wechat-article'] as const) {
      const source = formatClipboardToMarkdown(html, '', format)
      const [image, paragraph, figure] = parseMarkdown('captions.md', source).regions
      expect(image.type).toBe('image')
      expect(image.textContent).toBe('流程图与说明')
      expect(image.html).toContain('<figure class="markdown-image-figure">')
      expect(image.html).toContain('<figcaption>流程图与<a href="https://example.com/guide"')
      expect(image.html).toContain('>说明</a></figcaption>')
      expect(paragraph.textContent).toBe('下一段普通正文。')
      expect(figure.html).toContain('<figcaption>示例说明</figcaption>')
      expect(renderMarkdownFragment(source)).toContain('<figcaption>示例说明</figcaption>')
    }
  })

  it('recognizes detached captions in older imports without absorbing ordinary prose', () => {
    const imageAndCaption = '![图片](panel.png)\n\n并发控制面板'
    const source = `${imageAndCaption}\n\n>2. 下一节\n\n![图片](other.png)\n\n这句是普通正文。\n\n>3. 更多内容\n\n![图片](third.png)\n\n*带格式的旧图注*`
    const regions = parseMarkdown('legacy.md', source).regions
    expect(regions[0].type).toBe('image')
    expect(source.slice(regions[0].sourceStart, regions[0].sourceEnd)).toBe(imageAndCaption)
    expect(regions[0].html).toContain('<figcaption>并发控制面板</figcaption>')
    expect(regions[2].html).not.toContain('figcaption')
    expect(regions[3].textContent).toBe('这句是普通正文。')
    expect(regions[5].html).toContain('<figcaption>带格式的旧图注</figcaption>')
  })

  it('attaches detached labels between consecutive images and before surrounding prose', () => {
    const source = [
      '![图片](first.png)', '开源项目页面', '![图片](second.png)', '工具面板',
      '这里开始介绍接入前需要准备的环境：',
      '![图片](third.png)', '下面请注意：', '这句话属于正文。',
    ].join('\n\n')
    const regions = parseMarkdown('legacy-gallery.md', source).regions
    expect(regions[0].html).toContain('<figcaption>开源项目页面</figcaption>')
    expect(regions[1].html).toContain('<figcaption>工具面板</figcaption>')
    expect(regions[2].textContent).toBe('这里开始介绍接入前需要准备的环境：')
    expect(regions[3].html).not.toContain('figcaption')
    expect(regions[4].textContent).toBe('下面请注意：')
    expect(renderMarkdownFragment(source).match(/<figcaption>/g)).toHaveLength(2)
  })

  it('converts a bordered warning card and leaves the following paragraph outside it', () => {
    const html = `<h2>03 经验总结</h2>
      <section style="border-left: 4px solid #f59a38; background-color: #fff6e8">
        <section><p>实话</p><p><strong>先检查配置和版本</strong>，再参考<a href="https://example.com/">使用文档</a>。</p></section>
      </section>
      <p>这是紧接在框外的正文。</p>
      <p>实话</p><p>这是没有边框的普通段落。</p>`
    const text = '03 经验总结\n实话\n先检查配置和版本，再参考使用文档。\n这是紧接在框外的正文。\n实话\n这是没有边框的普通段落。'
    for (const format of ['default', 'wechat-article'] as const) {
      const source = formatClipboardToMarkdown(html, text, format)
      expect(source).toContain('> [!WARNING] 实话\n>\n> **先检查配置和版本**，再参考[使用文档](https://example.com/)。')
      const regions = parseMarkdown('warnings.md', source).regions
      const warnings = regions.filter((region) => region.html.includes('class="markdown-callout callout-warning"'))
      expect(warnings).toHaveLength(1)
      expect(warnings[0].html).toContain('<strong>先检查配置和版本</strong>')
      expect(warnings[0].html).not.toContain('紧接在框外')
      expect(regions.some((region) => region.type === 'paragraph' && region.textContent === '这是没有边框的普通段落。')).toBe(true)
    }
  })

  it('uses the card styling or semantic markup to choose its type with identical custom titles', () => {
    const html = `<section style="border-left: 4px solid rgb(72, 165, 82); background: #f0f7ee"><p>先说清楚</p><p>这是绿色提示。</p></section>
      <section style="border-inline-start: 4px solid #e93; background-color: #fff7e7"><p>先说清楚</p><p>这是橙色提示。</p></section>
      <aside data-callout="tip"><p>标题可以是任意文字：</p><p>这是语义化提示。</p></aside>
      <section style="border-left: 3px solid #4c5"><p>先说清楚</p><p>这是只有边框的普通容器。</p></section>
      <section style="border: 3px solid #4c5; background-color: #f0f7ee"><p>先说清楚</p><p>这是四边相同的普通容器。</p></section>`
    for (const format of ['default', 'wechat-article'] as const) {
      const source = formatClipboardToMarkdown(html, '', format)
      expect(source).toContain('> [!TIP] 先说清楚\n>\n> 这是绿色提示。')
      expect(source).toContain('> [!WARNING] 先说清楚\n>\n> 这是橙色提示。')
      expect(source).toContain('> [!TIP] 标题可以是任意文字：')
      const callouts = parseMarkdown('callouts.md', source).regions.filter((region) => region.html.includes('class="markdown-callout '))
      expect(callouts).toHaveLength(3)
      expect(callouts.every((region) => !region.html.includes('普通容器'))).toBe(true)
    }
  })

  it('converts separate number badges and bold labels to the existing steps callout', () => {
    const html = `<p>按下面三个步骤操作。</p><section>
      <section><span style="font-weight:700">1</span><section><strong>准备</strong>：打开<a href="https://example.com/">示例文件</a>。</section></section>
      <section><p><b>2</b></p><p><strong>检查：</strong>核对文件内容。</p></section>
      <section><span>3</span><p><strong>保存</strong>：写入改动。</p></section>
      </section><p>这里是步骤之后的普通正文。</p><ol><li>普通列表一</li><li>普通列表二</li></ol>`
    const text = '按下面三个步骤操作。\n1准备：打开示例文件。\n2检查：核对文件内容。\n3保存：写入改动。\n这里是步骤之后的普通正文。\n普通列表一\n普通列表二'
    for (const format of ['default', 'wechat-article'] as const) {
      const source = formatClipboardToMarkdown(html, text, format)
      expect(source).toContain('> [!STEPS]\n>\n> 1. **准备**： 打开[示例文件](https://example.com/)。\n> 2. **检查**： 核对文件内容。\n> 3. **保存**： 写入改动。')
      const document = parseMarkdown('article.md', source)
      const steps = document.regions.filter((region) => region.html.includes('class="markdown-steps"'))
      expect(steps).toHaveLength(1)
      expect(steps[0].html).not.toContain('普通正文')
      expect(document.regions.some((region) => region.type === 'list' && region.textContent.includes('普通列表一'))).toBe(true)
    }
  })

  it('renders a sequence of broken star-prefixed steps in saved Markdown without editing it', () => {
    const oldSteps = '1****准备**：打开文件。\n\n2****检查**：核对文件。\n\n3****保存**：写入改动。'
    const source = `段落正文\n\n${oldSteps}\n\n单独一行\n\n1****保留**：独立编号。`
    const doc = parseMarkdown('old-article.md', source)
    const steps = doc.regions.find((region) => region.html.includes('class="markdown-steps"'))
    expect(steps?.html).toContain('<strong class="step-label">准备</strong>')
    expect(source.slice(steps?.sourceStart, steps?.sourceEnd)).toBe(oldSteps)
    expect(renderMarkdownFragment(source)).toContain('class="markdown-steps"')
    expect(renderMarkdownFragment(source).match(/class="markdown-steps"/g)).toHaveLength(1)
    expect(renderMarkdownFragment('\x60\x60\x60\n' + oldSteps + '\n\x60\x60\x60')).not.toContain('class="markdown-steps"')
  })

  it('pairs separately styled section numbers and labels in the reading outline', () => {
    const html = `<h1 class="rich_media_title">这是一篇图文教程</h1><section id="js_content">
      <section><div><span style="font-size: 42px; font-weight: 900">01</span></div><div><section style="font-weight: 700">第一部分：几个关键步骤</section></div></section>
      <p>下面是原来的正文。</p>
      <section style="display: flex"><span style="font-size: 36px">02</span><span>第二部分：例子和小结</span></section>
      <h2>03</h2><p><b>最后一部分：回顾细节</b></p>
      <p><span style="font-size: 24px; font-weight: 700">04</span></p><p>这句是普通正文，不能被吞掉。</p>
    </section>`
    const source = formatClipboardToMarkdown(html, '', 'wechat-article')
    const document = parseMarkdown('article.md', source)
    expect(document.headings.map(({ text, depth }) => [text, depth])).toEqual([
      ['这是一篇图文教程', 1],
      ['01 第一部分：几个关键步骤', 2],
      ['02 第二部分：例子和小结', 2],
      ['03 最后一部分：回顾细节', 2],
    ])
    expect(source).toContain('下面是原来的正文。')
    expect(source).toContain('这句是普通正文，不能被吞掉。')
  })

  it('converts the decorative header and code in copied cards to fenced blocks', () => {
    const html = '<p>示例命令如下：</p><section class="code-block"><div><span>●●●</span><span>BASH</span></div><div><code>echo "sample"</code></div></section><p>下文有 <code>inline</code>。</p>'
    const source = formatClipboardToMarkdown(html, '示例命令如下：\n●●●\nBASH\necho "sample"\n下文有 inline。', 'wechat-article')
    expect(source).toBe(['示例命令如下：', '', '```bash', 'echo "sample"', '```', '', '下文有 `inline`。'].join('\n'))
  })

  it('repairs saved cards in reader and preview while retaining the original code region offsets', () => {
    const card = '●●●\n\nbash\n\n`echo sample`'
    const source = ['编辑器**，后续说明。', card, '保留转义的星号\\*\\*，这是有意写的。', '`inline`'].join('\n\n')
    const document = parseMarkdown('old-clipboard.md', source)
    const code = document.regions.find((region) => region.type === 'code')
    expect(code?.metadata?.language).toBe('bash')
    expect(source.slice(code?.sourceStart, code?.sourceEnd)).toBe(card)
    expect(document.regions[0].textContent).toBe('编辑器，后续说明。')
    expect(document.regions[2].textContent).toContain('星号**，')
    expect(renderMarkdownFragment(source)).toContain('<pre><code data-language="bash">echo sample</code></pre>')
    expect(renderMarkdownFragment(source)).not.toContain('●●●')
    expect(parseMarkdown('ordinary.md', '真实的星号**，以及 `inline`。').regions[0].textContent).toContain('星号**，')
  })

  it('keeps the article header and turns styled sections and lazy images into Markdown blocks', () => {
    const image = 'https://mmbiz.qpic.cn/example/640?wx_fmt=png'
    const html = `<h1 id="activity-name" class="rich_media_title">剪贴板文章示例</h1>
      <div id="meta_content"><a href="https://mp.weixin.qq.com/">测试作者</a> <em id="publish_time">2026-11-18</em></div>
      <section id="js_content">
        <p><span style="font-size: 22px"><strong>一、章节标题</strong></span></p>
        <p>正文有<strong>重点</strong>。</p>
        <img data-src="${image}">
        <p>图注和<a href="https://example.com/">参考链接</a></p>
      </section>
      <footer>原网页底栏</footer>`
    const text = '剪贴板文章示例\n测试作者 2026-11-18\n一、章节标题\n正文有重点。\n图注和参考链接\n原网页底栏'
    const source = formatClipboardToMarkdown(html, text, 'wechat-article')
    expect(source).toContain('# 剪贴板文章示例\n\n[测试作者](https://mp.weixin.qq.com/) *2026-11-18*')
    expect(source).toContain(`## 一、章节标题\n\n正文有**重点**。\n\n![](${image})\n\n图注和[参考链接](https://example.com/)`)
    expect(source).not.toContain('原网页底栏')
  })

  it('falls back to plain text when copied HTML is missing or belongs to another article', () => {
    const text = '这是一篇来自剪贴板的公众号文章'
    expect(formatClipboardToMarkdown('', text, 'wechat-article')).toBe(text)
    expect(formatClipboardToMarkdown('<p>无关内容</p><img src="https://example.com/stale.png">', text, 'wechat-article')).toBe(text)
  })

  it('keeps entities, nested image wrappers, split headings and literal emphasis markers', () => {
    const image = 'https://mmbiz.qpic.cn/example/640?wx_fmt=png'
    const html = `<section id="js_content">
      <p>研发 &amp; 测试的详细记录</p>
      <p style="font-size:20px"><b>01</b> <b>章节标题</b></p>
      <section class="code-comment" style="opacity: 0.9"><p>图片之前的介绍</p></section>
      <p><span><img src="data:image/gif;base64,AAAA" data-actualsrc="${image.slice(6)}"></span><span>原图图注</span></p>
      <p><strong>双层<span style="font-weight: 700">强调</span></strong>之后是字面星号 **。</p>
      <div id="js_cmt_area">留言区</div>
    </section>`
    const source = formatClipboardToMarkdown(html, '研发 & 测试的详细记录\n01 章节标题\n图片之前的介绍\n原图图注', 'wechat-article')
    expect(source).toContain(`研发 & 测试的详细记录\n\n## 01 章节标题\n\n图片之前的介绍\n\n![](${image})\n\n原图图注`)
    expect(source).toContain('**双层强调**之后是字面星号 \\*\\*。')
    expect(source).not.toContain('留言区')
    const doc = parseMarkdown('wechat.md', source)
    expect(doc.regions.some((region) => region.type === 'image')).toBe(true)
    expect(doc.regions.some((region) => region.html.includes('<strong>双层强调</strong>'))).toBe(true)
  })
})

describe('rich clipboard list hierarchy', () => {
  it('uses the original image URL from HTML even when the copied Markdown has a preview', () => {
    const preview = 'https://img-view-c-sz.drive.quark.cn/assets/preview?x=1&y=2'
    const original = 'https://img-view-c-sz.drive.quark.cn/assets/original.png'
    const html = `<p>内容摘要</p><img alt="封面" src="${preview}" data-src="${preview}" data-original-src="${original}">`
    const plain = `# 内容摘要\n\n[image](${preview.replace('&', '\\&')})\n\n- 章节\n  - 内容`
    const source = formatClipboardToMarkdown(html, plain)
    expect(source).not.toContain('/preview?')
    expect(source.split(original)).toHaveLength(2)
    const document = parseMarkdown('course.md', source)
    expect(document.regions.find((region) => region.type === 'image')?.metadata?.url).toBe(original)
    expect(formatClipboardToMarkdown(html, '')).toContain(`![封面](${original})`)
    expect(formatClipboardToMarkdown('', plain)).toContain('/preview?')
  })

  it('renders a nested bold chapter title and keeps its timestamp clickable', () => {
    const title = '实时数字人与NUI（自然用户界面）'
    const url = 'https://b.quark.cn/video#?seek_t=1218'
    const html = `<ul><li>AI Agent 与数字人<ul><li><strong><span style="font-weight: 700">${title}</span><a href="${url}">20:18</a></strong></li></ul></li></ul>`
    const pasted = formatClipboardToMarkdown(html, '')
    expect(pasted).toContain(`**${title}[20:18](${url})**`)
    const saved = `- AI Agent 与数字人\n  - ****${title}**[20:18](${url})**`
    for (const source of [pasted, saved]) {
      const expected = `<strong>${title}<a href="${url}"`
      expect(parseMarkdown('course.md', source).regions[0].html).toContain(expected)
      expect(renderMarkdownFragment(source)).toContain(expected)
    }
  })

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

  it('formats Baidu Netdisk AI summaries into timestamped outline cards', () => {
    const source = [
      '摘要',
      'FDE（前线部署工程师）是将AI技术落地到企业业务场景的关键角色。',
      '',
      '分段总结',
      '00:01',
      '职业红利与信息差',
      '1.职业红利：第一批知道AI商业化的人，存在巨大的信息差。',
      '2.信息差：关于AI赛道的赚钱方式、分类、所需能力等。',
      '',
      '01:32',
      '七天系统大课介绍',
      '1.课程目标：全面理解AI商业化的职业（FD）。',
      '',
      '重点',
      '大模型应用中的关键环节',
      '04:52',
      'AI商业化的机会',
      '08:16',
    ].join('\n')

    const pasted = formatClipboardToMarkdown('', source, 'baidu-netdisk-ai')
    expect(pasted).toContain('## 摘要')
    expect(pasted).toContain('## 分段总结')
    expect(pasted).toContain('### 职业红利与信息差 00:01')
    expect(pasted).toContain('### 七天系统大课介绍 01:32')
    expect(pasted).toContain('### 大模型应用中的关键环节 04:52')
    expect(pasted).toContain('### AI商业化的机会 08:16')

    const document = parseMarkdown('baidu-netdisk-ai.md', pasted)
    expect(document.headings.map((heading) => heading.text)).toEqual([
      '摘要', '分段总结', '职业红利与信息差 00:01', '七天系统大课介绍 01:32', '重点', '大模型应用中的关键环节 04:52', 'AI商业化的机会 08:16',
    ])
    expect(document.regions.some((region) => region.type === 'list' && region.html.includes('职业红利'))).toBe(true)
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
