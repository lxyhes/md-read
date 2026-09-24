type ClipboardDocument = Document

function inlineText(value: string, node?: Node) {
  let element = node?.parentElement ?? null
  while (element) {
    if (/white-space\s*:\s*(?:pre(?:-wrap)?|break-spaces)/i.test(element.getAttribute('style') ?? '')) {
      return value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ')
    }
    element = element.parentElement
  }
  return value.replace(/\s+/g, ' ')
}

function safeLink(value: string) {
  const url = value.trim()
  return /^(?:https?:|mailto:|\/\/)/i.test(url) || !/^[a-z][a-z\d+.-]*:/i.test(url) ? url : ''
}

function attributeUrl(element: HTMLElement | null, names: string[]) {
  if (!element) return ''
  for (const name of names) {
    const value = safeLink(element.getAttribute(name) ?? '')
    if (value) return value
  }
  const srcset = element.getAttribute('srcset') ?? element.getAttribute('data-srcset') ?? ''
  const firstSrc = srcset.split(',')[0]?.trim().split(/\s+/)[0] ?? ''
  return safeLink(firstSrc)
}

function imageUrl(element: HTMLElement | null) {
  return attributeUrl(element, ['data-src', 'data-original', 'data-original-src', 'data-image-src', 'data-lazy-src', 'data-url', 'src'])
}

function imageAlt(element: HTMLElement | null) {
  if (!element) return ''
  return element.getAttribute('alt') || element.getAttribute('title') || element.getAttribute('data-alt') || ''
}

function isTrackingImage(element: HTMLElement | null) {
  if (!element) return true
  const width = Number(element.getAttribute('width') ?? element.dataset.width ?? 0)
  const height = Number(element.getAttribute('height') ?? element.dataset.height ?? 0)
  return (width > 0 && width <= 2) || (height > 0 && height <= 2)
}

function imageMarkdown(element: HTMLElement | null) {
  if (isTrackingImage(element)) return ''
  const src = imageUrl(element)
  return src ? `![${imageAlt(element)}](${src})` : ''
}

function mediaMarkdown(element: HTMLElement) {
  const src = attributeUrl(element, ['src', 'data-src', 'data-url', 'href']) || attributeUrl(element.querySelector('source') as HTMLElement | null, ['src', 'data-src'])
  if (!src) return ''
  const label = element.tagName.toLowerCase() === 'audio' ? '音频' : '视频'
  return `[${label}](${src})`
}

function hasStyle(element: HTMLElement, pattern: RegExp) {
  return pattern.test(element.getAttribute('style') ?? '')
}

function codeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u00a0/g, ' ')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()
  if (tag === 'br') return '\n'
  if (['script', 'style', 'noscript'].includes(tag)) return ''
  const value = Array.from(element.childNodes).map(codeText).join('')
  if (['div', 'p', 'li', 'section', 'article', 'pre'].includes(tag) && value && !value.endsWith('\n')) return `${value}\n`
  return value
}

function darkColor(value: string) {
  const hex = value.match(/#([\da-f]{3,8})/i)?.[1]
  if (hex) {
    const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex
    const [red, green, blue] = [normalized.slice(0, 2), normalized.slice(2, 4), normalized.slice(4, 6)].map((part) => Number.parseInt(part, 16))
    return (red * 299 + green * 587 + blue * 114) / 1000 < 125
  }
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!rgb) return false
  return (Number(rgb[1]) * 299 + Number(rgb[2]) * 587 + Number(rgb[3]) * 114) / 1000 < 125
}

function hasCodeStyle(element: HTMLElement) {
  const signal = classAndId(element)
  if (element.hasAttribute('data-code-block') || /(?:^|[-_\s])(code|code-block|codeblock|highlight|syntax|hljs|monaco|codemirror)(?:$|[-_\s])/i.test(signal)) return true
  const style = element.getAttribute('style') ?? ''
  const background = style.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1] ?? ''
  return (darkColor(background) || hasStyle(element, /font-family\s*:\s*(?:ui-)?monospace/i)) && codeText(element).split(/\r?\n/).filter((line) => line.trim()).length >= 2
}

function looksLikeDiagram(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 4) return false
  const signalLines = lines.filter((line) => /[↓↑←→↔┌┐└┘├┤┬┴┼│─━═]/.test(line)).length
  return signalLines >= 2 && (lines.some((line) => /[┌┐└┘├┤┬┴┼│─━═]/.test(line)) || signalLines >= 3)
}

function renderCodeBlock(source: string, language = 'plain') {
  const value = source.replace(/\r\n?/g, '\n').replace(/^\n|\n$/g, '')
  if (!value.trim()) return ''
  const fence = value.includes('```') ? '~~~' : '```'
  return `${fence}${language}\n${value}\n${fence}\n\n`
}

export function isLikelyProseBlock(value: string) {
  const text = value.replace(/\u00a0/g, ' ').trim()
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return false
  const visibleCharacters = Array.from(text).filter((character) => !/\s/.test(character)).length
  const proseCharacters = (text.match(/[\u3400-\u9fff]/g) ?? []).length
  const codeSignals = /[{}]|=>|<\/?[a-z][^>]*>|\b(?:const|let|function|import|select|from|class)\b/i.test(text)
  return proseCharacters >= 12 && proseCharacters / Math.max(visibleCharacters, 1) >= 0.35 && !codeSignals
}

function isPlainTextLanguage(language: string) {
  return /^(?:plain|plaintext|text|txt)$/i.test(language.trim())
}

function stripDecorativeHeadingStars(value: string) {
  let inFence = false
  return value.split('\n').map((line) => {
    const trimmed = line.trimStart()
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence
      return line
    }
    return inFence ? line : line.replace(/^((?:#{1,6}[ \t]*)?)\*{4}(?=\s*\d)/, '$1')
  }).join('\n')
}

function isSimpleCodeCandidate(element: HTMLElement) {
  const children = Array.from(element.children)
  if (!children.length) return true
  const tag = element.tagName.toLowerCase()
  if (tag === 'p' || tag === 'span') return children.every((child) => ['br', 'span'].includes(child.tagName.toLowerCase()))
  return children.every((child) => ['br', 'span'].includes(child.tagName.toLowerCase()))
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return inlineText(node.textContent ?? '', node)
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node as HTMLElement
  const content = () => Array.from(element.childNodes).map(inline).join('')
  switch (element.tagName.toLowerCase()) {
    case 'br': return '\n\n'
    case 'strong':
    case 'b': return `**${content().trim()}**`
    case 'em':
    case 'i': return `*${content().trim()}*`
    case 's':
    case 'del': return `~~${content().trim()}~~`
    case 'code': return `\`${(element.textContent ?? '').replace(/`/g, '\\`')}\``
    case 'kbd': return `\`${(element.textContent ?? '').replace(/`/g, '\\`')}\``
    case 'a': {
      const href = safeLink(element.getAttribute('href') ?? '')
      const text = content().trim()
      return href && text ? `[${text}](${href})` : text
    }
    case 'img': return imageMarkdown(element)
    case 'picture': return imageMarkdown(element.querySelector('img') as HTMLElement | null)
    case 'video':
    case 'audio':
    case 'iframe':
    case 'mpvoice':
    case 'mpvideosnap': return mediaMarkdown(element)
    case 'input': return element.getAttribute('type')?.toLowerCase() === 'checkbox' ? `[${element.hasAttribute('checked') ? 'x' : ' '}]` : ''
    case 'svg':
    case 'canvas': return ''
    case 'script':
    case 'style':
    case 'noscript': return ''
    default: {
      if (hasStyle(element, /font-weight\s*:\s*(?:bold|[6-9]00)/i)) return `**${content().trim()}**`
      if (hasStyle(element, /font-style\s*:\s*italic/i)) return `*${content().trim()}*`
      if (hasStyle(element, /text-decoration(?:-line)?\s*:\s*[^;]*line-through/i)) return `~~${content().trim()}~~`
      return content()
    }
  }
}

function blockquote(value: string) {
  return value.trim().split('\n').map((line) => `> ${line.trim()}`).join('\n')
}

function renderTable(table: HTMLTableElement) {
  const rows = Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => inline(cell).trim().replace(/\|/g, '\\|').replace(/\n+/g, '<br>')))
  if (!rows.length) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const fill = (row: string[]) => [...row, ...Array.from({ length: width - row.length }, () => '')]
  const header = fill(rows[0])
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map((row) => `| ${fill(row).join(' | ')} |`),
  ].join('\n')
}

function renderList(list: HTMLElement, depth = 0): string {
  const ordered = list.tagName.toLowerCase() === 'ol'
  const start = ordered ? Number(list.getAttribute('start') ?? 1) || 1 : 1
  const items = Array.from(list.children).filter((child): child is HTMLElement => child.tagName.toLowerCase() === 'li')
  return items.map((item, index) => {
    const nested = Array.from(item.children).filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase())) as HTMLElement[]
    const content = Array.from(item.childNodes).filter((child) => !(child.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes((child as HTMLElement).tagName.toLowerCase()))).map((child) => child.nodeType === Node.ELEMENT_NODE ? render(child as HTMLElement) : inline(child)).join('').trim()
    const prefix = ordered ? `${start + index}. ` : '- '
    const indentation = '  '.repeat(depth)
    const nestedMarkdown: string = nested.map((child) => renderList(child, depth + 1)).filter(Boolean).join('\n')
    return `${indentation}${prefix}${content}${nestedMarkdown ? `\n${nestedMarkdown}` : ''}`
  }).join('\n')
}

function classAndId(element: HTMLElement) {
  return `${element.id} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase()
}

function isHidden(element: HTMLElement) {
  return element.hidden || element.getAttribute('aria-hidden') === 'true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)/i.test(element.getAttribute('style') ?? '')
}

function isArticleNoise(element: HTMLElement) {
  if (['script', 'style', 'noscript', 'template', 'nav', 'aside'].includes(element.tagName.toLowerCase())) return true
  return /(?:qr[_-]?code|qrcode|二维码|reward|赞赏|comment|评论|share|分享|like|点赞|collect|收藏|follow|关注|download|下载|login|登录|register|注册|recommend|推荐|sidebar|侧栏|toolbar|工具栏|breadcrumb|面包屑|advert|广告|app[_-]?download|open[_-]?app|fixed[_-]?bottom)/i.test(classAndId(element))
}

function isArticleTitle(element: HTMLElement) {
  return /(?:rich[_-]?media[_-]?title|note[_-]?title|article[_-]?title|(?:^|[\s_-])title(?:$|[\s_-]))/i.test(classAndId(element))
}

function removeClipboardNoise(document: ClipboardDocument) {
  Array.from(document.body.querySelectorAll('*')).forEach((node) => {
    const element = node as HTMLElement
    if (isHidden(element) || isArticleNoise(element)) element.remove()
  })
  return document.body
}

function renderFigure(figure: HTMLElement) {
  const image = figure.querySelector('img') as HTMLElement | null
  const imageSource = imageMarkdown(image)
  const caption = figure.querySelector('figcaption, .img-caption, .img_desc, [class*="caption"]') as HTMLElement | null
  const captionText = caption ? inline(caption).trim() : ''
  if (!imageSource && !captionText) return ''
  return `${imageSource}${captionText ? `\n\n*${captionText}*` : ''}\n\n`
}

function render(node: HTMLElement): string {
  const tag = node.tagName.toLowerCase()
  if (isHidden(node) || isArticleNoise(node)) return ''
  if (isArticleTitle(node)) return `# ${inline(node).trim()}\n\n`
  if (tag === 'table') return `${renderTable(node as HTMLTableElement)}\n\n`
  if (tag === 'ul' || tag === 'ol') return `${renderList(node)}\n\n`
  if (tag === 'figure') return renderFigure(node)
  if (tag === 'pre') {
    const code = node.querySelector('code')
    const language = code?.className.match(/(?:language|lang)-([\w-]+)/i)?.[1] || 'plain'
    const value = codeText(code ?? node)
    if (isPlainTextLanguage(language) && isLikelyProseBlock(value)) return `${value.trim()}\n\n`
    return renderCodeBlock(value, language)
  }
  if (['script', 'style', 'noscript', 'template'].includes(tag)) return ''
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inline(node).trim()}\n\n`
  if (tag === 'blockquote') return `${blockquote(Array.from(node.childNodes).map((child) => child.nodeType === Node.ELEMENT_NODE ? render(child as HTMLElement) : inline(child)).join(''))}\n\n`
  if (tag === 'hr') return '---\n\n'
  const diagramLike = isSimpleCodeCandidate(node) && looksLikeDiagram(codeText(node))
  if (hasCodeStyle(node) || diagramLike) {
    const language = classAndId(node).match(/(?:language|lang)[-_ ]*([\w+#-]+)/i)?.[1] || 'plain'
    const value = codeText(node)
    if (isPlainTextLanguage(language) && isLikelyProseBlock(value)) return `${value.trim()}\n\n`
    return renderCodeBlock(value, language)
  }
  if (tag === 'details') {
    const summary = node.querySelector(':scope > summary') as HTMLElement | null
    const body = Array.from(node.childNodes).filter((child) => child !== summary).map((child) => child.nodeType === Node.ELEMENT_NODE ? render(child as HTMLElement) : inline(child)).join('').trim()
    return `${summary ? `**${inline(summary).trim()}**\n\n` : ''}${body ? `${body}\n\n` : ''}`
  }
  if (tag === 'dt') return `**${inline(node).trim()}**\n\n`
  if (tag === 'dd') return `${inline(node).trim()}\n\n`
  if (['p', 'div', 'section', 'article', 'header', 'footer', 'figure', 'figcaption', 'main'].includes(tag)) return `${Array.from(node.childNodes).map((child) => child.nodeType === Node.ELEMENT_NODE ? render(child as HTMLElement) : inline(child)).join('').trim()}\n\n`
  return inline(node)
}

function normalizeMarkdown(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const result: string[] = []
  let inFence = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^(?:```|~~~)/.test(trimmed)) inFence = !inFence
    if (!inFence && !trimmed && result[result.length - 1] === '') continue
    result.push(line.replace(/[ \t]+$/g, ''))
  }
  return result.join('\n').trim()
}

function hasMarkdownSyntax(value: string) {
  return /(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|[•◦▪]\s|\d+[.)]\s|>\s|```|~~~)|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^\n)]+\)|`[^`\n]+`/m.test(value)
}

function stripAccidentalClipboardIndent(value: string) {
  const lines = value.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').split('\n')
  const contentLines = lines.filter((line) => line.trim())
  if (!contentLines.length || lines.some((line) => /^\s*(?:```|~~~)/.test(line))) return value

  const indentation = contentLines.map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0)
  const commonIndent = Math.min(...indentation)
  const proseLines = contentLines.filter((line) => /[\u3400-\u9fff]/.test(line)).length
  if (commonIndent < 4 || proseLines < Math.ceil(contentLines.length / 2)) return value

  return lines.map((line) => line.slice(Math.min(commonIndent, line.match(/^[ \t]*/)?.[0].length ?? 0))).join('\n')
}

function isArticleSectionHeading(value: string) {
  const heading = value.replace(/^(?:\*\*|__)|(?:\*\*|__)$/g, '').trim()
  const compact = heading.replace(/\s+/g, '')
  return /^[\u3400-\u9fffA-Za-z0-9+&·“”"（）()、\s]{2,16}(?:层|阶段|方向|机制|部分|设计)[：:]\S{4,}/.test(heading)
    || (compact.length >= 10 && /[：:]|(?:收入|玩家|方向|方案|原则|判断|优势|结果|问题|目标|逻辑|盘子|收费站)$/.test(heading))
}

function mergeAdjacentArticleHeadingSpans(value: string) {
  return value.replace(/\*\*([^*\n]+)\*\*(\s*)\*\*([^*\n]+)\*\*/g, (match, first, gap, second) => {
    const combined = `**${first}${gap}${second}**`
    return isArticleSectionHeading(combined) ? combined : match
  })
}

function normalizeArticleSections(value: string) {
  let inFence = false
  const lines = value.split('\n')
  const result: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence
      result.push(line)
      continue
    }
    if (inFence || !trimmed) {
      result.push(line)
      continue
    }

    const candidateLine = mergeAdjacentArticleHeadingSpans(line)
    const strongHeading = Array.from(candidateLine.matchAll(/(?:\*\*|__)([^\n]+?)(?:\*\*|__)/g)).find((match) => match[0].trim() === candidateLine.trim() || isArticleSectionHeading(match[0]))
    if (strongHeading) {
      const before = candidateLine.slice(0, strongHeading.index).trim()
      const heading = strongHeading[0].trim()
      const after = candidateLine.slice(strongHeading.index + strongHeading[0].length).trim()
      if (before) result.push(before, '')
      if (!before && !after) result.push('')
      result.push(heading)
      if (after) result.push('', after)
      if (!before && !after) result.push('')
      continue
    }
    if (isArticleSectionHeading(trimmed)) result.push('', line.trim(), '')
    else result.push(line)
  }
  return normalizeMarkdown(result.join('\n'))
}

function normalizeTimestampedHeadings(value: string) {
  let inFence = false
  return value.split('\n').map((line) => {
    const trimmed = line.trim()
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence
      return line
    }
    if (inFence) return line
    const match = trimmed.match(/^(.+?)\s+(\d{1,2}:\d{2})$/)
    const title = match?.[1]?.trim() ?? ''
    if (!match || !title || title.length > 48 || !/[\u3400-\u9fff]/.test(title) || /[。！？!?]$/.test(title)) return line
    return `**${title} ${match[2]}**`
  }).join('\n')
}

export function formatPastedText(value: string) {
  return normalizeTimestampedHeadings(normalizeArticleSections(stripDecorativeHeadingStars(normalizeMarkdown(stripAccidentalClipboardIndent(value)))))
    .replace(/^([ \t]*)[•◦▪][ \t]+/gm, '$1- ')
    .replace(/^([ \t]*)(\d+)[.)][ \t]+/gm, '$1$2. ')
}

export function suggestPastedMarkdownName(source: string) {
  const heading = source.match(/^\s*#{1,6}\s+(.+)$/m)?.[1]
  const firstBlock = source.split(/\n\s*\n/).find((block) => block.trim()) ?? ''
  const candidate = heading ?? firstBlock
  const firstSentence = candidate.split(/[。！？!?]/)[0] || candidate
  const name = firstSentence
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[\*_~`>#]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  return Array.from(name || '未命名粘贴').slice(0, 32).join('')
}

export function formatClipboardToMarkdown(html: string, text: string) {
  if (text.trim() && hasMarkdownSyntax(text)) return formatPastedText(text)
  if (html.trim() && typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(html, 'text/html') as ClipboardDocument
    const body = removeClipboardNoise(document)
    const source = Array.from(body.childNodes).filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())).map((node) => node.nodeType === Node.ELEMENT_NODE ? render(node as HTMLElement) : inline(node)).join('')
    const markdown = normalizeArticleSections(stripDecorativeHeadingStars(normalizeMarkdown(stripAccidentalClipboardIndent(source))))
    if (markdown) return markdown
  }
  return formatPastedText(text)
}
