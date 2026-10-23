export function relativeDocumentTreePath(path: string, currentPath: string): string | null {
  const normalized = path.replace(/\\/g, '/')
  const current = currentPath.replace(/\\/g, '/')
  const separator = current.lastIndexOf('/')
  if (separator < 0) return normalized === current ? normalized : null
  const prefix = current.slice(0, separator + 1)
  return normalized.toLowerCase().startsWith(prefix.toLowerCase()) ? normalized.slice(prefix.length) : null
}
