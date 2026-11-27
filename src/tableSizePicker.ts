import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { countRemovedTableCells, type EditableTable } from './tableEditing'

const gridColumns = 8
const gridRows = 10

export function attachTableSizePicker(
  trigger: HTMLButtonElement,
  getTable: () => EditableTable,
  resize: (rows: number, columns: number) => void,
) {
  const doc = trigger.ownerDocument
  const panel = doc.createElement('form')
  panel.className = 'live-table-size-picker'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '表格尺寸')
  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-expanded', 'false')

  const grid = doc.createElement('div')
  grid.className = 'live-table-size-grid'
  grid.setAttribute('role', 'group')
  grid.setAttribute('aria-label', '快速选择行列数')
  const controls = doc.createElement('div')
  controls.className = 'live-table-size-fields'
  function dimension(label: string) {
    const wrapper = doc.createElement('label')
    const input = doc.createElement('input')
    input.type = 'number'
    input.required = true
    input.min = '1'
    wrapper.append(label, input)
    controls.append(wrapper)
    return input
  }
  const columns = dimension('列')
  const rows = dimension('行')
  const warning = doc.createElement('p')
  warning.setAttribute('role', 'status')
  warning.hidden = true
  const apply = doc.createElement('button')
  apply.type = 'submit'
  apply.className = 'live-table-size-apply'
  apply.textContent = '应用'
  controls.append(apply)
  panel.append(grid, controls, warning)

  let confirmed: { table: EditableTable; rows: number; columns: number } | undefined
  let stopPositioning: (() => void) | undefined
  const cells: HTMLButtonElement[] = []
  const clearWarning = () => {
    confirmed = undefined
    warning.hidden = true
    apply.textContent = '应用'
  }
  function paint() {
    cells.forEach((cell, index) => {
      cell.classList.toggle('is-preview', index % gridColumns < columns.valueAsNumber
        && Math.floor(index / gridColumns) < rows.valueAsNumber)
    })
  }
  function setSize(width: number, height: number) {
    columns.value = String(width)
    rows.value = String(height)
    paint()
  }
  function close() {
    stopPositioning?.()
    stopPositioning = undefined
    doc.removeEventListener('pointerdown', dismiss, true)
    panel.remove()
    trigger.setAttribute('aria-expanded', 'false')
  }
  function dismiss(event: PointerEvent) {
    if (event.target instanceof Node && !panel.contains(event.target) && !trigger.contains(event.target)) close()
  }
  function submit() {
    if (!columns.checkValidity() || !rows.checkValidity()) { panel.reportValidity(); return }
    const width = columns.valueAsNumber
    const height = rows.valueAsNumber
    const table = getTable()
    const removed = countRemovedTableCells(table, height, width)
    if (removed && (confirmed?.table !== table || confirmed.columns !== width || confirmed.rows !== height)) {
      confirmed = { table, rows: height, columns: width }
      warning.textContent = `将删除 ${removed} 个有内容的单元格。`
      warning.hidden = false
      apply.textContent = '确认缩小'
      apply.focus()
      return
    }
    close()
    trigger.focus({ preventScroll: true })
    if (height !== table.rows.length || width !== table.alignments.length) resize(height, width)
  }
  function focusCell(index: number) {
    const previous = grid.querySelector<HTMLButtonElement>('button[tabindex="0"]')
    if (previous) previous.tabIndex = -1
    cells[index].tabIndex = 0
    cells[index].focus({ preventScroll: true })
  }
  for (let y = 1; y <= gridRows; y++) {
    for (let x = 1; x <= gridColumns; x++) {
      const cell = doc.createElement('button')
      cell.type = 'button'
      cell.tabIndex = -1
      cell.setAttribute('aria-label', `${x} 列 ${y} 行`)
      cell.addEventListener('pointerenter', () => { if (!confirmed) setSize(x, y) })
      cell.addEventListener('click', () => { clearWarning(); setSize(x, y); submit() })
      cells.push(cell)
      grid.append(cell)
    }
  }
  grid.addEventListener('keydown', event => {
    const current = cells.indexOf(doc.activeElement as HTMLButtonElement)
    if (current < 0) return
    let x = current % gridColumns, y = Math.floor(current / gridColumns)
    if (event.key === 'ArrowLeft') x = Math.max(0, x - 1)
    else if (event.key === 'ArrowRight') x = Math.min(gridColumns - 1, x + 1)
    else if (event.key === 'ArrowUp') y = Math.max(0, y - 1)
    else if (event.key === 'ArrowDown') y = Math.min(gridRows - 1, y + 1)
    else return
    event.preventDefault()
    clearWarning()
    setSize(x + 1, y + 1)
    focusCell(y * gridColumns + x)
  })
  controls.addEventListener('input', () => { clearWarning(); paint() })
  panel.addEventListener('submit', event => { event.preventDefault(); submit() })
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
    trigger.focus({ preventScroll: true })
  })
  panel.addEventListener('focusout', event => {
    if (event.relatedTarget instanceof Node && !panel.contains(event.relatedTarget) && event.relatedTarget !== trigger) close()
  })
  trigger.addEventListener('click', () => {
    if (panel.isConnected) { close(); return }
    const { rows: data, alignments } = getTable()
    columns.max = String(Math.max(12, alignments.length))
    rows.max = String(Math.max(500, data.length))
    clearWarning()
    setSize(alignments.length, data.length)
    const container = trigger.closest('.app-shell') ?? doc.body
    container.append(panel)
    trigger.setAttribute('aria-expanded', 'true')
    const index = (Math.min(data.length, gridRows) - 1) * gridColumns + Math.min(alignments.length, gridColumns) - 1
    if (trigger.isConnected) {
      panel.style.visibility = 'hidden'
      let needsFocus = true
      stopPositioning = autoUpdate(trigger, panel, () => {
        void computePosition(trigger, panel, {
          strategy: 'fixed', placement: 'bottom-start', middleware: [offset(5), flip({ padding: 8 }), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          if (!panel.isConnected) return
          Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' })
          if (needsFocus) { needsFocus = false; focusCell(index) }
        })
      })
    } else focusCell(index)
    doc.addEventListener('pointerdown', dismiss, true)
  })
  return close
}
