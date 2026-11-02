import { describe, expect, it } from 'vitest'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { codeIndentInsertion, indentSelection, isFenceBacktickInput, isTopLevelParagraph, selectedLineRange, removeSelectedLines, setHeadingLines, setOrderedListLines } from './editorInput'

describe('ordered list menu action', () => {
  it('numbers all selected items consecutively and keeps blank lines empty', () => {
    const lines = Array.from({ length: 15 }, (_, index) => `条目${index + 1}`)
    const source = lines.join('\n\n')
    const result = setOrderedListLines(source, 0, source.length)
    expect(result.value).toBe(lines.map((line, index) => `${index + 1}. ${line}`).join('\n\n'))
    expect(result.value.slice(result.start, result.end)).toBe(result.value)
  })

  it('renumbers repeated markers without duplicating list or task markers', () => {
    const source = '1. 第一项\n1. 第二项\n1. \n- [x] 第三项\n- 1. 第四项'
    expect(setOrderedListLines(source, 0, source.length).value).toBe('1. 第一项\n2. 第二项\n\n3. 第三项\n4. 第四项')
  })

  it('preserves a selected continuation starting at 22', () => {
    const source = '22. 第一项\n23. 第二项\n24. 第三项'
    expect(setOrderedListLines(source, 0, source.length).value).toBe(source)
  })

  it('does not modify the next line when selection ends at its start', () => {
    const source = '第一项\n第二项\n保持原样'
    const end = source.indexOf('保持原样')
    const result = setOrderedListLines(source, 0, end)
    expect(result.value).toBe('1. 第一项\n2. 第二项\n保持原样')
    expect(result.value.slice(result.start, result.end)).toBe('1. 第一项\n2. 第二项')
  })

  it('keeps nested numbering independent and restarts it under a new parent', () => {
    const source = '- 第一组\n  - 子项甲\n  - 子项乙\n- 第二组\n  - 子项丙'
    const result = setOrderedListLines(source, 0, source.length)
    expect(result.value).toBe('1. 第一组\n   1. 子项甲\n   2. 子项乙\n2. 第二组\n   1. 子项丙')
    const outer = markdownLanguage.parser.parse(result.value).topNode.getChild('OrderedList')
    expect(outer?.getChildren('ListItem')).toHaveLength(2)
    expect(outer?.getChildren('ListItem')[0].getChild('OrderedList')?.getChildren('ListItem')).toHaveLength(2)
  })

  it('inserts one marker on an empty line and preserves the caret in text', () => {
    expect(setOrderedListLines('', 0, 0)).toEqual({ value: '1. ', start: 3, end: 3 })
    expect(setOrderedListLines('内容', 1, 1)).toEqual({ value: '1. 内容', start: 4, end: 4 })
  })
})

it('changes heading levels without stacking Markdown markers', () => {
  expect(setHeadingLines('# one\n## two\ntext', 0, 12, 3)).toEqual({ value: '### one\n### two\ntext', start: 0, end: 15 })
})

describe('paragraph editing', () => {
  it('recognizes plain paragraphs and inline formatting', () => {
    const tree = markdownLanguage.parser.parse('hello **world**')
    expect(isTopLevelParagraph(tree, 0, 0)).toBe(true)
    expect(isTopLevelParagraph(tree, 9, 11)).toBe(true)
    expect(isTopLevelParagraph(tree, 15, 15)).toBe(true)
  })
  it('leaves structured blocks and cross-paragraph selections alone', () => {
    for (const source of ['- item', '> quote', '# heading', '```\ncode\n```']) {
      expect(isTopLevelParagraph(markdownLanguage.parser.parse(source), 3, 3)).toBe(false)
    }
    expect(isTopLevelParagraph(markdownLanguage.parser.parse('one\n\ntwo'), 1, 7)).toBe(false)
  })
})

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
