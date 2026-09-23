type ClipboardDocument = Document

function inlineText(value: string) {
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

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return inlineText(node.textContent ?? '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node as HTMLElement
  const content = () => Array.from(element.childNodes).map(inline).join('')
  switch (element.tagName.toLowerCase()) {
    case 'br': return '\n'
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
    const source = (code?.textContent ?? node.textContent ?? '').replace(/\r\n?/g, '\n').replace(/^\n|\n$/g, '')
    if (!source) return ''
    const language = code?.className.match(/(?:language|lang)-([\w-]+)/i)?.[1] ?? ''
    const fence = source.includes('```') ? '~~~' : '```'
    return `${fence}${language}\n${source}\n${fence}\n\n`
  }
  if (['script', 'style', 'noscript', 'template'].includes(tag)) return ''
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inline(node).trim()}\n\n`
  if (tag === 'blockquote') return `${blockquote(Array.from(node.childNodes).map((child) => child.nodeType === Node.ELEMENT_NODE ? render(child as HTMLElement) : inline(child)).join(''))}\n\n`
  if (tag === 'hr') return '---\n\n'
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

export function formatPastedText(value: string) {
  return normalizeMarkdown(value)
    .replace(/^[ \t]*[•◦▪][ \t]+/gm, '- ')
    .replace(/^[ \t]*(\d+)[.)][ \t]+/gm, '$1. ')
}

export function formatClipboardToMarkdown(html: string, text: string) {
  if (html.trim() && typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(html, 'text/html') as ClipboardDocument
    const body = removeClipboardNoise(document)
    const source = Array.from(body.childNodes).filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())).map((node) => node.nodeType === Node.ELEMENT_NODE ? render(node as HTMLElement) : inline(node)).join('')
    const markdown = normalizeMarkdown(source)
    if (markdown) return markdown
  }
  return formatPastedText(text)
}
