import { expect, it } from 'vitest'
import { relativeDocumentTreePath } from './filesystemTreeScope'

it('includes only documents inside the current MD directory', () => {
  const current = 'E:\\notes\\project\\current.md'
  expect(relativeDocumentTreePath('e:/notes/project/sibling.md', current)).toBe('sibling.md')
  expect(relativeDocumentTreePath('E:/notes/project/sub/nested.md', current)).toBe('sub/nested.md')
  expect(relativeDocumentTreePath('E:/notes/other.md', current)).toBeNull()
  expect(relativeDocumentTreePath('E:/notes/project-other/other.md', current)).toBeNull()
  expect(relativeDocumentTreePath('D:/notes/project/other.md', current)).toBeNull()
})

it('shows only the active document when its directory is unknown', () => {
  expect(relativeDocumentTreePath('current.md', 'current.md')).toBe('current.md')
  expect(relativeDocumentTreePath('other.md', 'current.md')).toBeNull()
  expect(relativeDocumentTreePath('folder/other.md', 'current.md')).toBeNull()
})

it('handles drive roots and Unix roots', () => {
  expect(relativeDocumentTreePath('C:/notes/a.md', 'C:/current.md')).toBe('notes/a.md')
  expect(relativeDocumentTreePath('/notes/a.md', '/current.md')).toBe('notes/a.md')
})
