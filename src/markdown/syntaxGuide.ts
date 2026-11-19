import { markdownProcessor } from './fragment'
import type { MdastNode } from './shared'

export type SyntaxExample = {
  name: string
  source: string
  tip: string
  mode?: 'inline' | 'copy'
  keywords?: string
  previewSource?: string
  previewText?: string
  diagram?: string
  reference?: string
}

const flowchart = 'flowchart LR\n  A[开始] --> B[完成]'

export const syntaxGuide: { name: string; examples: SyntaxExample[] }[] = [
  { name: '常用写法', examples: [
    { name: '标题', source: '# 一级标题\n\n## 二级标题\n\n### 三级标题', tip: '在行首写 1 到 6 个 #，后面加一个空格。# 越多，标题级别越低。', keywords: 'heading h1 h2' },
    { name: '段落与空行', source: '第一段文字。\n\n第二段文字。', tip: '两个段落之间留一个空行。', keywords: 'paragraph enter' },
    { name: '粗体', source: '**重点文字**', tip: '在文字两侧各写两个星号。', mode: 'inline', keywords: '加粗 黑体 bold **' },
    { name: '斜体', source: '*强调文字*', tip: '在文字两侧各写一个星号，也可以用下划线。', mode: 'inline', keywords: 'italic * _' },
    { name: '粗斜体', source: '***重要提醒***', tip: '在文字两侧各写三个星号。', mode: 'inline', keywords: '加粗 斜体 bold italic ***' },
    { name: '删除线', source: '~~已废弃~~', tip: '在文字两侧各写两个波浪号。', mode: 'inline', keywords: '划掉 strike gfm' },
    { name: '高亮', source: '==请记住这句话==', tip: '在文字两侧各写两个等号。', mode: 'inline', keywords: '标记 荧光 highlight' },
    { name: '上下标', source: 'H~2~O 和 x^2^', tip: '用波浪号包住下标，用脱字符 ^ 包住上标。', mode: 'inline', keywords: 'subscript superscript 平方' },
    { name: '行内代码', source: '`npm run dev`', tip: '用反引号包住变量名、命令或短代码。', mode: 'inline', keywords: 'inline code' },
  ] },
  { name: '列表与结构', examples: [
    { name: '无序列表', source: '- 苹果\n- 香蕉', tip: '每项以短横线和一个空格开头。也可以用 * 或 +。', keywords: '项目符号 list bullet' },
    { name: '有序列表', source: '1. 收集资料\n2. 整理笔记', tip: '在每项前写数字、句点和空格，例如 1. 。', keywords: '编号 步骤 ordered list' },
    { name: '嵌套列表', source: '- 学习计划\n  - 阅读文档\n  - 动手练习', tip: '让子项的列表标记与父项的正文对齐。', keywords: '层级 缩进 nested list' },
    { name: '任务列表', source: '- [ ] 待完成\n- [x] 已完成', tip: '在方括号里写空格表示未完成，写 x 表示已完成。', keywords: '待办 清单 打勾 复选框 todo checkbox task gfm' },
    { name: '引用', source: '> 这是一段引用。\n>\n> 这是引用中的第二段。', tip: '每行以 > 和空格开头。用单独的 > 在引用里分段。', keywords: 'quote blockquote' },
    { name: '分隔线', source: '---', tip: '单独一行写三个短横线，并与前一段隔一个空行。也可以用 *** 或 ___。', keywords: '横线 divider hr' },
    { name: '硬换行', source: '第一行\\\n第二行', tip: '在行尾写一个反斜杠再回车，或在回车前留两个空格。', keywords: '换行 break' },
    { name: '下划线式标题', source: '一级标题\n========\n\n二级标题\n--------', tip: '在标题文字的下一行写等号或短横线，分别表示一级或二级标题。', keywords: 'setext heading' },
  ] },
  { name: '链接与媒体', examples: [
    { name: '链接', source: '[项目说明](./README.md)', tip: '方括号写显示文字，圆括号写网址或相对于当前文档的路径。', mode: 'inline', keywords: '超链接 link url' },
    { name: '自动链接', source: '<https://example.com>\n\n<hello@example.com>', tip: '把网址或邮箱放进尖括号，显示文字就是地址本身。', keywords: 'autolink url email 邮箱 网址 gfm' },
    { name: '引用式链接', source: '请阅读[项目说明][guide-readme]。\n\n[guide-readme]: ./README.md', tip: '正文使用引用名，再在另一行定义对应地址。同一个地址可以复用。', keywords: 'reference link', reference: 'guide-readme' },
    { name: '图片', source: '![图片说明](./photo.png)', tip: '在链接写法前加 !，把路径换成你的图片地址。方括号里写图片的替代文字。', keywords: '插图 image alt' },
    { name: '引用式图片', source: '![图片说明][guide-photo]\n\n[guide-photo]: ./photo.png', tip: '将图片路径单独定义，可以在文档里多次引用。', keywords: 'reference image', reference: 'guide-photo' },
    { name: '图片宽度', source: '<img src="./photo.png" alt="图片说明" width="80">', tip: '用 HTML 的 width 属性控制图片宽度，例子中的 80 表示 80 像素。', keywords: '缩放 大小 尺寸 html img' },
    { name: '视频', source: '[视频](./demo.mp4)', tip: '让视频链接单独占一个段落，并把路径换成你的视频文件。', keywords: 'video mp4 webm', previewText: '阅读视图会在这里显示视频播放器。' },
  ] },
  { name: '表格与代码', examples: [
    { name: '表格与对齐', source: '| 项目 | 状态 | 数量 |\n| :--- | :---: | ---: |\n| 笔记 | 完成 | 3 |\n| 草稿 | 待办 | 12 |', tip: '用竖线分列。第二行的冒号分别表示左对齐、居中和右对齐。', keywords: 'table gfm' },
    { name: '围栏代码块', source: '```js\nconsole.log("你好");\n```', tip: '用两行三个反引号包住代码。在首行反引号后加语言名，可开启语法高亮。也可用三个波浪号。', keywords: 'fence code 编程 javascript' },
    { name: '缩进代码块', source: '    print("你好")\n    print("Markdown")', tip: '在代码块前留空行，并在每一行代码前加四个空格。', keywords: 'indent code' },
    { name: '转义符号', source: '\\*这些星号会显示出来\\*', tip: '在星号等 Markdown 标点前加反斜杠，让它按原样显示。', mode: 'inline', keywords: 'escape 原样 星号' },
    { name: 'HTML 标签', source: '<details>\n<summary>展开查看</summary>\n<p>这是折叠起来的内容。</p>\n</details>', tip: '可以内嵌受支持的 HTML 标签，例如 details 折叠内容或 kbd 表示按键。', keywords: '折叠 details html' },
    { name: 'HTML 注释', source: '<!-- 这是一条编辑备注 -->', tip: '注释保留在 Markdown 源码里，阅读时会隐藏。', keywords: 'comment html', previewText: '注释在阅读时隐藏。' },
    { name: 'HTML 字符实体', source: '&copy; · &lt;标签&gt; · &amp;', tip: '字符实体以 & 开头、分号结尾，可显示 ©、尖括号和 & 等字符。', mode: 'inline', keywords: 'entity 特殊字符' },
  ] },
  { name: '公式与文档扩展', examples: [
    { name: '行内公式', source: '$E = mc^2$', tip: '用一对美元符号把短公式放在正文行内。', mode: 'inline', keywords: '数学 latex math' },
    { name: '块级公式', source: '$$\n\\frac{1}{2} + \\frac{1}{2} = 1\n$$', tip: '用两行 $$ 把公式单独成块。例子里的 \\frac 用来写分数。', keywords: '数学 latex math 分数' },
    { name: 'Mermaid 流程图', source: `\`\`\`mermaid\n${flowchart}\n\`\`\``, tip: '给代码围栏标记 mermaid。在流程图中，--> 连接两个节点。', keywords: '图表 diagram flowchart', diagram: flowchart },
    { name: '脚注', source: '这句话需要补充说明。[^guide-note]\n\n[^guide-note]: 这里写补充内容。', tip: '正文和定义使用同一个脚注名。给不同脚注起不同的名字。', keywords: '注释 footnote gfm', reference: '^guide-note' },
    { name: '目录', source: '[toc]', tip: '在已有标题的文档里，让 [toc] 单独成段，就能生成目录。', keywords: '大纲 toc', previewSource: '[toc]\n\n## 开始写作\n\n## 常用技巧' },
    { name: '提示框', source: '> [!TIP]\n> 保存前可以先查看阅读效果。', tip: '引用的第一行写 [!TIP]。也可用 NOTE、IMPORTANT、WARNING、CAUTION 等类型。', keywords: '警告 注意 callout alert note tip important warning caution info success failure danger bug example quote' },
    { name: '文档元数据', source: '---\ntitle: 我的笔记\n---', tip: '把 YAML 元数据放在文件开头。墨阅可用 title 作为文档标题。', mode: 'copy', keywords: 'yaml front matter frontmatter 标题 属性', previewText: '文档标题为「我的笔记」，元数据块在正文里隐藏。' },
    { name: 'TOML 元数据', source: '+++\ntitle = "我的笔记"\n+++', tip: 'TOML 也可以放在文件开头，使用 +++ 作为边界。', mode: 'copy', keywords: 'toml front matter frontmatter 属性', previewText: '元数据块在正文里隐藏。' },
  ] },
]

function normalizeSearch(text: string) {
  return text.normalize('NFKC').trim().toLowerCase()
}

export function searchSyntaxGuide(query: string) {
  const phrase = normalizeSearch(query)
  if (!phrase) return syntaxGuide
  const terms = phrase.split(/\s+/)
  const matches = syntaxGuide.flatMap(group => group.examples.flatMap(example => {
    const name = normalizeSearch(example.name)
    const aliases = normalizeSearch(example.keywords ?? '').split(/\s+/)
    const context = normalizeSearch([group.name, example.tip, example.source].join(' '))
    const scores = terms.map(term => {
      if (name === term) return 5
      if (aliases.includes(term)) return 4
      if (name.includes(term)) return 3
      if (aliases.some(alias => alias.includes(term))) return 2
      return context.includes(term) ? 1 : 0
    })
    if (scores.includes(0)) return []
    const score = scores.reduce<number>((total, termScore) => total + termScore, 0)
      + (name === phrase ? 5 * terms.length : 0)
    return [{ example, score }]
  }))
  const examples = matches.sort((a, b) => b.score - a.score).map(match => match.example)
  return examples.length ? [{ name: '搜索结果', examples }] : []
}

export function insertSyntaxExample(source: string, position: number, example: SyntaxExample) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  let text = example.source.replace(/\n/g, eol)
  if (example.reference) {
    const label = example.reference
    const existing = source.toLowerCase()
    let unusedLabel = label
    for (let index = 2; existing.includes(`[${unusedLabel}]`); index++) {
      unusedLabel = `${label}-${index}`
    }
    text = text.replaceAll(`[${label}]`, `[${unusedLabel}]`)
  }
  if (example.mode === 'inline') {
    return { value: source.slice(0, position) + text + source.slice(position), cursor: position + text.length }
  }
  const tree = markdownProcessor.parse(source) as unknown as MdastNode
  const block = tree.children?.find(({ position: range }) =>
    (range?.start?.offset ?? Infinity) <= position && position <= (range?.end?.offset ?? -1))
  const lineEnd = source.indexOf('\n', block?.position?.end?.offset ?? position)
  position = lineEnd < 0 ? source.length : lineEnd + 1
  const before = source.slice(0, position)
  const after = source.slice(position)
  const prefix = !before || before.endsWith(eol + eol) ? '' : before.endsWith(eol) ? eol : eol + eol
  const suffix = !after || after.startsWith(eol + eol) ? '' : after.startsWith(eol) ? eol : eol + eol
  return { value: before + prefix + text + suffix + after, cursor: position + prefix.length + text.length }
}
