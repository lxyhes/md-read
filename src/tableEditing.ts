export type TableAlignment = 'left' | 'center' | 'right'
export type EditableTable = { rows: string[][]; alignments: TableAlignment[] }

function cells(line: string) {
  const result: string[] = []
  let cell = ''
  const text = line.trim()
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '\\' && text[index + 1] === '\\') { cell += '\\\\'; index++; continue }
    if (char === '\\' && text[index + 1] === '|') { cell += '|'; index++; continue }
    if (char === '|') { result.push(cell.trim()); cell = '' }
    else cell += char
  }
  result.push(cell.trim())
  if (text.startsWith('|')) result.shift()
  // An escaped final pipe belongs to the last cell, not an outer delimiter.
  if (text.endsWith('|') && cell === '') result.pop()
  return result
}

export function parseEditableTable(source: string): EditableTable | null {
  const lines = source.trim().split(/\r?\n/)
  if (lines.length < 2) return null
  const markers = cells(lines[1])
  if (!markers.length || markers.some((marker) => !/^:?-+:?$/.test(marker))) return null
  const parsedRows = [cells(lines[0]), ...lines.slice(2).map(cells)]
  if (parsedRows[0].length !== markers.length) return null
  const alignments: TableAlignment[] = markers.map((marker) => marker.startsWith(':') && marker.endsWith(':') ? 'center' : marker.endsWith(':') ? 'right' : 'left')
  const width = parsedRows.reduce((width, row) => Math.max(width, row.length), alignments.length)
  while (alignments.length < width) alignments.push('left')
  const rows = parsedRows.map((row) => alignments.map((_, index) => row[index] ?? ''))
  return { rows, alignments }
}

export function serializeEditableTable(table: EditableTable) {
  const row = (values: string[]) => `| ${table.alignments.map((_, index) => {
    const value = (values[index] ?? '').replace(/\r?\n/g, '<br>')
    // Already escaped pipes must not acquire an extra backslash on each save.
    return value.replace(/(\\*)\|/g, (_, slashes: string) => `${slashes.length % 2 ? slashes + '\\' : slashes}\\|`)
  }).join(' | ')} |`
  const markers = `| ${table.alignments.map((alignment) => alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : ':---').join(' | ')} |`
  return [row(table.rows[0] ?? []), markers, ...table.rows.slice(1).map(row)].join('\n')
}

export function moveTableRow(table: EditableTable, index: number, direction: -1 | 1) {
  const target = index + direction
  if (index <= 0 || index >= table.rows.length || target <= 0 || target >= table.rows.length) return index
  ;[table.rows[index], table.rows[target]] = [table.rows[target], table.rows[index]]
  return target
}

export function moveTableColumn(table: EditableTable, index: number, direction: -1 | 1) {
  const target = index + direction
  if (index < 0 || index >= table.alignments.length || target < 0 || target >= table.alignments.length) return index
  ;[table.alignments[index], table.alignments[target]] = [table.alignments[target], table.alignments[index]]
  for (const row of table.rows) [row[index], row[target]] = [row[target], row[index]]
  return target
}

export function deleteTableRow(table: EditableTable, index: number) {
  if (index <= 0 || index >= table.rows.length) return false
  table.rows.splice(index, 1)
  return true
}

export function deleteTableColumn(table: EditableTable, index: number) {
  if (table.alignments.length <= 1 || index < 0 || index >= table.alignments.length) return false
  table.alignments.splice(index, 1)
  for (const row of table.rows) row.splice(index, 1)
  return true
}

export function parseTableClipboard(text: string) {
  if (text.length > 1000000) throw new Error('粘贴内容超过 100 万字符，请分批粘贴')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const normalized = text.replace(/\r\n?/g, '\n')
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index]
    if (char === '"' && (quoted || !cell)) {
      if (quoted && normalized[index + 1] === '"') { cell += '"'; index++ }
      else {
        if (quoted && index + 1 < normalized.length && !/[\t\n]/.test(normalized[index + 1])) throw new Error('粘贴格式无效：结束引号后必须是制表符或换行')
        quoted = !quoted
      }
    } else if (!quoted && (char === '\t' || char === '\n')) {
      row.push(cell); cell = ''
      if (char === '\n') { rows.push(row); row = [] }
      if (row.length > 12 || rows.length > 500) throw new Error('粘贴范围超过 12 列或 500 行，请缩小范围')
    } else cell += char
  }
  if (quoted) throw new Error('粘贴格式无效：引号未闭合，请检查复制的数据')
  if (cell || row.length || !rows.length) { row.push(cell); rows.push(row) }
  return rows
}

export function pasteTableCells(table: EditableTable, row: number, column: number, text: string) {
  let values: string[][]
  try { values = parseTableClipboard(text) }
  catch (error) { return error instanceof Error ? error.message : '粘贴格式无效，原表格已保留' }
  const width = values.reduce((width, cells) => Math.max(width, cells.length), 0)
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0 || row >= table.rows.length || column >= table.alignments.length) return '请先选择一个单元格'
  if (column + width > 12 || row + values.length > 500) return '粘贴范围超过 12 列或 500 行，请缩小范围'
  while (table.alignments.length < column + width) {
    table.alignments.push('left')
    for (const cells of table.rows) cells.push('')
  }
  while (table.rows.length < row + values.length) table.rows.push(table.alignments.map(() => ''))
  values.forEach((cells, offset) => cells.forEach((value, index) => { table.rows[row + offset][column + index] = value }))
  return ''
}
