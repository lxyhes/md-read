export type RecentFolder = {
  path: string
  pinned: boolean
  openedAt: number
}

function pathKey(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function orderRecentFolders(folders: readonly RecentFolder[]): RecentFolder[] {
  return [...folders].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.openedAt - left.openedAt || left.path.localeCompare(right.path, 'zh-CN'))
}

export function rememberRecentFolder(folders: readonly RecentFolder[], path: string, openedAt = Date.now(), limit = 12): RecentFolder[] {
  const existing = folders.find((folder) => pathKey(folder.path) === pathKey(path))
  const next = [{ path, pinned: existing?.pinned ?? false, openedAt }, ...folders.filter((folder) => pathKey(folder.path) !== pathKey(path))]
  return orderRecentFolders(next).slice(0, limit)
}

export function pinRecentFolder(folders: readonly RecentFolder[], path: string, pinned: boolean): RecentFolder[] {
  return orderRecentFolders(folders.map((folder) => pathKey(folder.path) === pathKey(path) ? { ...folder, pinned } : folder))
}

export function removeRecentFolder(folders: readonly RecentFolder[], path: string): RecentFolder[] {
  return folders.filter((folder) => pathKey(folder.path) !== pathKey(path))
}
