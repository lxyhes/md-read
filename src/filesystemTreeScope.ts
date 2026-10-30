export function relativeDocumentTreePath(path: string, currentPath: string): string | null {
  const normalized = path.replace(/\\/g, '/')
  const current = currentPath.replace(/\\/g, '/')
  const separator = current.lastIndexOf('/')
  if (separator < 0) return normalized === current ? normalized : null
  const prefix = current.slice(0, separator + 1)
  return normalized.toLowerCase().startsWith(prefix.toLowerCase()) ? normalized.slice(prefix.length) : null
}

export function parentFilesystemPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  if (normalized === '/') return null
  const separator = normalized.lastIndexOf('/')
  if (separator < 0) return null
  const parent = normalized.slice(0, separator)
  if (!parent) return '/'
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}/`
  return parent === normalized ? null : parent
}
