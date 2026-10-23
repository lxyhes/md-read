import type { ReaderDocument } from './types'

export function decodeLinkPart(value: string) {
  try { return decodeURIComponent(value) } catch { return value }
}

export function findDocumentHeading(document: ReaderDocument | null, fragment: string) {
  const needle = decodeLinkPart(fragment.replace(/^#/, '')).trim().toLowerCase()
  if (!document || !needle) return null
  return document.headings.find(heading => {
    const slug = heading.text.trim().toLowerCase().replace(/[^\w\u3400-\u9fff -]/g, '').replace(/\s+/g, '-')
    return heading.id.toLowerCase() === needle || slug === needle || heading.text.trim().toLowerCase() === needle
  }) ?? null
}
