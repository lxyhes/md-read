import { describe, expect, it } from 'vitest'
import { codeIndentInsertion, indentSelection, isFenceBacktickInput, selectedLineRange, removeSelectedLines } from './editorInput'

describe('line selection and deletion', () => {
  it('selects an empty first line without skipping it', () => {
    expect(selectedLineRange('\nnext', 0, 0)).toEqual({ start: 0, end: 0 })
    expect(removeSelectedLines('\nnext', 0, 0)).toEqual({ value: 'next', start: 0, end: 0 })
  })
  it('excludes a line at the selection endpoint', () => {
    expect(removeSelectedLines('one\ntwo\nthree', 0, 4)).toEqual({ value: 'two\nthree', start: 0, end: 0 })
  })
  it('removes the preceding newline when deleting the last line', () => {
    expect(removeSelectedLines('one\ntwo', 5, 5)).toEqual({ value: 'one', start: 3, end: 3 })
  })
  it('deletes the only line and handles an empty document', () => {
    expect(removeSelectedLines('one', 1, 1)).toEqual({ value: '', start: 0, end: 0 })
    expect(removeSelectedLines('', 0, 0)).toEqual({ value: '', start: 0, end: 0 })
  })
})

describe('backtick fence input', () => {
  it('allows a third or subsequent backtick without inserting another pair', () => {
    expect(isFenceBacktickInput('``', 2)).toBe(true)
    expect(isFenceBacktickInput('  ```', 5)).toBe(true)
  })
  it('keeps inline pairing and closing backtick skipping', () => {
    expect(isFenceBacktickInput('text ``', 7)).toBe(false)
    expect(isFenceBacktickInput('```', 2)).toBe(false)
  })
})

describe('editor indentation', () => {
  it('does not indent the line at the exclusive selection end', () => {
    expect(indentSelection('one\ntwo\nthree', 0, 4, false)).toEqual({ value: '  one\ntwo\nthree', start: 2, end: 6 })
  })
  it('indents every selected line and preserves the selected text', () => {
    expect(indentSelection('one\ntwo\nthree', 1, 7, false)).toEqual({ value: '  one\n  two\nthree', start: 3, end: 11 })
  })
  it('outdents tabs and spaces together', () => {
    expect(indentSelection('\tone\n  two', 0, 10, true)).toEqual({ value: 'one\ntwo', start: 0, end: 7 })
  })
  it('clamps a caret inside removed indentation', () => {
    expect(indentSelection('  one', 1, 1, true)).toEqual({ value: 'one', start: 0, end: 0 })
  })
  it('handles an empty first line at position zero', () => {
    expect(indentSelection('\none', 0, 1, false)).toEqual({ value: '  \none', start: 2, end: 3 })
  })
  it('inserts spaces at a collapsed caret', () => {
    expect(indentSelection('one', 1, 1, false)).toEqual({ value: 'o  ne', start: 3, end: 3 })
  })
})

function atEnd(value: string) { return codeIndentInsertion(value, value.length) }

describe('fenced code enter', () => {
  it('retains indentation and adds a level after an opening brace', () => {
    expect(atEnd('```js\n  if (ok) {')).toEqual({ text: '\n    ', caret: 5 })
  })
  it('retains tab indentation style', () => {
    expect(atEnd('```js\n\tif (ok) {')).toEqual({ text: '\n\t\t', caret: 3 })
  })
  it('splits paired braces and places the caret on the inner line', () => {
    const value = '```js\n  {}'
    expect(codeIndentInsertion(value, value.indexOf('}'))).toEqual({ text: '\n    \n  ', caret: 5 })
  })
  it('does not close a backtick fence with tildes', () => {
    expect(atEnd('```\n~~~\n  code')).toEqual({ text: '\n  ', caret: 3 })
  })
  it('does not close a four-backtick fence with three backticks', () => {
    expect(atEnd('````\n```\ncode')).toEqual({ text: '\n', caret: 1 })
  })
  it('does not close a fence when there is trailing content', () => {
    expect(atEnd('```\n```not-a-close\ncode')).toEqual({ text: '\n', caret: 1 })
  })
  it('stops code indentation after a valid closing fence', () => {
    expect(atEnd('~~~js\ncode\n~~~~\ntext')).toBeNull()
  })
  it('rejects a backtick in opening fence info', () => {
    expect(atEnd('```bad`info\ncode')).toBeNull()
  })
  it('does not carry blank lines into indentation', () => {
    expect(atEnd('```\n\n  code')).toEqual({ text: '\n  ', caret: 3 })
  })
  it('leaves regular prose unchanged', () => {
    expect(atEnd('paragraph {')).toBeNull()
  })
})
