import { describe, expect, it } from 'vitest'
import { reconcileFilesystemEntries } from './filesystemTreeRefresh'
import type { FileSystemTreeNode } from './components/FileSystemTree.vue'

const folder = (): FileSystemTreeNode => ({ path: 'C:/notes/sub', name: 'sub', isDirectory: true, expanded: true, loading: false, children: [] })

describe('background directory refresh', () => {
  it('keeps the same array and expanded node when polling finds no changes', () => {
    const node = folder()
    const current = [node]
    const children = node.children
    const next = reconcileFilesystemEntries(current, [{ path: node.path, name: node.name, isDirectory: true }])
    expect(next).toBe(current)
    expect(next[0]).toBe(node)
    expect(next[0]?.expanded).toBe(true)
    expect(next[0]?.children).toBe(children)
  })

  it('adds and removes entries while keeping surviving nodes and updating metadata', () => {
    const node = folder()
    const removed = { ...folder(), path: 'C:/notes/deleted' }
    const next = reconcileFilesystemEntries([removed, node], [
      { path: node.path, name: node.name, isDirectory: true, modifiedAt: 123 },
      { path: 'C:/notes/new.md', name: 'new.md', isDirectory: false },
    ])
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(node)
    expect(node.modifiedAt).toBe(123)
    expect(node.expanded).toBe(true)
    expect(next[1]?.name).toBe('new.md')
    expect(next).not.toContain(removed)
  })

  it('replaces a directory if the same path becomes a file', () => {
    const node = folder()
    const next = reconcileFilesystemEntries([node], [{ path: node.path, name: node.name, isDirectory: false }])
    expect(next[0]).not.toBe(node)
    expect(next[0]?.expanded).toBe(false)
    expect(next[0]?.children).toBeNull()
  })
})
