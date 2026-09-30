export type EditorFindOptions = { caseSensitive: boolean; wholeWord: boolean; regex: boolean; scope?: { start: number; end: number } }
export type EditorFindMatch = { start: number; end: number; captures: RegExpExecArray }

export function findEditorMatches(value: string, query: string, options: EditorFindOptions) {
  const matches: EditorFindMatch[] = []
  if (!query) return { matches, error: '' }
  try {
    let source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const flags = `gmu${options.caseSensitive ? '' : 'i'}`
    // Validate the user's pattern before adding boundary assertions.
    const originalPattern = new RegExp(source, flags)
    if (options.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
    const pattern = options.wholeWord ? new RegExp(source, flags) : originalPattern
    const start = options.scope?.start ?? 0
    const text = value.slice(start, options.scope?.end ?? value.length)
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text))) {
      const matchStart = start + match.index
      const matchEnd = matchStart + match[0].length
      const outsideWord = options.wholeWord && (
        /[\p{L}\p{N}_]$/u.test(value.slice(Math.max(0, matchStart - 2), matchStart))
        || /^[\p{L}\p{N}_]/u.test(value.slice(matchEnd, matchEnd + 2)))
      if (!outsideWord) matches.push({ start: matchStart, end: matchEnd, captures: match })
      if (matches.length > 10000) return { matches: [], error: '匹配超过 10000 处，请缩小范围或细化关键词' }
      if (!match[0].length) pattern.lastIndex += (text.codePointAt(pattern.lastIndex) ?? 0) > 0xffff ? 2 : 1
    }
    return { matches, error: '' }
  } catch { return { matches: [], error: '正则表达式无效，请检查括号和转义符' } }
}

function expandReplacement(replacement: string, match: RegExpExecArray) {
  return replacement.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g, (token, key: string) => {
    if (key === '$') return '$'
    if (key === '&') return match[0]
    if (key === '`') return match.input.slice(0, match.index)
    if (key === "'") return match.input.slice(match.index + match[0].length)
    if (key.startsWith('<')) return match.groups ? (match.groups[key.slice(1, -1)] ?? '') : token
    const index = Number(key)
    if (index > 0 && index < match.length) return match[index] ?? ''
    if (key.length === 2 && Number(key[0]) > 0 && Number(key[0]) < match.length) return (match[Number(key[0])] ?? '') + key[1]
    return token
  })
}

export function replaceEditorMatches(value: string, matches: EditorFindMatch[], replacement: string, regex: boolean) {
  const pieces: string[] = []
  let cursor = 0
  let delta = 0
  for (const match of matches) {
    const text = regex ? expandReplacement(replacement, match.captures) : replacement
    pieces.push(value.slice(cursor, match.start), text)
    cursor = match.end
    delta += text.length - (match.end - match.start)
  }
  pieces.push(value.slice(cursor))
  return { value: pieces.join(''), delta }
}
