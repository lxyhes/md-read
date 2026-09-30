import { describe, expect, it } from 'vitest'
import { sortFileTreeEntries } from './fileTreeSort'

const entries = [
  { name: 'z-folder', isDirectory: true, createdAt: 10, size: 0 },
  { name: 'a.md', isDirectory: false, createdAt: 40, size: 5 },
  { name: 'b-folder', isDirectory: true, createdAt: 20, size: 0 },
  { name: 'm.md', isDirectory: false, createdAt: 30, size: 12 },
]

describe('file tree sorting', () => {
  it('keeps folders above files by default', () => {
    expect(sortFileTreeEntries(entries, 'name', false).map((entry) => entry.name)).toEqual(['b-folder', 'z-folder', 'a.md', 'm.md'])
  })

  it('can mix folders and files in one sort order', () => {
    expect(sortFileTreeEntries(entries, 'name', true).map((entry) => entry.name)).toEqual(['a.md', 'b-folder', 'm.md', 'z-folder'])
  })

  it('uses the selected metadata field while retaining the folder rule', () => {
    expect(sortFileTreeEntries(entries, 'created', false).map((entry) => entry.name)).toEqual(['b-folder', 'z-folder', 'a.md', 'm.md'])
    expect(sortFileTreeEntries(entries, 'created', true).map((entry) => entry.name)).toEqual(['a.md', 'm.md', 'b-folder', 'z-folder'])
  })
})
