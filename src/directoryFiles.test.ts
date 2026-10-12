import { describe, expect, it } from 'vitest'
import { directoryFiles } from './directoryFiles'

describe('current directory files', () => {
  const cached = [{ path: 'C:\\notes\\old.md', name: 'old.md', documentId: 'old' }]
  it('removes deleted cached files and shows externally renamed/new files', () => {
    expect(directoryFiles(cached, [{ path: 'C:/notes/new.md', name: 'new.md' }]).map(file => file.name)).toEqual(['new.md'])
    expect(directoryFiles(cached, [])).toEqual([])
  })
  it('keeps disk metadata and matches cached documents across Windows path spelling', () => {
    expect(directoryFiles(cached, [{ path: 'c:/notes/old.md', name: 'old.md', modifiedAt: 123, size: 42 }])).toEqual([
      { path: 'c:/notes/old.md', name: 'old.md', modifiedAt: 123, size: 42, documentId: 'old' },
    ])
  })
  it('retains cached documents when no disk listing is available', () => {
    expect(directoryFiles(cached, null)).toEqual(cached)
  })
})
