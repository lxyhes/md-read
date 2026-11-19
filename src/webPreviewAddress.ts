export function parseWebPreviewAddress(input: string) {
  const value = input.trim()
  if (!value || /\s/.test(value)) return null
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value)
  const isHostWithPort = /^[^:/?#]+:\d+(?:[/?#]|$)/.test(value)
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}`
      : hasScheme && !isHostWithPort ? value : `https://${value}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}
