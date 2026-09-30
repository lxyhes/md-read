import { describe, expect, it } from 'vitest'
import { orderRecentFolders, pinRecentFolder, rememberRecentFolder, removeRecentFolder } from './recentFolders'

describe('recent folders', () => {
  it('deduplicates a reopened path and keeps its pin state', () => {
    const folders = rememberRecentFolder([{ path: 'E:/notes', pinned: true, openedAt: 1 }], 'e:\\notes', 10)
    expect(folders).toEqual([{ path: 'e:\\notes', pinned: true, openedAt: 10 }])
  })

  it('puts pinned folders before the most recently opened unpinned folders', () => {
    const folders = orderRecentFolders([
      { path: 'E:/recent', pinned: false, openedAt: 30 },
      { path: 'E:/pinned', pinned: true, openedAt: 5 },
    ])
    expect(folders.map((folder) => folder.path)).toEqual(['E:/pinned', 'E:/recent'])
  })

  it('pins and removes a saved folder by normalized path', () => {
    const saved = pinRecentFolder([{ path: 'E:/notes', pinned: false, openedAt: 1 }], 'e:\\notes', true)
    expect(saved[0]?.pinned).toBe(true)
    expect(removeRecentFolder(saved, 'E:/notes')).toEqual([])
  })
})
