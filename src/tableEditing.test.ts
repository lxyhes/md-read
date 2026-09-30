import { describe, expect, it } from 'vitest'
import { renderMarkdownFragment } from './parser'
import { parseEditableTable, serializeEditableTable, moveTableRow, moveTableColumn, deleteTableRow, deleteTableColumn, parseTableClipboard, pasteTableCells, type EditableTable } from './tableEditing'
const table = (): EditableTable => ({ rows: [['name', 'count'], ['a', '1'], ['b', '2']], alignments: ['left', 'right'] })

describe('table editing', () => {
  it('preserves rendered Markdown meaning for escaped pipes, code, and formatting', () => {
    const visible = (source: string) => renderMarkdownFragment(source).replace(/<[^>]+>/g, '')
    for (const slashes of [1, 3, 5, 7]) {
      const source = `| **name** | count |\n| --- | ---: |\n| a${'\\'.repeat(slashes)}|b | \`x\\|y\` |`
      const serialized = serializeEditableTable(parseEditableTable(source)!)
      expect(visible(serialized)).toBe(visible(source))
      expect(serializeEditableTable(parseEditableTable(serialized)!)).toBe(serialized)
    }
  })
  it('rejects excessive clipboard payloads and invalid coordinates atomically', () => {
    const value = table()
    expect(pasteTableCells(value, 0, 0, 'x'.repeat(1000001))).not.toBe('')
    expect(pasteTableCells(value, 0, 0, 'x\n'.repeat(100000))).not.toBe('')
    expect(pasteTableCells(value, 0.5, 0, 'x')).not.toBe('')
    expect(value).toEqual(table())
  })
  it('does not silently discard body cells beyond the declared columns', () => {
    const parsed = parseEditableTable('| a | b |\n| --- | --- |\n| x | y | hidden |')!
    expect(parsed.rows[1]).toEqual(['x', 'y', 'hidden'])
    expect(parsed.alignments).toEqual(['left', 'left', 'left'])
  })
  it('rejects a header width mismatch instead of discarding data', () => {
    expect(parseEditableTable('| a | b | c |\n| --- | --- |\n| x | y |')).toBeNull()
  })
  it('rejects an unterminated quoted paste without changing the table', () => {
    const value = table()
    expect(pasteTableCells(value, 1, 0, '"first\tsecond\nthird')).not.toBe('')
    expect(value).toEqual(table())
  })
  it('rejects text after a closing clipboard quote', () => {
    const value = table()
    expect(pasteTableCells(value, 1, 0, '"first"extra\tsecond')).not.toBe('')
    expect(value).toEqual(table())
  })
  it('keeps escaped pipes inside their cells and preserves alignment', () => {
    const parsed = parseEditableTable('| a\\|b | c |\n| :---: | ---: |\n| x\\|y | z |')!
    expect(parsed.rows).toEqual([['a|b', 'c'], ['x|y', 'z']])
    expect(parsed.alignments).toEqual(['center', 'right'])
    expect(parseEditableTable(serializeEditableTable(parsed))).toEqual(parsed)
  })
  it('supports optional outer pipes and normalizes short rows', () => {
    expect(parseEditableTable('a | b\n--- | ---\nx')).toEqual({ rows: [['a', 'b'], ['x', '']], alignments: ['left', 'left'] })
    expect(parseEditableTable('a|b\nnot|table')).toBeNull()
  })
  it('does not multiply backslashes over repeated saves', () => {
    const source = '| a\\\\\\|b | c |\n| --- | --- |\n| x | y |'
    const first = serializeEditableTable(parseEditableTable(source)!)
    expect(serializeEditableTable(parseEditableTable(first)!)).toBe(first)
  })
  it('moves body rows without moving the header', () => {
    const value = table()
    expect(moveTableRow(value, 1, -1)).toBe(1)
    expect(moveTableRow(value, 2, -1)).toBe(1)
    expect(value.rows).toEqual([['name', 'count'], ['b', '2'], ['a', '1']])
    expect(deleteTableRow(value, 0)).toBe(false)
    expect(deleteTableRow(value, 2)).toBe(true)
  })
  it('moves column data and alignment together and preserves the last column', () => {
    const value = table()
    expect(moveTableColumn(value, 1, -1)).toBe(0)
    expect(value.alignments).toEqual(['right', 'left'])
    expect(value.rows[1]).toEqual(['1', 'a'])
    expect(deleteTableColumn(value, 0)).toBe(true)
    expect(deleteTableColumn(value, 0)).toBe(false)
    expect(value.rows).toEqual([['name'], ['a'], ['b']])
  })
  it('ignores invalid row and column indices', () => {
    const value = table()
    expect(moveTableRow(value, 99, -1)).toBe(99)
    expect(moveTableColumn(value, -1, 1)).toBe(-1)
    expect(deleteTableRow(value, -1)).toBe(false)
    expect(deleteTableColumn(value, 99)).toBe(false)
    expect(value).toEqual(table())
  })
  it('parses tabular clipboard data including quoted newlines and quotes', () => {
    expect(parseTableClipboard('"a\nb"\t"c""d"\r\nx\ty\r\n')).toEqual([['a\nb', 'c"d'], ['x', 'y']])
    expect(parseTableClipboard('a\t\n')).toEqual([['a', '']])
  })
  it('pastes a rectangle and grows the table while keeping unrelated cells', () => {
    const value = table()
    expect(pasteTableCells(value, 2, 1, '3\t4\n5\t6\n')).toBe('')
    expect(value.rows).toEqual([['name', 'count', ''], ['a', '1', ''], ['b', '3', '4'], ['', '5', '6']])
    expect(value.alignments).toEqual(['left', 'right', 'left'])
  })
  it('rejects oversized clipboard ranges before mutating the table', () => {
    const value = table()
    expect(pasteTableCells(value, 0, 1, Array(12).fill('x').join('\t'))).not.toBe('')
    expect(pasteTableCells(value, 2, 0, Array(500).fill('x').join('\n'))).not.toBe('')
    expect(value).toEqual(table())
  })
  it('serializes multiline cells without breaking table rows', () => {
    const value = table()
    value.rows[1][0] = 'one\ntwo'
    expect(serializeEditableTable(value)).toContain('| one<br>two | 1 |')
  })
})
