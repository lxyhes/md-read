import { EditorState, Prec, StateField, type EditorSelection, type Range, type Text } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { undo, redo, isolateHistory } from '@codemirror/commands'
import { renderMarkdownFragment } from './parser'
import { articleStrongSpans, markdownProcessor } from './markdown/fragment'
import { nodeText, safeUrl, type MdastNode } from './markdown/shared'
import { parseEditableTable, serializeEditableTable, moveTableRow, moveTableColumn, deleteTableRow, deleteTableColumn, pasteTableCells, resizeEditableTable, type EditableTable } from './tableEditing'
import { attachTableSizePicker } from './tableSizePicker'
import { confirmAppAction } from './appDialog'
import { isClipboardImageLink } from './pasteMarkdown'
import { CodeLanguageWidget } from './codeLanguagePicker'

export interface LiveOptions { resolveUrl: (url: string) => string; openLink: (url: string) => void; message: (text: string) => void; renderDiagram?: (root: HTMLElement, code: string) => () => void; selectCodeLanguage?: (language: string) => void }

const selectPreviewSource = 'select.markdown.source'

function currentCodeFence(state: EditorState) {
  const selection = state.selection.main
  const tree = syntaxTree(state)
  for (const side of [1, -1] as const) {
    let fence: SyntaxNode | null = tree.resolve(selection.head, side)
    while (fence && fence.name !== 'FencedCode') fence = fence.parent
    if (fence && selection.from >= fence.from && selection.to <= fence.to) return fence
  }
  return null
}

function codeBodyBounds(doc: Text, fence: SyntaxNode) {
  const [, closing] = fence.getChildren('CodeMark')
  return {
    from: doc.lineAt(fence.from).to + 1,
    to: closing ? doc.lineAt(closing.from).from - 1 : fence.to,
  }
}

function selectCodeBody(view: EditorView) {
  const fence = currentCodeFence(view.state)
  if (!fence) return false
  const { from, to } = codeBodyBounds(view.state.doc, fence)
  if (from <= to) view.dispatch({ selection: { anchor: from, head: to }, userEvent: selectPreviewSource })
  return true
}

function deleteBlock(view: EditorView, from: number, to: number, userEvent: string) {
  const { doc } = view.state
  const followedByBlankLine = doc.sliceString(to, Math.min(to + 2, doc.length)) === '\n\n'
  const hasLeadingSeparator = from === 0 || doc.sliceString(Math.max(0, from - 2), from) === '\n\n'
  view.dispatch({
    changes: { from, to: to + (followedByBlankLine && hasLeadingSeparator ? 2 : 0) },
    selection: { anchor: from },
    annotations: isolateHistory.of('full'),
    userEvent,
  })
}

function deleteEmptyCodeBlock(view: EditorView) {
  const { doc, selection } = view.state
  if (!selection.main.empty) return false
  const fence = currentCodeFence(view.state)
  if (!fence) return false
  const body = codeBodyBounds(doc, fence)
  if (selection.main.head < body.from || selection.main.head > body.to) return false
  if (fence.getChildren('CodeText').some(text => /[^\n]/.test(doc.sliceString(text.from, text.to)))) return false

  const opening = doc.lineAt(fence.from)
  const start = doc.sliceString(opening.from, fence.from).trim() ? fence.from : opening.from
  deleteBlock(view, start, fence.to, 'delete.code-block')
  return true
}

class PreviewWidget extends WidgetType {
  constructor(readonly source: string, readonly from: number, readonly options: LiveOptions, readonly block = false, readonly previewSource = source, readonly image = false) { super() }
  eq(other: PreviewWidget) { return this.source === other.source && this.previewSource === other.previewSource && this.from === other.from && this.image === other.image }
  toDOM(view: EditorView) {
    const root = document.createElement(this.block ? 'div' : 'span')
    root.className = 'live-preview-widget'
    if (this.image) root.dataset.imageOffset = String(this.from)
    root.innerHTML = renderMarkdownFragment(this.previewSource, this.options.resolveUrl)
    if (!this.block && root.children.length === 1 && root.firstElementChild?.tagName === 'P') {
      const paragraph = root.firstElementChild
      while (paragraph.firstChild) root.append(paragraph.firstChild)
      paragraph.remove()
    }
    root.setAttribute('aria-label', '预览内容，双击选中源码进行替换')
    root.addEventListener('dblclick', event => {
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.from, head: this.from + this.source.length }, scrollIntoView: true, userEvent: selectPreviewSource })
      view.focus()
    })
    root.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
      link.classList.add('live-link')
      link.addEventListener('click', event => {
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) this.options.openLink(link.getAttribute('href') ?? '')
        else { view.dispatch({ selection: { anchor: this.from, head: this.from + this.source.length }, userEvent: selectPreviewSource }); view.focus() }
      })
    })
    return root
  }
  ignoreEvent() { return true }
}

function keepLongImagePreview(source: string) {
  return source.length >= 320 || /\]\(\s*<?data:image\//i.test(source)
}

const diagramMounts = new WeakMap<HTMLElement, () => void>()
class DiagramWidget extends WidgetType {
  constructor(readonly source: string, readonly from: number, readonly code: string, readonly options: LiveOptions, readonly language: CodeLanguageWidget) { super() }
  eq(other: DiagramWidget) { return this.source === other.source && this.from === other.from }
  toDOM(view: EditorView) {
    const root = document.createElement('div')
    root.className = 'live-diagram-widget'
    const diagram = document.createElement('div')
    const language = this.language.toDOM(view)
    root.append(diagram, language)
    const cleanup = this.options.renderDiagram?.(diagram, this.code)
    if (cleanup) diagramMounts.set(root, cleanup)
    else diagram.textContent = this.code
    diagram.addEventListener('dblclick', () => {
      view.dispatch({ selection: { anchor: this.from, head: this.from + this.source.length }, scrollIntoView: true, userEvent: selectPreviewSource })
      view.focus()
    })
    return root
  }
  destroy(root: HTMLElement) {
    diagramMounts.get(root)?.()
    this.language.destroy(root.lastElementChild as HTMLElement)
  }
  ignoreEvent() { return true }
}

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number) { super() }
  eq(other: TaskWidget) { return this.checked === other.checked && this.from === other.from }
  toDOM(view: EditorView) {
    const input = document.createElement('input')
    input.type = 'checkbox'; input.checked = this.checked
    input.setAttribute('aria-label', this.checked ? '取消完成待办' : '完成待办')
    input.addEventListener('change', () => {
      if (!/^\[[ xX]\]$/.test(view.state.doc.sliceString(this.from, this.from + 3))) return
      view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: input.checked ? 'x' : ' ' }, userEvent: 'input.task' })
    })
    return input
  }
  ignoreEvent() { return true }
}

class BulletWidget extends WidgetType {
  constructor(readonly depth: number) { super() }
  eq(other: BulletWidget) { return this.depth === other.depth }
  toDOM() {
    const marker = document.createElement('span')
    marker.className = 'live-list-bullet'
    if (this.depth % 2 === 0) marker.classList.add('live-list-bullet-hollow')
    else marker.textContent = '•'
    return marker
  }
  ignoreEvent() { return false }
}

class FootnoteWidget extends WidgetType {
  constructor(readonly index: number, readonly definitionFrom: number, readonly text: string) { super() }
  eq(other: FootnoteWidget) { return this.index === other.index && this.definitionFrom === other.definitionFrom && this.text === other.text }
  toDOM(view: EditorView) {
    const button = document.createElement('button')
    button.type = 'button'; button.className = 'live-footnote-ref'; button.textContent = `[${this.index}]`
    button.title = this.text; button.setAttribute('aria-label', `查看脚注 ${this.index}：${this.text}`)
    button.addEventListener('click', () => { view.dispatch({ selection: { anchor: this.definitionFrom }, scrollIntoView: true }); view.focus() })
    return button
  }
  ignoreEvent() { return true }
}

type TableContext = { from: number; to: number; raw: string; table: EditableTable; row: number; col: number; focusFrame?: number }
type TableDOM = HTMLDivElement & { tableContext: TableContext; closeSizePicker?: () => void }

function tableRowStart(doc: Text, tableStart: number, row: number) {
  if (row === 0) return tableStart
  const firstLine = doc.lineAt(tableStart).number
  // Markdown adds a separator line between the header and the first body row.
  return doc.line(Math.min(firstLine + row + 1, doc.lines)).from
}

class TableWidget extends WidgetType {
  constructor(readonly raw: string, readonly from: number, readonly to: number, readonly options: LiveOptions) { super() }
  eq(other: TableWidget) { return this.raw === other.raw && this.from === other.from }
  updateDOM(root: TableDOM, view: EditorView) {
    const table = parseEditableTable(this.raw)
    if (!table) return false
    const previous = root.tableContext
    const resize = previous.table.rows.length !== table.rows.length || previous.table.alignments.length !== table.alignments.length
    const contentChanged = previous.raw !== this.raw
    Object.assign(previous, { from: this.from, to: this.to, raw: this.raw, table })
    if (resize) {
      const wasFocused = root.contains(document.activeElement)
      this.fill(root, view)
      if (wasFocused) this.scheduleFocus(root, previous.row, previous.col)
    } else if (contentChanged) {
      root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(input => {
        const column = Number(input.dataset.col)
        const value = (table.rows[Number(input.dataset.row)]?.[column] ?? '').replace(/<br\s*\/?\s*>/gi, '\n')
        if (input.value !== value) input.value = value
        input.parentElement!.style.textAlign = table.alignments[column]
      })
      this.updatePreviews(root)
      this.updateAlignmentButtons(root)
    }
    return true
  }
  updatePreviews(root: TableDOM) {
    const { table } = root.tableContext
    const template = root.ownerDocument.createElement('template')
    template.innerHTML = renderMarkdownFragment(serializeEditableTable(table), this.options.resolveUrl)
    const rendered = template.content.querySelector('table')
    const width = table.alignments.length
    root.querySelectorAll<HTMLElement>('.live-table-cell-preview').forEach((preview, index) => {
      const row = Math.floor(index / width)
      const column = index % width
      const cell = rendered?.rows[row]?.cells[column]
      if (cell) preview.replaceChildren(...cell.childNodes)
      else preview.textContent = table.rows[row][column]
    })
  }
  toDOM(view: EditorView) {
    const root = document.createElement('div') as TableDOM
    root.className = 'live-table-widget'
    root.tableContext = { from: this.from, to: this.to, raw: this.raw, table: parseEditableTable(this.raw)!, row: 0, col: 0 }
    this.fill(root, view)
    return root
  }
  destroy(root: TableDOM) {
    root.closeSizePicker?.()
    if (root.tableContext.focusFrame !== undefined) cancelAnimationFrame(root.tableContext.focusFrame)
  }
  updateAlignmentButtons(root: TableDOM) {
    const { table, col } = root.tableContext
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-alignment]')) {
      button.setAttribute('aria-pressed', String(button.dataset.alignment === table.alignments[col]))
    }
  }

  scheduleFocus(root: TableDOM, row: number, col: number) {
    const ctx = root.tableContext
    if (ctx.focusFrame !== undefined) cancelAnimationFrame(ctx.focusFrame)
    const active = root.ownerDocument.activeElement
    ctx.focusFrame = requestAnimationFrame(() => {
      ctx.focusFrame = undefined
      if (!root.isConnected || root.ownerDocument.activeElement !== active) return
      const nextRow = Math.min(Math.max(0, row), ctx.table.rows.length - 1)
      const nextCol = Math.min(Math.max(0, col), ctx.table.alignments.length - 1)
      root.querySelector<HTMLTextAreaElement>(`textarea[data-row="${nextRow}"][data-col="${nextCol}"]`)?.focus({ preventScroll: true })
    })
  }
  commit(root: TableDOM, view: EditorView, change: (table: EditableTable, ctx: TableContext) => void, resize = false) {
    const ctx = root.tableContext
    if (view.state.doc.sliceString(ctx.from, ctx.to) !== ctx.raw) { this.options.message('表格已变更，请重新选择后编辑'); return }
    const next = structuredClone(ctx.table)
    change(next, ctx)
    const source = serializeEditableTable(next).replace(/\n/g, ctx.raw.includes('\r\n') ? '\r\n' : '\n')
    if (source === ctx.raw) return
    const insert = view.state.toText(source)
    const row = Math.min(ctx.row, next.rows.length - 1)
    view.dispatch({
      changes: { from: ctx.from, to: ctx.to, insert },
      selection: { anchor: ctx.from + tableRowStart(insert, 0, row) },
      userEvent: 'input.table',
      annotations: resize ? isolateHistory.of('full') : undefined,
    })
  }
  async deleteTable(root: TableDOM, view: EditorView) {
    const { from, to, raw } = root.tableContext
    const { doc } = view.state
    if (!(await confirmAppAction({
      title: '删除整个表格？',
      description: '表头和所有单元格都会从当前文档移除。可以撤销此次操作。',
      confirmLabel: '删除表格',
      destructive: true,
    }))) return
    if (!root.isConnected || view.state.doc !== doc || doc.sliceString(from, to) !== raw) {
      this.options.message('文档已变更，请重新选择要删除的表格')
      return
    }
    deleteBlock(view, from, to, 'delete.table')
    view.focus()
  }
  fill(root: TableDOM, view: EditorView) {
    root.closeSizePicker?.()
    root.replaceChildren()
    const ctx = root.tableContext
    const tools = document.createElement('div')
    tools.className = 'live-table-tools'
    tools.setAttribute('aria-label', '原地表格操作')
    const button = (label: string, action?: () => void) => {
      const control = document.createElement('button')
      control.type = 'button'; control.textContent = label
      if (action) control.addEventListener('click', action)
      tools.append(control)
      return control
    }
    const modify = (change: (table: EditableTable, ctx: TableContext) => void) => this.commit(root, view, change)
    const icon = (control: HTMLButtonElement, name: 'size' | 'align', label: string) => {
      const glyph = document.createElement('span')
      glyph.className = `live-table-${name}-icon`
      for (let index = 0; index < (name === 'size' ? 4 : 3); index++) glyph.append(document.createElement('i'))
      glyph.setAttribute('aria-hidden', 'true')
      control.classList.add('live-table-tool-icon')
      control.setAttribute('aria-label', label)
      control.title = label
      control.replaceChildren(glyph)
    }
    const size = button('表格尺寸')
    icon(size, 'size', '调整表格尺寸')
    root.closeSizePicker = attachTableSizePicker(size, () => ctx.table, (rows, columns) => {
      this.commit(root, view, (table, selected) => {
        resizeEditableTable(table, rows, columns)
        selected.row = Math.min(selected.row, rows - 1)
        selected.col = Math.min(selected.col, columns - 1)
      }, true)
    })
    for (const alignment of ['left', 'center', 'right'] as const) {
      const label = { left: '左对齐', center: '居中', right: '右对齐' }[alignment]
      const control = button(label, () => modify((table, selected) => { table.alignments[selected.col] = alignment }))
      control.dataset.alignment = alignment
      icon(control, 'align', `当前列${label}`)
    }
    tools.setAttribute('role', 'group')
    button('加行', () => modify((table, selected) => { table.rows.splice(selected.row + 1, 0, table.alignments.map(() => '')); selected.row++ }))
    button('加列', () => modify((table, selected) => { table.alignments.splice(selected.col + 1, 0, 'left'); table.rows.forEach(row => row.splice(selected.col + 1, 0, '')); selected.col++ }))
    button('删行', () => modify((table, selected) => { deleteTableRow(table, selected.row); selected.row = Math.min(selected.row, table.rows.length - 1) }))
    button('删列', () => modify((table, selected) => { deleteTableColumn(table, selected.col); selected.col = Math.min(selected.col, table.alignments.length - 1) }))
    button('行↑', () => modify((table, selected) => { selected.row = moveTableRow(table, selected.row, -1) }))
    button('行↓', () => modify((table, selected) => { selected.row = moveTableRow(table, selected.row, 1) }))
    button('列←', () => modify((table, selected) => { selected.col = moveTableColumn(table, selected.col, -1) }))
    button('列→', () => modify((table, selected) => { selected.col = moveTableColumn(table, selected.col, 1) }))
    const remove = button('删除表格', async () => {
      remove.disabled = true
      try { await this.deleteTable(root, view) }
      finally { remove.disabled = false }
    })
    remove.className = 'live-table-delete'
    button('源码', () => { view.dispatch({ selection: { anchor: ctx.from, head: ctx.to }, userEvent: selectPreviewSource }); view.focus() })
    root.append(tools)
    this.updateAlignmentButtons(root)
    const table = document.createElement('table')
    ctx.table.rows.forEach((row, r) => {
      const tr = table.insertRow()
      row.forEach((value, c) => {
        const cell = document.createElement(r === 0 ? 'th' : 'td')
        const editor = document.createElement('div')
        editor.className = 'live-table-cell-editor'
        const input = document.createElement('textarea')
        input.rows = 1; input.value = value.replace(/<br\s*\/?\s*>/gi, '\n'); input.dataset.row = String(r); input.dataset.col = String(c)
        editor.style.textAlign = ctx.table.alignments[c]
        input.setAttribute('aria-label', `表格第 ${r + 1} 行第 ${c + 1} 列`)
        input.addEventListener('focus', () => {
          ctx.row = r
          ctx.col = c
          this.updateAlignmentButtons(root)
          const anchor = tableRowStart(view.state.doc, ctx.from, r)
          const range = view.state.selection.main
          if (!range.empty || range.head !== anchor) {
            view.dispatch({ selection: { anchor }, userEvent: 'select.table' })
          }
        })
        input.addEventListener('input', () => modify(table => { table.rows[r][c] = input.value }))
        input.addEventListener('paste', event => {
          const text = event.clipboardData?.getData('text/plain') ?? ''
          if (!text.includes('\t') && !text.includes('\n')) return
          event.preventDefault(); event.stopPropagation()
          const next = structuredClone(ctx.table)
          const error = pasteTableCells(next, r, c, text)
          if (error) { this.options.message(error); return }
          modify(table => { Object.assign(table, next) })
        })
        input.addEventListener('keydown', event => {
          if (event.isComposing) return
          if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
            event.preventDefault(); event.stopPropagation()
            if (event.shiftKey || event.key.toLowerCase() === 'y') redo(view); else undo(view)
            return
          }
          if (event.key !== 'Tab' && (event.key !== 'Enter' || event.shiftKey)) return
          event.preventDefault(); event.stopPropagation()
          const width = ctx.table.alignments.length
          let next = r * width + c + (event.shiftKey ? -1 : 1)
          if (next >= ctx.table.rows.length * width) modify(table => { table.rows.push(table.alignments.map(() => '')) })
          next = Math.max(0, next)
          this.scheduleFocus(root, Math.floor(next / width), next % width)
        })
        const preview = document.createElement('div')
        preview.className = 'live-table-cell-preview'
        preview.setAttribute('inert', '')
        editor.append(input, preview)
        cell.append(editor)
        if (r === 0 || c === 0) {
          cell.draggable = true
          cell.addEventListener('dragstart', event => event.dataTransfer?.setData('application/x-moyue-table', JSON.stringify({ from: ctx.from, type: r === 0 ? 'column' : 'row', index: r === 0 ? c : r })))
          cell.addEventListener('dragover', event => event.preventDefault())
          cell.addEventListener('drop', event => {
            const payload = event.dataTransfer?.getData('application/x-moyue-table')
            if (!payload) return
            event.preventDefault(); event.stopPropagation()
            try {
              const item = JSON.parse(payload)
              const target = item.type === 'column' ? c : r
              if (item.from !== ctx.from || !Number.isInteger(item.index)) return
              modify(table => {
                let index = item.index
                const limit = item.type === 'column' ? table.alignments.length : table.rows.length
                if (index < 0 || index >= limit || target >= limit || (item.type === 'row' && (index === 0 || target === 0))) return
                while (index !== target) {
                  const moved = item.type === 'column' ? moveTableColumn(table, index, index < target ? 1 : -1) : moveTableRow(table, index, index < target ? 1 : -1)
                  if (moved === index) break
                  index = moved
                }
              })
            } catch { this.options.message('拖动数据无效，表格未改变') }
          })
        }
        tr.append(cell)
      })
    })
    root.append(table)
    this.updatePreviews(root)
  }
  ignoreEvent() { return true }
}

export function liveMarkdown(options: LiveOptions) {
  const build = (state: EditorState, selection: EditorSelection, revealSource = false) => {
    const touches = (from: number, to: number) => selection.ranges.some(range =>
      (range.empty || revealSource) && range.from <= to && range.to >= from)
    const ranges: Range<Decoration>[] = []
    const replace = (from: number, to: number) => { if (from < to) ranges.push(Decoration.replace({}).range(from, to)) }
    const notes = new Map<string, MdastNode>(), references: MdastNode[] = [], definitions: MdastNode[] = [], replacedNotes: Array<{ from: number; to: number }> = []
    const collect = (node: MdastNode) => {
      if (node.type === 'footnoteDefinition') notes.set(node.identifier ?? '', node)
      if (node.type === 'footnoteReference') references.push(node)
      if (node.type === 'definition') definitions.push(node)
      node.children?.forEach(collect)
    }
    // Parse footnote syntax only when present; ordinary typing stays on the incremental tree.
    if (state.doc.toString().includes('[^') || /(?:^|\n)\s{0,3}\[[^\]]+\]:/.test(state.doc.toString())) collect(markdownProcessor.parse(state.doc.toString()) as unknown as MdastNode)
    const linkDefinitions = new Map<string, string>()
    for (const definition of definitions) {
      if (definition.identifier && definition.url && !linkDefinitions.has(definition.identifier)) {
        linkDefinitions.set(definition.identifier, definition.url)
      }
    }
    const referenceDefinitions = definitions.flatMap(node => {
      const from = node.position?.start?.offset, to = node.position?.end?.offset
      return from === undefined || to === undefined ? [] : [state.doc.sliceString(from, to)]
    }).join('\n')
    const noteIndexes = new Map<string, number>()
    for (const reference of references) {
      const definition = notes.get(reference.identifier ?? '')
      const from = reference.position?.start?.offset, to = reference.position?.end?.offset, definitionFrom = definition?.position?.start?.offset
      if (!definition || from === undefined || to === undefined || definitionFrom === undefined) continue
      const index = noteIndexes.get(reference.identifier!) ?? noteIndexes.size + 1
      noteIndexes.set(reference.identifier!, index)
      if (!touches(from, to)) ranges.push(Decoration.replace({ widget: new FootnoteWidget(index, definitionFrom, nodeText(definition)) }).range(from, to))
    }
    for (const [identifier, definition] of notes) {
      const from = definition.position?.start?.offset, to = definition.position?.end?.offset
      if (from === undefined || to === undefined || touches(from, to)) continue
      const raw = state.doc.sliceString(from, to), content = raw.replace(/^\[\^[^\]]+\]:\s*/, '')
      const index = noteIndexes.get(identifier) ?? identifier
      ranges.push(Decoration.replace({ widget: new PreviewWidget(raw, from, options, true, `> **[${index}]** ${content}`), block: true }).range(from, to))
      replacedNotes.push({ from, to })
    }
    syntaxTree(state).iterate({ enter(node) {
      if (replacedNotes.some(range => node.from >= range.from && node.to <= range.to)) return false
      const raw = state.doc.sliceString(node.from, node.to)
      const active = touches(node.from, node.to)
      if ((node.name === 'Table' || node.name === 'Paragraph') && parseEditableTable(raw)) {
        if (!revealSource || !touches(node.from, node.to)) {
          ranges.push(Decoration.replace({ widget: new TableWidget(raw, node.from, node.to, options), block: true }).range(node.from, node.to))
          return false
        }
      }
      const htmlImage = (node.name === 'HTMLTag' || node.name === 'HTMLBlock') && /^<img\s[^<>]*>\s*$/i.test(raw)
      if ((node.name === 'Image' || htmlImage) && (!active || keepLongImagePreview(raw))) {
        const block = node.name === 'HTMLBlock'
        ranges.push(Decoration.replace({ widget: new PreviewWidget(raw, node.from, options, block, `${raw}\n\n${referenceDefinitions}`, true), block }).range(node.from, node.to))
        return false
      }
      if (node.name === 'TaskMarker' && !active) {
        ranges.push(Decoration.replace({ widget: new TaskWidget(/x/i.test(raw), node.from) }).range(node.from, node.to))
        return false
      }
      if (node.name === 'Blockquote' && node.node.parent?.name !== 'Blockquote') {
        const first = state.doc.lineAt(node.from).number, last = state.doc.lineAt(node.to).number
        for (let number = first; number <= last; number++) {
          const className = ['live-quote-line', number === first ? 'live-quote-start' : '', number === last ? 'live-quote-end' : ''].filter(Boolean).join(' ')
          ranges.push(Decoration.line({ class: className }).range(state.doc.line(number).from))
        }
      }
      if (node.name === 'QuoteMark' || node.name === 'HardBreak') {
        const line = state.doc.lineAt(node.from)
        if (!touches(line.from, line.to)) {
          const followingSpace = node.name === 'QuoteMark' && state.doc.sliceString(node.to, node.to + 1) === ' '
          replace(node.from, Math.min(line.to, node.to + Number(followingSpace)))
        }
      }
      if (node.name === 'ListMark' && node.node.parent) {
        const line = state.doc.lineAt(node.from)
        const editing = touches(node.node.parent.from, node.node.parent.to)
        const task = node.node.parent.getChild('Task')
        const bullet = !editing && !task && /^[-+*]$/.test(raw)
        const prefix = line.text.match(/^([ \t]*)(?:[-+*]|\d+[.)])[ \t]+/)
        const startsLine = prefix && line.from + prefix[1].length === node.from
        if (bullet) {
          let depth = 0
          let ancestor: SyntaxNode | null = node.node.parent
          while (ancestor) {
            if (ancestor.name === 'BulletList' || ancestor.name === 'OrderedList') depth += 1
            ancestor = ancestor.parent
          }
          if (startsLine) {
            ranges.push(Decoration.line({ class: 'live-list-line live-bullet-line', attributes: { style: `--live-list-depth: ${depth}` } }).range(line.from))
          }
          const from = startsLine ? line.from : node.from
          const to = startsLine ? line.from + prefix[0].length : node.to
          ranges.push(Decoration.replace({ widget: new BulletWidget(depth) }).range(from, to))
        } else {
          if (startsLine) {
            const indent = task ? line.text.match(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+\[[ xX]\][ \t]+/)?.[0] ?? prefix[0] : prefix[0]
            ranges.push(Decoration.line({ class: 'live-list-line', attributes: { style: `--live-list-indent: ${indent.replace(/\t/g, '    ').length}ch` } }).range(line.from))
          }
          if (!editing && task) replace(node.from, node.to)
        }
      }
      const heading = node.name.match(/^(?:ATX|Setext)Heading([1-6])$/)
      if (heading) ranges.push(Decoration.line({ class: `live-heading live-h${heading[1]}` }).range(state.doc.lineAt(node.from).from))
      const classes: Record<string, string> = { StrongEmphasis: 'live-strong', Emphasis: 'live-emphasis', Strikethrough: 'live-strike', InlineCode: 'live-code', Link: 'live-link', Subscript: 'live-sub', Superscript: 'live-sup' }
      if (classes[node.name]) ranges.push(Decoration.mark({ class: classes[node.name] }).range(node.from, node.to))
      if (node.name === 'FencedCode') {
        const opening = state.doc.lineAt(node.from)
        const last = state.doc.lineAt(node.to)
        if (state.doc.sliceString(opening.from, node.from).trim()) {
          for (let number = opening.number; number <= last.number; number++) {
            ranges.push(Decoration.line({ class: 'live-code-line' }).range(state.doc.line(number).from))
          }
          return
        }

        const [, closing] = node.node.getChildren('CodeMark')
        const info = node.node.getChild('CodeInfo')
        const language = info && state.doc.sliceString(info.from, info.to).match(/\S+/)
        const label = language?.[0] ?? ''
        const widget = new CodeLanguageWidget(label, language && info ? info.from + language.index! : opening.to, options.selectCodeLanguage)
        if (!active && closing && /^(?:mermaid|mmd)$/i.test(label) && last.number > opening.number + 1) {
          const code = state.sliceDoc(opening.to + 1, last.from - 1)
          ranges.push(Decoration.replace({ widget: new DiagramWidget(raw, node.from, code, options, widget), block: true }).range(node.from, node.to))
          return false
        }

        const fenceSelected = (from: number, to: number) => state.selection.ranges.some(range =>
          (range.empty || revealSource) && range.from <= to && range.to >= from)
        const showOpening = fenceSelected(opening.from, opening.to)
        const showClosing = closing && fenceSelected(last.from, last.to)
        const firstBody = opening.number + 1
        const lastBody = last.number - Number(!!closing)
        const hasBody = firstBody <= lastBody
        const firstVisible = showOpening || !hasBody ? opening.number : firstBody
        const lastVisible = showClosing || !closing ? last.number : Math.max(opening.number, lastBody)
        for (let number = firstVisible; number <= lastVisible; number++) {
          const start = number === firstVisible ? ' live-code-start' : ''
          const end = number === lastVisible ? ' live-code-end' : ''
          ranges.push(Decoration.line({ class: `live-code-line${start}${end}` }).range(state.doc.line(number).from))
        }
        if (!showOpening) {
          if (hasBody) ranges.push(Decoration.replace({ block: true }).range(opening.from, opening.to))
          else replace(opening.from, opening.to)
        }

        if (!showClosing) {
          ranges.push(closing
            ? Decoration.replace({ block: true, widget }).range(last.from, last.to)
            : Decoration.widget({ block: true, side: 1, widget }).range(last.to))
        }
        return false
      }
      if (/^(HeaderMark|EmphasisMark|StrikethroughMark|CodeMark|SubscriptMark|SuperscriptMark)$/.test(node.name) && node.node.parent && !touches(node.node.parent.from, node.node.parent.to)) {
        let to = node.to
        if (node.name === 'HeaderMark' && state.doc.sliceString(to, to + 1) === ' ') to++
        replace(node.from, to)
      }
      if (node.name === 'Link') {
        const [opening, closing] = node.node.getChildren('LinkMark')
        if (opening && closing && opening.to < closing.from && !node.node.getChild('Image')) {
          const label = state.doc.sliceString(opening.to, closing.from)
          const reference = node.node.getChild('LinkLabel')
          const urlNode = node.node.getChild('URL')
          const referenceText = reference ? state.doc.sliceString(reference.from + 1, reference.to - 1) : label
          const rawTarget = urlNode
            ? state.doc.sliceString(urlNode.from, urlNode.to).replace(/^<|>$/g, '')
            : linkDefinitions.get((referenceText || label).trim().replace(/\s+/g, ' ').toLowerCase())
          const target = urlNode && rawTarget && /\\|&[^;\s]+;/.test(rawTarget)
            ? (markdownProcessor.parse(raw) as unknown as MdastNode).children?.[0]?.children?.[0]?.url ?? rawTarget
            : rawTarget
          // Keep link labels in CodeMirror's text layer so each character has a cursor position.
          if (target && !/\\|&[^;\s]+;/.test(label) && !isClipboardImageLink(label, target)) {
            const href = options.resolveUrl(target)
            if (safeUrl(href)) {
              ranges.push(Decoration.mark({ attributes: { 'data-live-link': href } }).range(opening.to, closing.from))
            }
            if (!active) { replace(node.from, opening.to); replace(closing.from, node.to) }
            return
          }
        }
        if (!active) {
          if (!ranges.some(range => range.value.spec.widget && range.from < node.to && range.to > node.from)) {
            ranges.push(Decoration.replace({ widget: new PreviewWidget(raw, node.from, options, false, `${raw}\n\n${referenceDefinitions}`) }).range(node.from, node.to))
          }
          return false
        }
      }
      if (node.name === 'Paragraph') {
        const display = /^(?:\$\$[\s\S]+\$\$|\\\[[\s\S]+\\\])\s*$/.test(raw)
        if (display && !active) {
          ranges.push(Decoration.replace({ widget: new PreviewWidget(raw, node.from, options, true), block: true }).range(node.from, node.to))
          return false
        }
        // Math is source-backed: rendering never serializes MathJax's DOM back to Markdown.
        const math = /(?<![\\$])\$(?![$\s])(?:\\.|[^$\n])+?(?<![\\\s])\$(?!\$)|\\\([^\n]*?\\\)/g
        for (const match of raw.matchAll(math)) {
          const from = node.from + match.index!, to = from + match[0].length
          let ancestor = syntaxTree(state).resolveInner(from, 1)
          let excluded = false
          while (ancestor) {
            if (['InlineCode', 'Link', 'Image', 'HTMLTag', 'Autolink'].includes(ancestor.name)) { excluded = true; break }
            if (!ancestor.parent) break
            ancestor = ancestor.parent
          }
          if (!excluded && !touches(from, to)) ranges.push(Decoration.replace({ widget: new PreviewWidget(match[0], from, options) }).range(from, to))
        }
        for (const match of raw.matchAll(/(?<![\\=])==(?=\S)[^=\n]+?(?<=\S)==(?![=])/g)) {
          const from = node.from + match.index!, to = from + match[0].length
          let ancestor = syntaxTree(state).resolveInner(from, 1)
          let excluded = false
          while (ancestor) {
            if (['InlineCode', 'Link', 'Image', 'HTMLTag', 'Autolink'].includes(ancestor.name)) { excluded = true; break }
            if (!ancestor.parent) break
            ancestor = ancestor.parent
          }
          if (!excluded && !ranges.some(range => range.value.spec.widget && range.from < to && range.to > from)) {
            ranges.push(Decoration.mark({ class: 'live-highlight' }).range(from, to))
            if (!touches(from, to)) { replace(from, from + 2); replace(to - 2, to) }
          }
        }
      }
      if ((node.name === 'Paragraph' || heading) && (raw.includes('**') || raw.includes('__'))) {
        // Only scan text gaps so native emphasis, escapes and inline code keep their own syntax.
        const decorateText = (from: number, to: number) => {
          for (const span of articleStrongSpans(state.doc.sliceString(from, to))) {
            const start = from + span.from, end = from + span.to
            const contentStart = from + span.contentFrom, contentEnd = from + span.contentTo
            if (ranges.some(range => range.value.spec.widget && (range.from < contentStart && range.to > start || range.from < end && range.to > contentEnd))) continue
            ranges.push(Decoration.mark({ class: 'live-strong' }).range(contentStart, contentEnd))
            if (!touches(start, end)) {
              replace(start, contentStart)
              replace(contentEnd, end)
            }
          }
        }
        let from = node.from
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          decorateText(from, child.from)
          from = child.to
        }
        decorateText(from, node.to)
      }
    } })
    return { ranges: Decoration.set(ranges, true), selection, revealSource }
  }
  const decorations = StateField.define({
    create: state => build(state, state.selection),
    update(value, transaction) {
      if (transaction.docChanged) return build(transaction.state, transaction.state.selection)
      // Keep the text the user clicked in place, including on a collapsed mouse selection.
      if (transaction.isUserEvent('select.pointer')) {
        const before = transaction.startState.selection.main
        const after = transaction.state.selection.main
        const onFence = (position: number) => /^ {0,3}(?:`{3,}|~{3,})/.test(transaction.state.doc.lineAt(position).text)
        if (after.empty && (onFence(before.head) || onFence(after.head))) {
          return build(transaction.state, value.selection, value.revealSource)
        }
        return value
      }
      if (transaction.isUserEvent('select.table')) return value
      if (transaction.selection) return build(transaction.state, transaction.state.selection, transaction.isUserEvent(selectPreviewSource))
      return syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
        ? build(transaction.state, value.selection, value.revealSource)
        : value
    },
    provide: field => EditorView.decorations.from(field, value => value.ranges),
  })
  return [decorations, Prec.high(keymap.of([
    { key: 'Mod-a', run: selectCodeBody },
    { key: 'Backspace', run: deleteEmptyCodeBlock },
    { key: 'Delete', run: deleteEmptyCodeBlock },
  ])), EditorView.domEventHandlers({
    click(event) {
      if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) return false
      const link = event.target.closest<HTMLElement>('[data-live-link]')
      if (!link?.dataset.liveLink) return false
      event.preventDefault()
      options.openLink(link.dataset.liveLink)
      return true
    },
  })]
}
