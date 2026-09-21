type ClipboardDocument = Document

function inlineText(value: string) {
  return value.replace(/\s+/g, ' ')
}

function safeLink(value: string) {
  const url = value.trim()
  return /^(?:https?:|mailto:|\/\/)/i.test(url) || !/^[a-z][a-z\d+.-]*:/i.test(url) ? url : ''
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
    case 'a': {
      const href = safeLink(element.getAttribute('href') ?? '')
      const text = content().trim()
      return href && text ? `[${text}](${href})` : text
    }
    case 'img': {
      const src = safeLink(element.getAttribute('src') ?? '')
      return src ? `![${element.getAttribute('alt') ?? ''}](${src})` : ''
    }
    case 'script':
    case 'style':
    case 'noscript': return ''
    default: return content()
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
  const items = Array.from(list.children).filter((child): child is HTMLElement => child.tagName.toLowerCase() === 'li')
  return items.map((item, index) => {
    const nested = Array.from(item.children).filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase())) as HTMLElement[]
    const content = Array.from(item.childNodes).filter((child) => !(child.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes((child as HTMLElement).tagName.toLowerCase()))).map((child) => child.nodeType === Node.ELEMENT_NODE ? render(child as HTMLElement) : inline(child)).join('').trim()
    const prefix = ordered ? `${index + 1}. ` : '- '
    const indentation = '  '.repeat(depth)
    const nestedMarkdown: string = nested.map((child) => renderList(child, depth + 1)).filter(Boolean).join('\n')
    return `${indentation}${prefix}${content}${nestedMarkdown ? `\n${nestedMarkdown}` : ''}`
  }).join('\n')
}

function render(node: HTMLElement): string {
  const tag = node.tagName.toLowerCase()
  if (tag === 'table') return `${renderTable(node as HTMLTableElement)}\n\n`
  if (tag === 'ul' || tag === 'ol') return `${renderList(node)}\n\n`
  if (tag === 'pre') {
    const code = node.querySelector('code')
    const source = (code?.textContent ?? node.textContent ?? '').replace(/\r\n?/g, '\n').trim()
    if (!source) return ''
    const language = code?.className.match(/(?:language|lang)-([\w-]+)/i)?.[1] ?? ''
    const fence = source.includes('```') ? '~~~' : '```'
    return `${fence}${language}\n${source}\n${fence}\n\n`
  }
  if (['script', 'style', 'noscript', 'template'].includes(tag)) return ''
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inline(node).trim()}\n\n`
  if (tag === 'blockquote') return `${blockquote(Array.from(node.childNodes).map((child) => child.nodeType === Node.ELEMENT_NODE ? render(child as HTMLElement) : inline(child)).join(''))}\n\n`
  if (tag === 'hr') return '---\n\n'
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
    const source = Array.from(document.body.childNodes).filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())).map((node) => node.nodeType === Node.ELEMENT_NODE ? render(node as HTMLElement) : inline(node)).join('')
    const markdown = normalizeMarkdown(source)
    if (markdown) return markdown
  }
  return formatPastedText(text)
}
