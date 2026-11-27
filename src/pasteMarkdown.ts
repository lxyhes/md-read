import { markdownTableLineIndexes } from './markdown/processor'

type ClipboardDocument = Document

export type ClipboardFormat = 'default' | 'baidu-netdisk-ai' | 'wechat-article'

export function isWordClipboardHtml(html: string) {
  return /<meta\b[^>]*\bMicrosoft Word\b|\bxmlns:w\s*=\s*["']urn:schemas-microsoft-com:office:word["']/i.test(html)
    || /\bclass\s*=\s*["']?\s*Mso(?:Normal|ListParagraph\w*|Title|Heading[1-6])\b|\bmso-list\s*:\s*l\d+\s+level\d+/i.test(html)
}

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
  return attributeUrl(element, ['data-markdown-src', 'data-original-src', 'data-original', 'data-actualsrc', 'data-src', 'data-image-src', 'data-lazy-src', 'data-url', 'src'])
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
  const src = attributeUrl(element, ['data-markdown-src', 'src', 'data-src', 'data-url', 'href']) || attributeUrl(element.querySelector('source') as HTMLElement | null, ['data-markdown-src', 'src', 'data-src'])
  if (!src) return ''
  const label = element.tagName.toLowerCase() === 'audio' ? '音频' : '视频'
  const title = element.getAttribute('data-markdown-title')?.trim().replace(/["\r\n]/g, '')
  return `[${label}](${src}${title ? ` "${title}"` : ''})`
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
  if (element.hasAttribute('data-code-block') || /(?:^|\s)code(?:$|\s)|(?:^|[-_\s])(?:code-block|codeblock|highlight|syntax|hljs|monaco|codemirror)(?:$|[-_\s])/i.test(signal)) return true
  const style = element.getAttribute('style') ?? ''
  const background = style.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1] ?? ''
  // A dark webpage is not a code block: structured children must keep their links and lists.
  return isSimpleCodeCandidate(element) && (darkColor(background) || hasStyle(element, /font-family\s*:\s*(?:ui-)?monospace/i)) && codeText(element).split(/\r?\n/).filter((line) => line.trim()).length >= 2
}

function looksLikeDiagram(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 4) return false
  const signalLines = lines.filter((line) => /[↓↑←→↔┌┐└┘├┤┬┴┼│─━═]/.test(line)).length
  return signalLines >= 2 && (lines.some((line) => /[┌┐└┘├┤┬┴┼│─━═]/.test(line)) || signalLines >= 3)
}

function isBold(element: HTMLElement) {
  return /^(?:STRONG|B)$/.test(element.tagName) || hasStyle(element, /font-weight\s*:\s*(?:bold|[6-9]00)/i)
}

function renderCodeBlock(source: string, language = 'plain') {
  const value = source.replace(/\r\n?/g, '\n').replace(/^\n|\n$/g, '')
  if (!value.trim()) return ''
  const fence = value.includes('```') ? '~~~' : '```'
  return `${fence}${language}\n${value}\n${fence}\n\n`
}

export function clipboardCodeCardLanguage(chrome: string, label: string): string {
  const language = label.trim().toLowerCase()
  if (!/^[●•·](?:\s*[●•·]){2}$/.test(chrome.trim())) return ''
  return /^(?:bash|sh|shell|zsh|fish|powershell|ps1|cmd|batch|javascript|js|typescript|ts|python|py|go|rust|java|json|yaml|toml|sql|html|css|xml|diff|text|plain|plaintext)$/.test(language) ? language : ''
}

function restoreWechatCodeCards(source: string) {
  const lines = source.split('\n')
  const result: string[] = []
  let fence = ''
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const marker = line.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ''
    }
    if (!fence && /^[●•·]/.test(line.trim())) {
      const labelIndex = index + (lines[index + 1]?.trim() ? 1 : 2)
      const codeIndex = labelIndex + (lines[labelIndex + 1]?.trim() ? 1 : 2)
      const language = clipboardCodeCardLanguage(line, lines[labelIndex] ?? '')
      const code = lines[codeIndex]?.trim().match(/^(`+)(.+?)\1$/)
      if (language && code && !code[2].startsWith('`') && !code[2].endsWith('`')) {
        result.push(renderCodeBlock(code[2], language).trimEnd())
        index = codeIndex
        continue
      }
      if (language && /^[ \t]{0,3}(?:`{3,}|~{3,})(?:plain|text|plaintext)?\s*$/.test(lines[codeIndex] ?? '')) {
        lines[codeIndex] = lines[codeIndex].replace(/^(\s*[`~]+).*$/, `$1${language}`)
        index = codeIndex - 1
        continue
      }
    }
    result.push(line)
  }
  return result.join('\n')
}

export function readClipboardStep(line: string) {
  const match = line.trim().match(/^(?:(?:\\?\*){2})?([1-9]\d?)[ \t]*(?:\\?\*){2,8}([^*\\\n：:]{1,80}?)(?:\\?\*){0,8}[ \t]*([：:])(?:\\?\*){0,8}[ \t]*(\S[^\n]*)$/)
  if (!match?.[2].trim()) return null
  const [, number, label, colon, description] = match
  return { number: Number(number), content: `**${label.trim()}**${colon} ${description}` }
}

export function clipboardStepsMarkdown(items: NonNullable<ReturnType<typeof readClipboardStep>>[]) {
  return ['> [!STEPS]', '>', ...items.map(({ number, content }) => `> ${number}. ${content}`)].join('\n')
}

function restoreClipboardStepCards(source: string) {
  const lines = source.split('\n')
  const result: string[] = []
  let fence = ''
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const marker = line.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ''
    }
    if (fence || !/^\s*(?:(?:\\?\*){2})?1(?:\D|$)/.test(line)) {
      result.push(line)
      continue
    }
    const items: NonNullable<ReturnType<typeof readClipboardStep>>[] = []
    let next = index
    let end = index
    while (next < lines.length) {
      const badge = lines[next].trim().match(/^(?:(?:\*\*)([1-9]\d?)(?:\*\*)|([1-9]\d?))$/)
      const content = badge ? next + (lines[next + 1]?.trim() ? 1 : 2) : next
      const item = readClipboardStep(`${badge?.[1] ?? badge?.[2] ?? ''}${lines[content] ?? ''}`)
      if (!item || item.number !== items.length + 1) break
      items.push(item)
      end = content
      next = end + (lines[end + 1]?.trim() ? 1 : 2)
    }
    if (items.length < 2) {
      result.push(line)
      continue
    }
    result.push(clipboardStepsMarkdown(items))
    if (lines[end + 1]?.trim()) result.push('')
    index = end
  }
  return result.join('\n')
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
  let fence = ''
  return value.split('\n').map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1].startsWith(fence) && !marker[2].trim()) fence = ''
      return line
    }
    if (fence) return line
    return line
      .replace(/^((?:#{1,6}[ \t]*)?)\*{4}(?=\s*\d)/, '$1')
      .replace(/^( {0,3}(?:#{1,6}[ \t]+)?\*\*[^*\n]+\*\*)[ \t]*\*{4}$/, '$1')
      .replace(/^( {0,3}#{1,6}[ \t]+[^*\n]+?)[ \t]*\*{4}$/, '$1')
  }).join('\n')
}

function isSimpleCodeCandidate(element: HTMLElement) {
  const children = Array.from(element.children)
  if (!children.length) return true
  const tag = element.tagName.toLowerCase()
  if (tag === 'p' || tag === 'span') return children.every((child) => ['br', 'span'].includes(child.tagName.toLowerCase()))
  return children.every((child) => ['br', 'span'].includes(child.tagName.toLowerCase()))
}

function inline(node: Node, inheritedBold = false): string {
  if (node.nodeType === Node.TEXT_NODE) return inlineText(node.textContent ?? '', node)
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node as HTMLElement
  const bold = isBold(element)
  const content = () => Array.from(element.childNodes).map((child) => inline(child, inheritedBold || bold)).join('')
  const boldContent = () => {
    const text = content().trim()
    if (!text || inheritedBold) return text
    return text.split(/(\n{2,})/).map((part) => part.trim() ? `**${part.trim()}**` : part).join('')
  }
  switch (element.tagName.toLowerCase()) {
    case 'br': return '\n\n'
    case 'strong':
    case 'b': return boldContent()
    case 'em':
    case 'i': return `*${content().trim()}*`
    case 's':
    case 'del': return `~~${content().trim()}~~`
    case 'mark': return `==${content().trim()}==`
    case 'sub': return `~${content().trim()}~`
    case 'sup': return `^${content().trim()}^`
    case 'code': return `\`${(element.textContent ?? '').replace(/`/g, '\\`')}\``
    case 'kbd': return `\`${(element.textContent ?? '').replace(/`/g, '\\`')}\``
    case 'a': {
      const href = safeLink(element.getAttribute('href') ?? '')
      const text = content().trim()
      return href && text ? (isClipboardImageLink(text, href) ? `![${text}](${href})` : `[${text}](${href})`) : text
    }
    case 'img': return imageMarkdown(element)
    case 'picture': return imageMarkdown(element.querySelector('img') as HTMLElement | null)
    case 'video':
    case 'audio':
    case 'iframe':
    case 'mpvoice':
    case 'mpvideosnap': return mediaMarkdown(element)
    case 'input': return element.getAttribute('type')?.toLowerCase() === 'checkbox' ? `[${element.hasAttribute('checked') ? 'x' : ' '}] ` : ''
    case 'svg':
    case 'canvas': return ''
    case 'script':
    case 'style':
    case 'noscript': return ''
    default: {
      if (bold) return boldContent()
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

function renderList(list: HTMLElement, indentation = ''): string {
  const ordered = list.tagName.toLowerCase() === 'ol'
  const start = ordered ? Number(list.getAttribute('start') ?? 1) || 1 : 1
  const items = Array.from(list.children).filter((child): child is HTMLElement => child.tagName.toLowerCase() === 'li')
  return items.map((item, index) => {
    const nested = Array.from(item.children).filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase())) as HTMLElement[]
    const content = Array.from(item.childNodes).filter((child) => !(child.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes((child as HTMLElement).tagName.toLowerCase()))).map((child) => child.nodeType === Node.ELEMENT_NODE ? render(child as HTMLElement) : inline(child)).join('').trim()
    const prefix = ordered ? `${start + index}. ` : '- '
    const continuation = indentation + ' '.repeat(prefix.length)
    const nestedMarkdown: string = nested.map((child) => renderList(child, continuation)).filter(Boolean).join('\n')
    const indentedContent = content.replace(/\n/g, `\n${continuation}`)
    return `${indentation}${prefix}${indentedContent}${nestedMarkdown ? `\n${nestedMarkdown}` : ''}`
  }).join('\n')
}

function prepareWordClipboard(body: HTMLElement) {
  const document = body.ownerDocument
  for (const paragraph of body.querySelectorAll<HTMLElement>('p')) {
    const style = paragraph.getAttribute('style') ?? ''
    const outline = style.match(/\bmso-outline-level\s*:\s*([1-6])\b/i)?.[1]
    const heading = outline ?? paragraph.className.match(/\bMsoHeading([1-6])\b/i)?.[1]
      ?? (paragraph.classList.contains('MsoTitle') ? '1' : '')
    if (!heading) continue
    const element = document.createElement(`h${heading}`)
    element.append(...paragraph.childNodes)
    paragraph.replaceWith(element)
  }

  for (const parent of [body, ...body.querySelectorAll<HTMLElement>('div, section, td, th')]) {
    const levels: { id: string; level: number; list: HTMLElement; item: HTMLElement; next: number }[] = []
    for (const paragraph of Array.from(parent.children)) {
      const match = paragraph.matches('p') && paragraph.getAttribute('style')?.match(/\bmso-list\s*:\s*(l\d+)\s+level(\d+)(?:\s+(lfo\d+))?/i)
      const marker = match && paragraph.querySelector('[style*="mso-list" i][style*="Ignore" i]')
      const label = marker ? marker.textContent?.trim() ?? '' : ''
      const number = label.match(/^(\d{1,9})[.)、]$/)?.[1]
      const tag = number ? 'ol' : 'ul'
      if (!match || !marker || (!number && !/^[•◦▪▫●○■□·§o\uf000-\uf0ff]$/.test(label))) {
        levels.length = 0
        continue
      }

      const id = `${match[1]}:${match[3] ?? ''}`
      const level = Number(match[2])
      while (levels.length && levels[levels.length - 1].level > level) levels.pop()
      let current = levels[levels.length - 1]
      const nested = current && current.level < level
      if (current && !nested && (current.id !== id || current.list.localName !== tag || (number && current.next !== Number(number)))) {
        levels.pop()
        current = levels[levels.length - 1]
      }
      const item = document.createElement('li')
      if (!current || current.level !== level) {
        const list = document.createElement(tag)
        if (number) list.setAttribute('start', number)
        if (current) current.item.append(list)
        else paragraph.before(list)
        current = { id, level, list, item, next: 0 }
        levels.push(current)
      }
      marker.remove()
      item.append(...paragraph.childNodes)
      current.list.append(item)
      current.item = item
      current.next = Number(number) + 1
      paragraph.remove()
    }
  }

  for (const paragraph of body.querySelectorAll('td > p + p, th > p + p')) {
    paragraph.before(document.createElement('br'))
  }
  for (const parent of body.querySelectorAll('div, section, td, th')) {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE || child.textContent?.trim()) continue
      const blockTags = 'p, h1, h2, h3, h4, h5, h6, ul, ol, table, div, section, br'
      if ((child.previousSibling as Element | null)?.matches?.(blockTags)
        || (child.nextSibling as Element | null)?.matches?.(blockTags)) child.remove()
    }
  }
}

function classAndId(element: HTMLElement) {
  return `${element.id} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase()
}

function isHidden(element: HTMLElement) {
  return element.hidden || element.getAttribute('aria-hidden') === 'true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?)\s*(?:!important\s*)?(?:;|$)/i.test(element.getAttribute('style') ?? '')
}

const clipboardCalloutKinds = /^(?:note|tip|important|warning|caution|info|success|failure|danger|bug|example|quote)$/i

function clipboardCalloutKind(element: HTMLElement) {
  const classNames = [...element.classList]
  const explicit = [element.dataset.callout, element.dataset.admonition, ...classNames.map((name) =>
    name.match(/^(?:callout|admonition|alert)-([a-z]+)$/i)?.[1]
      ?? name.match(/^([a-z]+)-(?:callout|admonition|alert)$/i)?.[1]
      ?? (classNames.includes('admonition') ? name : undefined))]
  const kind = explicit.find((value) => value && clipboardCalloutKinds.test(value))
  if (kind) return kind.toUpperCase()

  const { style } = element
  const background = style.getPropertyValue('background-color')
  if (!background || /^(?:transparent|white|#fff(?:fff)?|rgba\([^)]*[,/]\s*0(?:\.0+)?\s*\))$/i.test(background)) return ''
  const border = style.getPropertyValue('border-left') || style.getPropertyValue('border-inline-start')
  const opposite = style.getPropertyValue('border-right') || style.getPropertyValue('border-inline-end')
  if (!border || border === opposite || /^(?:0(?:px)?\b|none\b)/i.test(border)) return ''
  const color = style.getPropertyValue('border-left-color') || style.getPropertyValue('border-inline-start-color') || border
  const hex = color.match(/#([\da-f]{6}|[\da-f]{3})\b/i)?.[1]
  const rgb = hex
    ? (hex.length === 3 ? hex.replace(/./g, '$&$&') : hex).match(/../g)?.map((pair) => Number.parseInt(pair, 16))
    : color.match(/rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/i)?.slice(1).map(Number)
  if (!rgb) return ''
  const [red, green, blue] = rgb
  const max = Math.max(red, green, blue)
  const range = max - Math.min(red, green, blue)
  if (range < 24) return ''
  const sector = max === red ? (green - blue) / range : max === green ? 2 + (blue - red) / range : 4 + (red - green) / range
  const hue = (sector * 60 + 360) % 360
  if (hue < 12 || hue >= 345) return 'CAUTION'
  if (hue < 65) return 'WARNING'
  if (hue < 165) return 'TIP'
  if (hue < 250) return 'INFO'
  return 'IMPORTANT'
}

function isArticleNoise(element: HTMLElement, wechatArticle: boolean) {
  const tag = element.tagName.toLowerCase()
  if (['script', 'style', 'noscript', 'template', 'nav'].includes(tag)) return true
  if (tag === 'aside' && !clipboardCalloutKind(element)) return true
  if (wechatArticle) return element.matches('#js_pc_qr_code, #js_sg_bar, #js_tags, #js_cmt_area, #js_bottom_ad_area, #js_reward_area, #js_share_tool, .rich_media_tool')
  return /(?:qr[_-]?code|qrcode|二维码|reward|赞赏|comment|评论|share|分享|like|点赞|collect|收藏|follow|关注|download|下载|login|登录|register|注册|recommend|推荐|sidebar|侧栏|toolbar|工具栏|breadcrumb|面包屑|advert|广告|app[_-]?download|open[_-]?app|fixed[_-]?bottom)/i.test(classAndId(element))
}

function isArticleTitle(element: HTMLElement) {
  return /(?:rich[_-]?media[_-]?title|note[_-]?title|article[_-]?title|(?:^|[\s_-])title(?:$|[\s_-]))/i.test(classAndId(element))
}

function removeClipboardNoise(document: ClipboardDocument, wechatArticle: boolean) {
  Array.from(document.body.querySelectorAll('*')).forEach((node) => {
    const element = node as HTMLElement
    if (isHidden(element) || isArticleNoise(element, wechatArticle)) element.remove()
  })
  return document.body
}

function renderFigure(figure: HTMLElement) {
  const media = figure.querySelector('video, audio') as HTMLElement | null
  if (media) return `${mediaMarkdown(media)}\n\n`
  const image = figure.querySelector('img') as HTMLElement | null
  const imageSource = imageMarkdown(image)
  const caption = figure.querySelector('figcaption, .img-caption, .img_desc, [class*="caption"]') as HTMLElement | null
  const captionText = caption ? inline(caption).trim().replace(/\s*\n\s*/g, ' ') : ''
  if (!imageSource && !captionText) return ''
  return `${imageSource}${captionText ? `${imageSource ? '\\\n' : ''}*${captionText}*` : ''}\n\n`
}

function prepareClipboardImageCaptions(body: HTMLElement) {
  const captionTags = 'figcaption, .img-caption, .image-caption, .img_desc, [class*="caption"]'
  for (const image of body.querySelectorAll<HTMLElement>('img')) {
    if (image.closest('figure, table') || !imageMarkdown(image)) continue
    let block = image
    while (block.parentElement?.matches('a, p, span, div, section')
      && block.parentElement.children.length === 1 && !block.parentElement.textContent?.trim()) {
      block = block.parentElement
    }
    const caption = block.nextElementSibling as HTMLElement | null
    const text = caption?.textContent?.trim() ?? ''
    if (!caption || !text || text.length > 120 || caption.querySelector('img, table, pre, ul, ol, blockquote')) continue
    const centered = caption.matches('[align="center"]') || hasStyle(caption, /(?:^|;)\s*text-align\s*:\s*center\b/i)
    const captionStyling = caption.matches(captionTags) || caption.querySelector(captionTags)
      || (centered && /^(?:P|DIV|SECTION|SMALL)$/.test(caption.tagName))
    if (!captionStyling) continue
    const figure = body.ownerDocument.createElement('figure')
    const label = body.ownerDocument.createElement('figcaption')
    label.append(...caption.childNodes)
    block.replaceWith(figure)
    figure.append(image, label)
    caption.remove()
  }
}

function render(node: HTMLElement): string {
  const tag = node.tagName.toLowerCase()
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
  if ((hasCodeStyle(node) && !node.querySelector('pre')) || diagramLike) {
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

function repairSplitClipboardSteps(source: string) {
  const lines = source.split('\n')
  let fence = ''
  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index].match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1].startsWith(fence) && !marker[2].trim()) fence = ''
      continue
    }
    if (fence) continue
    const step = lines[index].match(/^([ \t]*)(?:[•◦▪·][ \t]*|(?:[-+*]|(\d+)[.)])[ \t]+)(第[一二三四五六七八九十百零\d]+步[^*：:\n]{0,48}[：:])[ \t]*\*\*$/)
    if (!step) continue
    const next = lines[index + 1] === '' ? index + 2 : index + 1
    const description = lines[next]?.match(/^[ \t]*\*\*(?!\*)(\S.*)$/)?.[1]
    if (!description || description.includes('**')) continue
    const [, indent, number, label] = step
    const prefix = number ? `${number}.` : '-'
    lines.splice(index, next - index + 1, `${indent}${prefix} **${label}** ${description}`)
  }
  return lines.join('\n')
}

function hasMarkdownSyntax(value: string) {
  return /(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|[•◦▪]\s|\d+[.)]\s|>\s|```|~~~)|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^\n)]+\)|`[^`\n]+`/m.test(value)
}

export function isClipboardImageLink(label: string, target: string) {
  const imageLabel = /^(?:image|图片|图像|截图)(?:\s*\d+)?$/i.test(label.trim())
  if (!imageLabel) return false
  const value = target.trim().replace(/^<|>$/g, '')
  return /\.(?:avif|bmp|gif|jiff?|jfif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value) || /(?:^|[./_-])(?:img|image|preview)(?:[./?_-]|$)/i.test(value)
}

export function promoteClipboardImageLinks(value: string) {
  return value.split('\n').map((line) => line.replace(/^(\s*)\[([^\]\n]+)\]\((<[^>\n]+>|[^)\n]+)\)(\s*)$/, (match, indent: string, label: string, target: string, trailing: string) => {
    return isClipboardImageLink(label, target) ? `${indent}![${label}](${target})${trailing}` : match
  })).join('\n')
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
  const tableLines = markdownTableLineIndexes(value)
  const result: string[] = []
  const imageCaptionStart = /^!\[.*\]\(.*\)\\$/
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence
      result.push(line)
      continue
    }
    if (inFence || !trimmed || tableLines.has(index)) {
      result.push(line)
      continue
    }
    if (imageCaptionStart.test(trimmed) || (imageCaptionStart.test(result[result.length - 1] ?? '') && /^\*.+\*$/.test(trimmed))) {
      result.push(line)
      continue
    }

    // Existing Markdown list items already have a hierarchy. Rewriting bold
    // spans inside them as section headings breaks nested lists and links.
    // Explicit headings and quoted blocks also need to keep their line structure.
    if (/^(?:[ \t]{2,}|\s*(?:>|#{1,6}\s+|[-+*]\s+|\d+[.)]\s+))/.test(line)) {
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
  const tableLines = markdownTableLineIndexes(value)
  return value.split('\n').map((line, index) => {
    const trimmed = line.trim()
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence
      return line
    }
    if (inFence || tableLines.has(index) || /^(?:>|#{1,6}\s+)/.test(trimmed)) return line
    const match = trimmed.match(/^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/)
    const title = match?.[1]?.trim() ?? ''
    if (!match || !title || title.length > 48 || !/[\u3400-\u9fff]/.test(title) || /[。！？!?]$/.test(title)) return line
    return `**${title} ${match[2]}**`
  }).join('\n')
}

function clipboardHtmlMatchesPlainText(html: string, text: string) {
  const plain = text.replace(/\s+/g, '').slice(0, 12)
  if (!plain || !/[\u3400-\u9fff]/.test(plain)) return true
  const visible = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#\d+|#x[\da-f]+);/gi, ' ')
    .replace(/\s+/g, '')
  return visible.includes(plain)
}

function richClipboardListLabel(value: string) {
  const text = value.trim()
  if (!text || text.length > 24 || !/[\u3400-\u9fff]/.test(text) || /[。！？!?；;，,：:、]$/.test(text)) return null
  return text
}

function richClipboardInlineListItem(value: string) {
  const match = value.trim().match(/^(第[一二三四五六七八九十]+标签客群|陷阱[一二三四五六七八九十]+|第[一二三四五六七八九十]+步)([：:])(.+)$/)
  if (match && /^第[一二三四五六七八九十]+步$/.test(match[1])) return `- **${value.trim()}**`
  return match ? `- **${match[1]}${match[2]}** ${match[3]}` : null
}

type RichClipboardListGroup = 'audience' | 'scenario' | 'steps' | 'trap' | 'supply' | null

function richClipboardListGroup(value: string): RichClipboardListGroup {
  if (/主力客群定义与层级/.test(value)) return 'audience'
  if (/适用场景/.test(value)) return 'scenario'
  if (/精选联盟选品四步法/.test(value)) return 'steps'
  if (/供应链获取路径/.test(value)) return 'supply'
  if (/^陷阱[一二三四五六七八九十]+[：:]/.test(value)) return 'trap'
  return null
}

function richClipboardNestedListItem(value: string, group: RichClipboardListGroup) {
  const inlineItem = richClipboardInlineListItem(value)
  if (inlineItem && ((group === 'audience' && /^第一|^第二|^第三/.test(value)) || (group === 'steps' && /^第[一二三四]步/.test(value)))) {
    return `  ${inlineItem}`
  }
  if (group === 'scenario' && /^当(?:同一产品|产品)/.test(value)) return `  - ${value}`
  if (group === 'trap' && /^(?:判定标准|后果|警惕信号|根本原因|结论)[：:]/.test(value)) return `  - ${value}`
  if (group === 'supply' && /^(?:无联系方式|线下资源优先)[：:]/.test(value)) return `  - ${value}`
  return null
}

function normalizeRichClipboardText(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const timestampCount = lines.filter((line) => /^.+?\s+\d{1,2}:\d{2}(?::\d{2})?$/.test(line.trim())).length
  if (timestampCount < 2) return value

  const result: string[] = []
  let listOpen = false
  let continuationIndent = '  '
  let listGroup: RichClipboardListGroup = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      result.push(line)
      continue
    }
    const timestamp = trimmed.match(/^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/)
    if (timestamp) {
      listOpen = false
      listGroup = null
      result.push(`### ${timestamp[1].trim()} ${timestamp[2]}`, '')
      continue
    }
    const nestedItem = richClipboardNestedListItem(trimmed, listGroup)
    if (nestedItem) {
      continuationIndent = '    '
      result.push(nestedItem)
      continue
    }
    const inlineItem = richClipboardInlineListItem(trimmed)
    if (inlineItem) {
      listOpen = true
      continuationIndent = '  '
      listGroup = richClipboardListGroup(trimmed)
      result.push(inlineItem)
      continue
    }
    const label = richClipboardListLabel(trimmed)
    if (label) {
      listOpen = true
      continuationIndent = '  '
      listGroup = richClipboardListGroup(label)
      result.push(`- **${label}**`)
      continue
    }
    result.push(listOpen ? `${continuationIndent}${trimmed}` : line)
  }
  return result.join('\n')
}

function baiduNetdiskAiSection(value: string) {
  const label = value.trim().replace(/[：:]$/, '').replace(/\s+/g, '')
  if (label === '摘要') return '摘要'
  if (label === '分段总结') return '分段总结'
  if (label === '重点') return '重点'
  return null
}

function baiduNetdiskAiTimestamp(value: string) {
  return value.trim().match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?$/)?.[1] ?? ''
}

function normalizeBaiduNetdiskAiText(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const sectionLabels = lines.map(baiduNetdiskAiSection).filter((label) => Boolean(label))
  const timestampCount = lines.filter((line) => Boolean(baiduNetdiskAiTimestamp(line))).length
  if (!sectionLabels.includes('分段总结') || timestampCount < 2 || (!sectionLabels.includes('摘要') && !sectionLabels.includes('重点'))) return null

  const result: string[] = []
  let section: string | null = null
  let pendingTimestamp = ''
  let pendingTitle = ''
  let convertedHeadings = 0
  const appendHeading = (title: string, timestamp: string) => {
    const cleanTitle = title.trim()
    if (!cleanTitle || !timestamp) return
    if (result.at(-1)?.trim()) result.push('')
    result.push(`### ${cleanTitle} ${timestamp}`, '')
    convertedHeadings += 1
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const label = baiduNetdiskAiSection(trimmed)
    if (label) {
      pendingTimestamp = ''
      pendingTitle = ''
      if (result.at(-1)?.trim()) result.push('')
      result.push(`## ${label}`, '')
      section = label
      continue
    }
    if (!section) {
      result.push(line)
      continue
    }
    if (!trimmed) {
      if (result.at(-1)?.trim()) result.push('')
      continue
    }

    const timestamp = baiduNetdiskAiTimestamp(trimmed)
    if (section === '摘要') {
      result.push(trimmed)
      continue
    }
    if (section === '分段总结') {
      const inlineHeading = trimmed.match(/^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/)
      if (inlineHeading) {
        appendHeading(inlineHeading[1], inlineHeading[2])
        pendingTimestamp = ''
        continue
      }
      if (timestamp) {
        pendingTimestamp = timestamp
        continue
      }
      if (pendingTimestamp) {
        appendHeading(trimmed, pendingTimestamp)
        pendingTimestamp = ''
        continue
      }
      result.push(line)
      continue
    }

    const inlineHeading = trimmed.match(/^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/)
    if (inlineHeading) {
      appendHeading(inlineHeading[1], inlineHeading[2])
      pendingTitle = ''
      continue
    }
    if (timestamp) {
      if (pendingTitle) appendHeading(pendingTitle, timestamp)
      else pendingTimestamp = timestamp
      pendingTitle = ''
      continue
    }
    if (pendingTimestamp) {
      appendHeading(trimmed, pendingTimestamp)
      pendingTimestamp = ''
      continue
    }
    pendingTitle = trimmed
  }

  if (pendingTitle) result.push(pendingTitle)
  if (pendingTimestamp) result.push(pendingTimestamp)
  return convertedHeadings >= 2 ? result.join('\n') : null
}

function insertClipboardImages(source: string, html: string) {
  if (!html.trim() || typeof DOMParser === 'undefined') return source
  const document = new DOMParser().parseFromString(html, 'text/html')
  const images = new Map<string, string>()
  const preferredUrls = new Map<string, string>()
  for (const image of document.body.querySelectorAll('img')) {
    const markdown = imageMarkdown(image)
    if (!markdown) continue
    const preferred = imageUrl(image)
    images.set(preferred, images.get(preferred) ?? markdown)
    for (const attribute of ['src', 'data-src', 'data-lazy-src']) {
      const url = image.getAttribute(attribute)?.trim()
      if (!url) continue
      const previous = preferredUrls.get(url)
      preferredUrls.set(url, previous === undefined || previous === preferred ? preferred : '')
    }
  }
  if (!images.size) return source
  const imageUrls = new Set<string>()
  let fence = ''
  source = source.split('\n').map((line) => {
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
    if (marker && !fence) { fence = marker[1]; return line }
    if (fence) {
      if (marker?.[1].startsWith(fence) && !marker[2].trim()) fence = ''
      return line
    }
    return line.replace(/(!\[(?:\\.|[^\\\]\n])*\]\()(<[^>\n]+>|[^)\n]+)(\))/g, (match, before: string, wrapped: string, after: string) => {
      const url = wrapped.replace(/^<|>$/g, '').trim().replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1')
      const preferred = (line.trim() === match && preferredUrls.get(url)) || url
      imageUrls.add(preferred)
      return preferred === url ? match : `${before}<${preferred}>${after}`
    })
  }).join('\n')
  const missingImages = [...images].filter(([url]) => !imageUrls.has(url)).map(([, markdown]) => markdown)
  if (!missingImages.length) return source
  const blocks = source.split(/\n\s*\n/)
  const insertionIndex = blocks[0]?.trim() ? 1 : 0
  blocks.splice(insertionIndex, 0, missingImages.join('\n\n'))
  return blocks.join('\n\n')
}

export function formatPastedText(value: string) {
  const source = repairSplitClipboardSteps(normalizeMarkdown(stripAccidentalClipboardIndent(value)))
  return normalizeTimestampedHeadings(normalizeArticleSections(stripDecorativeHeadingStars(source)))
    .replace(/^([ \t]*)[•◦▪][ \t]+/gm, '$1- ')
    .replace(/^([ \t]*)(\d+)[.)][ \t]+/gm, '$1$2. ')
}

export function normalizeMixedOrderedListSource(value: string): { source: string; converted: number } {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const result: string[] = []
  let converted = 0
  let index = 0
  while (index < lines.length) {
    const first = matchMixedOrderedListLine(lines[index] ?? '')
    if (!first || first.kind !== 'mixed') {
      result.push(lines[index] ?? '')
      index += 1
      continue
    }
    const group: Array<{ indent: string; number: number; content: string; kind: 'mixed' | 'ordered' }> = []
    let cursor = index
    while (cursor < lines.length) {
      const match = matchMixedOrderedListLine(lines[cursor] ?? '')
      if (match && match.indent === first.indent) {
        group.push(match)
        cursor += 1
        continue
      }
      if (lines[cursor]?.trim() === '' && group.length) {
        cursor += 1
        continue
      }
      break
    }
    if (group.length < 2 || !group.some((line) => line.kind === 'mixed')) {
      result.push(...lines.slice(index, cursor))
    } else {
      const start = group[0]?.number || 1
      let itemIndex = 0
      result.push(...lines.slice(index, cursor).map((line) => {
        const match = matchMixedOrderedListLine(line)
        if (!match || match.indent !== first.indent) return line
        const normalized = `${match.indent}${start + itemIndex}. ${match.content}`
        itemIndex += 1
        return normalized
      }))
      converted += group.length
    }
    index = cursor
  }
  return { source: result.join('\n'), converted }
}

function matchMixedOrderedListLine(line: string): { indent: string; number: number; content: string; kind: 'mixed' | 'ordered' } | null {
  const mixed = line.match(/^([ \t]*)[-+*][ \t]+(\d+)[.)][ \t]+(.+)$/)
  if (mixed) return { indent: mixed[1], number: Number(mixed[2]), content: mixed[3], kind: 'mixed' }
  const ordered = line.match(/^([ \t]*)(\d+)[.)][ \t]+(.+)$/)
  if (ordered) return { indent: ordered[1], number: Number(ordered[2]), content: ordered[3], kind: 'ordered' }
  return null
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

export function formatClipboardImage(dataUrl: string, alt = '剪贴板图片') {
  const value = dataUrl.trim()
  return value ? `![${alt}](${value})` : ''
}

function prepareWechatCodeCards(body: HTMLElement) {
  for (const code of body.querySelectorAll<HTMLElement>('pre, code')) {
    if (!body.contains(code) || (code.tagName === 'CODE' && code.closest('pre'))) continue
    let block = code
    while (!block.previousElementSibling && block.parentElement && block.parentElement !== body && block.parentElement.textContent?.trim() === code.textContent?.trim()) {
      block = block.parentElement
    }
    const header = block.previousElementSibling
    if (!header) continue
    const label = header.textContent?.trim() ?? ''
    const combined = label.match(/^([●•·](?:\s*[●•·]){2})\s*(.+)$/)
    const chrome = combined ? header : header.previousElementSibling
    const language = clipboardCodeCardLanguage(combined?.[1] ?? chrome?.textContent ?? '', combined?.[2] ?? label)
    const value = codeText(code)
    if (!language || !value.trim()) continue
    const pre = body.ownerDocument.createElement('pre')
    const content = body.ownerDocument.createElement('code')
    content.className = `language-${language}`
    content.textContent = value
    pre.append(content)
    block.replaceWith(pre)
    header.remove()
    chrome?.remove()
  }
}

function mergeWechatNumberedHeadings(body: HTMLElement) {
  const headingTags = 'h2, h3, h4, h5, h6'
  const blockTags = `p, section, div, span, ${headingTags}`
  for (const number of body.querySelectorAll<HTMLElement>(blockTags)) {
    if (!body.contains(number) || number.closest('pre, code, table, ul, ol')) continue
    const prefix = number.textContent?.trim() ?? ''
    if (!/^\d{2}$/.test(prefix)) continue

    const numberParts = [number, ...number.querySelectorAll<HTMLElement>('span, strong, b, em, i')]
    const large = numberParts.some((element) =>
      Number(element.getAttribute('style')?.match(/(?:^|;)\s*font-size\s*:\s*(\d+(?:\.\d+)?)px\b/i)?.[1]) >= 20)
    if (!large && !number.matches(headingTags)) continue

    let badge = number
    while (badge.parentElement?.matches(blockTags) && badge.parentElement.textContent?.trim() === prefix) {
      badge = badge.parentElement
    }
    const title = badge.nextElementSibling as HTMLElement | null
    if (!title?.matches(`${blockTags}, strong, b`)) continue
    let sibling = badge.nextSibling
    while (sibling && sibling.nodeType !== Node.ELEMENT_NODE && (sibling.nodeType !== Node.TEXT_NODE || !sibling.textContent?.trim())) {
      sibling = sibling.nextSibling
    }
    if (sibling !== title) continue
    const label = title.textContent?.trim().replace(/\s+/g, ' ') ?? ''
    if (!/\p{L}/u.test(label) || label.length > 80 || /[。！？；]$/.test(label)) continue
    if (title.querySelector('img, video, a, br, pre, code, table, ul, ol, blockquote, hr')) continue
    const titleParts = [title, ...title.querySelectorAll<HTMLElement>(`strong, b, ${blockTags}`)]
    const styledTitle = titleParts.some((element) =>
      element.textContent?.trim().replace(/\s+/g, ' ') === label && (isBold(element) || element.matches(headingTags)))
    const group = badge.parentElement
    const styledGroup = group?.children.length === 2 && (isBold(group) || hasStyle(group, /display\s*:\s*(?:inline-)?flex\b/i))
    if (!styledTitle && !styledGroup) continue

    const semantic = badge.matches(headingTags) ? badge : titleParts.find((element) => element.matches(headingTags))
    const heading = body.ownerDocument.createElement(semantic?.tagName.toLowerCase() ?? 'h2')
    heading.textContent = `${prefix} ${label}`
    badge.replaceWith(heading)
    title.remove()
  }
}

function prepareClipboardCallouts(body: HTMLElement) {
  const containers = 'section, div, aside, blockquote'
  for (const box of body.querySelectorAll<HTMLElement>(containers)) {
    if (!body.contains(box)) continue
    const kind = clipboardCalloutKind(box)
    if (!kind) continue
    let content = box
    while (content.children.length === 1 && content.firstElementChild?.matches(containers)
      && content.firstElementChild.textContent?.trim() === content.textContent?.trim()) {
      content = content.firstElementChild as HTMLElement
    }
    const title = content.firstElementChild
    const label = title?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
    if (!title || !label || label.length > 48 || title.querySelector('img, video, pre, table, ul, ol, blockquote')) continue
    const nodes = Array.from(content.childNodes)
    const beforeTitle = nodes.slice(0, nodes.indexOf(title))
    const details = nodes.slice(nodes.indexOf(title) + 1)
    if (beforeTitle.some((node) => node.textContent?.trim()) || !details.some((node) => node.textContent?.trim())) continue
    if (/^\[!/.test(label)) continue

    const quote = body.ownerDocument.createElement('blockquote')
    const marker = body.ownerDocument.createElement('p')
    marker.textContent = `[!${kind}] ${label}`
    quote.append(marker, ...details)
    box.replaceWith(quote)
  }
}

function prepareWechatArticle(body: HTMLElement) {
  const article = body.querySelector('#js_content, .rich_media_content')
  if (article) {
    const header = Array.from(body.querySelectorAll('#activity-name, .rich_media_title, #meta_content'))
      .filter((element) => !article.contains(element) && !element.contains(article))
    body.replaceChildren(...header, article)
  }

  prepareWechatCodeCards(body)
  mergeWechatNumberedHeadings(body)

  for (const block of body.querySelectorAll<HTMLElement>('p, section, div')) {
    const label = block.textContent?.trim() ?? ''
    if (!label || label.length > 48 || /^\d{2}$/.test(label) || /[。！？；]$/.test(label)) continue
    if (block.querySelector('p, section, div, h1, h2, h3, h4, h5, h6, a, img, br, code, pre, table, ul, ol')) continue
    const fullLabel = [block, ...block.querySelectorAll<HTMLElement>('span, strong, b')].filter((element) => element.textContent?.trim() === label)
    const substep = /^[①-⑳]/.test(label)
    const step = /^(?:第[一二三四五六七八九十\d]+步[：:]|\d{1,2}[.、]\s*)/.test(label)
    const numbered = substep || step || /^(?:\d{2}\s|[一二三四五六七八九十]+、)/.test(label)
    const large = fullLabel.some((element) => Number(element.getAttribute('style')?.match(/(?:^|;)\s*font-size\s*:\s*(\d+(?:\.\d+)?)px\b/i)?.[1]) >= (numbered ? 18 : 20))
    const bold = fullLabel.some(isBold) || (block.children.length > 0 && Array.from(block.childNodes).every((node) =>
      node.nodeType === Node.ELEMENT_NODE ? isBold(node as HTMLElement) : !node.textContent?.trim()))
    if (!large || !bold) continue
    const heading = body.ownerDocument.createElement(substep ? 'h4' : step ? 'h3' : 'h2')
    heading.textContent = label
    block.replaceWith(heading)
  }

  for (const image of body.querySelectorAll<HTMLElement>('img')) {
    const url = imageUrl(image)
    if (url.startsWith('//')) image.setAttribute('data-markdown-src', `https:${url}`)
    if (!url || isTrackingImage(image) || image.closest('figure, table')) continue
    const link = image.closest('a')
    const target = link && !link.textContent?.trim() ? link : image
    target.before(body.ownerDocument.createElement('br'))
    target.after(body.ownerDocument.createElement('br'))
  }

  const blockTags = 'br, p, section, div, article, main, figure, h1, h2, h3, h4, h5, h6, blockquote, pre, table, ul, ol'
  for (const parent of [body, ...body.querySelectorAll('section, div, article, main')]) {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE || child.textContent?.trim()) continue
      const previous = child.previousSibling
      if (previous?.nodeType === Node.ELEMENT_NODE && (previous as Element).matches(blockTags)) child.remove()
    }
  }

  for (const element of body.querySelectorAll<HTMLElement>('strong, b, [style*="font-weight"]')) {
    if (!isBold(element)) continue
    let ancestor = element.parentElement
    while (ancestor && ancestor !== body && !isBold(ancestor)) ancestor = ancestor.parentElement
    if (!ancestor || ancestor === body) continue
    if (/^(?:STRONG|B)$/.test(element.tagName)) element.replaceWith(...element.childNodes)
    else element.style.removeProperty('font-weight')
  }

  const textNodes = body.ownerDocument.createTreeWalker(body, 4)
  for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
    if (!node.parentElement?.closest('code, pre')) node.textContent = (node.textContent ?? '').replace(/[\\*_\x60[\]]/g, '\\$&')
  }
}

export function htmlToMarkdown(html: string) {
  return convertClipboardHtml(html)
}

function convertClipboardHtml(html: string, wechatArticle = false, plainText = '', word = !wechatArticle && isWordClipboardHtml(html)) {
  if (!html.trim() || typeof DOMParser === 'undefined') return ''
  if (word) {
    html = html.replace(/<!--\[if\s+!supportLists\]\s*>([\s\S]*?)<!\[endif\]\s*-->/gi, '$1')
  }
  const document = new DOMParser().parseFromString(html, 'text/html') as ClipboardDocument
  if (wechatArticle) {
    const comparable = (value: string) => value.normalize('NFKC').replace(/[\s\u200b-\u200d\uFEFF]/g, '')
    const plainPrefix = comparable(plainText).slice(0, 24)
    if (plainPrefix && !comparable(document.body.textContent ?? '').includes(plainPrefix)) return ''
  }
  const body = removeClipboardNoise(document, wechatArticle)
  if (word) {
    const comparable = (value: string) => value.replace(/[\s\u200b\ufeff]/g, '')
    const firstLine = plainText.split(/\r\n?|\n/).find((line) => line.trim())?.trim() ?? ''
    const visible = comparable(body.textContent ?? '')
    const label = firstLine.replace(/^(?:\d+[.)、]|[•◦▪▫●○■□·\uf000-\uf0ff])\s+/, '')
    if (firstLine && ![firstLine, label].some((line) => visible.includes(comparable(line).slice(0, 24)))) return ''
    prepareWordClipboard(body)
  }
  prepareClipboardImageCaptions(body)
  if (wechatArticle) prepareWechatArticle(body)
  prepareClipboardCallouts(body)
  const source = Array.from(body.childNodes).filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())).map((node) => node.nodeType === Node.ELEMENT_NODE ? render(node as HTMLElement) : inline(node)).join('')
  if (word) return stripDecorativeHeadingStars(repairSplitClipboardSteps(normalizeMarkdown(source)))
  const normalized = restoreClipboardStepCards(repairSplitClipboardSteps(normalizeMarkdown(stripAccidentalClipboardIndent(source))))
  return wechatArticle ? restoreWechatCodeCards(normalized) : normalizeArticleSections(stripDecorativeHeadingStars(normalized))
}

export function formatBaiduNetdiskAiToMarkdown(text: string) {
  const normalized = normalizeBaiduNetdiskAiText(promoteClipboardImageLinks(text))
  return normalized ? formatPastedText(normalized.replace(/^([ \t]*)(\d+)[.)](?=\S)/gm, '$1$2. ')) : ''
}

export function formatClipboardToMarkdown(html: string, text: string, format: ClipboardFormat = 'default') {
  const promotedText = promoteClipboardImageLinks(text)
  if (format === 'wechat-article') {
    const article = convertClipboardHtml(html, true, text)
    return article || restoreWechatCodeCards(formatPastedText(restoreClipboardStepCards(normalizeMarkdown(promotedText))))
  }
  if (format === 'baidu-netdisk-ai') {
    const baiduMarkdown = formatBaiduNetdiskAiToMarkdown(promotedText)
    if (baiduMarkdown) return insertClipboardImages(baiduMarkdown, html)
  }
  if (isWordClipboardHtml(html)) return convertClipboardHtml(html, false, text, true) || formatPastedText(promotedText)
  const clipboardMarkdown = clipboardHtmlMatchesPlainText(html, promotedText) ? htmlToMarkdown(html) : ''
  if (/^!\[.*\]\(.*\)\\\n\*.+\*$/m.test(clipboardMarkdown)) return insertClipboardImages(clipboardMarkdown, html)
  if (/^> \[!(?:STEPS|NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|FAILURE|DANGER|BUG|EXAMPLE|QUOTE)\](?:[ \t].*)?$/m.test(clipboardMarkdown)) return insertClipboardImages(clipboardMarkdown, html)
  const hasStructuredClipboardContent = /(?:^|\n)[ \t]*(?:#{1,6}[ \t]+|[-+*][ \t]+|\d+[.)][ \t]+)/m.test(clipboardMarkdown)
  const hasExplicitMarkdownStructure = /(?:^|\n)[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]*\[!STEPS\][ \t]*$)|(?:^|\n)[ \t]{2,}(?:[-+*]|\d+[.)])[ \t]+/m.test(promotedText)
  let source = ''
  if (hasExplicitMarkdownStructure) source = formatPastedText(promotedText)
  else if (hasStructuredClipboardContent) source = formatPastedText(clipboardMarkdown)
  else if (promotedText.trim() && hasMarkdownSyntax(promotedText)) source = formatPastedText(promotedText)
  else {
    const normalizedText = normalizeRichClipboardText(promotedText)
    if (normalizedText !== promotedText) source = formatPastedText(normalizedText)
    else source = clipboardMarkdown || formatPastedText(normalizedText)
  }
  return insertClipboardImages(source, html)
}
