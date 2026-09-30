export type FileTreeSortMode = 'name' | 'natural' | 'created' | 'modified' | 'size'

export type SortableFileTreeEntry = {
  name: string
  isDirectory: boolean
  size?: number
  createdAt?: number
  modifiedAt?: number
}

export function sortFileTreeEntries<T extends SortableFileTreeEntry>(entries: readonly T[], mode: FileTreeSortMode, mixFolders: boolean): T[] {
  return [...entries].sort((left, right) => {
    if (!mixFolders && left.isDirectory !== right.isDirectory) return Number(right.isDirectory) - Number(left.isDirectory)
    if (mode === 'natural') return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
    if (mode === 'created' || mode === 'modified') {
      const key = mode === 'created' ? 'createdAt' : 'modifiedAt'
      const difference = (right[key] ?? 0) - (left[key] ?? 0)
      if (difference) return difference
    }
    if (mode === 'size') {
      const difference = (right.size ?? 0) - (left.size ?? 0)
      if (difference) return difference
    }
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}
