import { describe, expect, it } from 'vitest'
import { findEditorMatches, replaceEditorMatches, type EditorFindOptions } from './editorFind'
const options: EditorFindOptions = { caseSensitive: false, wholeWord: false, regex: false }

describe('draft find and replace', () => {
  it('does not treat the edge of a selection as a whole-word boundary', () => {
    expect(findEditorMatches('scatter cat', 'cat', { ...options, wholeWord: true, scope: { start: 1, end: 4 } }).matches).toHaveLength(0)
    expect(findEditorMatches('catfish', 'cat', { ...options, wholeWord: true, scope: { start: 0, end: 3 } }).matches).toHaveLength(0)
  })
  it('finds case-insensitively and treats punctuation literally', () => {
    expect(findEditorMatches('A.b a.b axb', 'a.b', options).matches.map((match) => match.start)).toEqual([0, 4])
    expect(findEditorMatches('A a', 'a', { ...options, caseSensitive: true }).matches).toHaveLength(1)
  })
  it('recognizes Unicode word boundaries', () => {
    expect(findEditorMatches('猫 猫咪 猫_ cat scatter cat2', '猫', { ...options, wholeWord: true }).matches).toHaveLength(1)
    expect(findEditorMatches('cat scatter cat2', 'cat', { ...options, wholeWord: true }).matches).toHaveLength(1)
  })
  it('limits matches and replacements to a selected range', () => {
    const value = 'cat cat cat'
    const result = findEditorMatches(value, 'cat', { ...options, scope: { start: 4, end: 7 } })
    expect(result.matches.map((match) => match.start)).toEqual([4])
    expect(replaceEditorMatches(value, result.matches, 'kitten', false)).toEqual({ value: 'cat kitten cat', delta: 3 })
  })
  it('replaces just one match and handles empty replacement', () => {
    const value = 'cat cat'
    const matches = findEditorMatches(value, 'cat', options).matches
    expect(replaceEditorMatches(value, [matches[1]], '', false).value).toBe('cat ')
  })
  it('keeps replacement dollar signs literal in text mode', () => {
    const matches = findEditorMatches('a a', 'a', options).matches
    expect(replaceEditorMatches('a a', matches, '$&$1', false).value).toBe('$&$1 $&$1')
  })
  it('expands numbered, named, and dollar escapes like native replacement', () => {
    const value = 'a12 b34'
    const query = '(?<letter>[a-z])(\\d+)'
    const replacement = '$<letter>-$2-$$-$&-$12'
    const matches = findEditorMatches(value, query, { ...options, regex: true }).matches
    expect(replaceEditorMatches(value, matches, replacement, true).value).toBe(value.replace(new RegExp(query, 'gmu'), replacement))
  })
  it('supports unmatched groups and match context substitutions', () => {
    const value = 'ab b'
    const replacement = "$1/$`/$'/$0"
    const matches = findEditorMatches(value, '(a)?b', { ...options, regex: true }).matches
    expect(replaceEditorMatches(value, matches, replacement, true).value).toBe(value.replace(/(a)?b/gmu, replacement))
  })
  it('advances zero-length matches safely over emoji', () => {
    const matches = findEditorMatches('😀x', '(?=.)', { ...options, regex: true }).matches
    expect(matches.map((match) => match.start)).toEqual([0, 2])
    expect(replaceEditorMatches('😀x', matches, '|', true).value).toBe('|😀|x')
  })
  it('reports invalid patterns and excessive matches without replacing anything', () => {
    expect(findEditorMatches('abc', '[', { ...options, regex: true }).error).not.toBe('')
    expect(findEditorMatches('abc', '[', { ...options, regex: true, wholeWord: true }).error).not.toBe('')
    const result = findEditorMatches('a'.repeat(10001), 'a', options)
    expect(result.error).not.toBe('')
    expect(result.matches).toEqual([])
  })
  it('allows whitespace searches and ignores an empty query', () => {
    expect(findEditorMatches('a b', ' ', options).matches).toHaveLength(1)
    expect(findEditorMatches('abc', '', options)).toEqual({ matches: [], error: '' })
  })
})
