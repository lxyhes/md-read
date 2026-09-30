import { describe, expect, it } from 'vitest'
import { getDocumentStatistics } from './documentStats'

describe('document statistics', () => {
  it('counts readable prose while excluding media and fenced code regions', () => {
    expect(getDocumentStatistics({
      source: '# 标题\n\n中文 hello world\n\n```ts\nconst ignored = true\n```',
      headings: [{}],
      regions: [
        { type: 'heading', textContent: '标题' },
        { type: 'paragraph', textContent: '中文 hello world' },
        { type: 'code', textContent: 'const ignored = true' },
        { type: 'image', textContent: '封面' },
      ],
    })).toEqual({ characters: 14, words: 6, lines: 7, blocks: 1, headings: 1 })
  })
})
