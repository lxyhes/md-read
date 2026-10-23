import type { FileSystemEntry } from './fileService'
import type { FileSystemTreeNode } from './components/FileSystemTree.vue'

export function reconcileFilesystemEntries(current: FileSystemTreeNode[], entries: FileSystemEntry[]): FileSystemTreeNode[] {
  const previous = new Map(current.map(node => [node.path, node]))
  const next = entries.map(entry => {
    const node = previous.get(entry.path)
    if (node && node.isDirectory === entry.isDirectory) {
      Object.assign(node, entry, { size: entry.size, createdAt: entry.createdAt, modifiedAt: entry.modifiedAt })
      return node
    }
    return { ...entry, expanded: false, loading: false, children: null }
  })
  return next.length === current.length && next.every((node, index) => node === current[index]) ? current : next
}
