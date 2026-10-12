import type { WorkspaceFile } from './fileService'

type CachedFile = { path: string; name: string; documentId: string }
const pathKey = (path: string) => path.replace(/\\/g, '/').toLowerCase()

export function directoryFiles(cached: CachedFile[], disk: WorkspaceFile[] | null): Array<WorkspaceFile & { documentId?: string }> {
  if (disk === null) return cached
  const documents = new Map(cached.map(file => [pathKey(file.path), file.documentId]))
  return disk.map(file => ({ ...file, documentId: documents.get(pathKey(file.path)) }))
}
