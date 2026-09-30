import { describe, expect, it } from 'vitest'
import { matchQuickOpen } from './quickOpen'

const entries = [
  { name: 'api-design.md', path: 'E:/notes/project/api-design.md' },
  { name: 'release.md', path: 'E:/notes/team/roadmap/release.md' },
  { name: 'architecture.md', path: 'E:/notes/project/architecture.md' },
]

describe('quick open matching', () => {
  it('accepts Windows path separators in the query', () => {
    expect(matchQuickOpen('notes\\project\\api', entries)[0]?.name).toBe('api-design.md')
  })
  it('prefers a contiguous filename match', () => {
    expect(matchQuickOpen('api', entries)[0]?.path).toBe('E:/notes/project/api-design.md')
  })

  it('matches across folder paths', () => {
    expect(matchQuickOpen('team rel', entries)[0]?.path).toBe('E:/notes/team/roadmap/release.md')
  })

  it('keeps a predictable list when there is no query', () => {
    expect(matchQuickOpen('', entries).map((entry) => entry.name)).toEqual(['api-design.md', 'architecture.md', 'release.md'])
  })
})
