import { EditorState, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { undo, redo } from '@codemirror/commands'
import { renderMarkdownFragment } from './parser'
import { markdownProcessor } from './markdown/fragment'
import { nodeText, type MdastNode } from './markdown/shared'
import { parseEditableTable, serializeEditableTable, moveTableRow, moveTableColumn, deleteTableRow, deleteTableColumn, pasteTableCells, type EditableTable } from './tableEditing'

export interface LiveOptions { resolveUrl: (url: string) => string; openLink: (url: string) => void; message: (text: string) => void; renderDiagram?: (root: HTMLElement, code: string) => () => void }

export function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some(range => range.from <= to && range.to >= from)
}

class PreviewWidget extends WidgetType {
  constructor(readonly source: string, readonly from: number, readonly options: LiveOptions, readonly block = false, readonly previewSource = source) { super() }
  eq(other: PreviewWidget) { return this.source === other.source && this.previewSource === other.previewSource && this.from === other.from }
  toDOM(view: EditorView) {
    const root = document.createElement(this.block ? 'div' : 'span')
    root.className = 'live-preview-widget'
    root.innerHTML = renderMarkdownFragment(this.previewSource, this.options.resolveUrl)
    root.setAttribute('aria-label', '预览内容，双击编辑源码')
    root.addEventListener('dblclick', event => {
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.from, head: this.from + this.source.length }, scrollIntoView: true })
      view.focus()
    })
    root.querySelectorAll<HTMLAnchorElement>('a').forEach(link => link.addEventListener('click', event => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) this.options.openLink(link.getAttribute('href') ?? '')
      else { view.dispatch({ selection: { anchor: this.from, head: this.from + this.source.length } }); view.focus() }
    }))
    return root
  }
  ignoreEvent() { return true }
}

const diagramMounts = new WeakMap<HTMLElement, () => void>()
class DiagramWidget extends WidgetType {
  constructor(readonly source: string, readonly from: number, readonly code: string, readonly options: LiveOptions) { super() }
  eq(other: DiagramWidget) { return this.source === other.source && this.from === other.from }
  toDOM(view: EditorView) {
    const root = document.createElement('div')
    root.className = 'live-diagram-widget'
    const cleanup = this.options.renderDiagram?.(root, this.code)
    if (cleanup) diagramMounts.set(root, cleanup)
    else root.textContent = this.code
    root.addEventListener('dblclick', () => {
      view.dispatch({ selection: { anchor: this.from, head: this.from + this.source.length }, scrollIntoView: true })
      view.focus()
    })
    return root
  }
  destroy(root: HTMLElement) { diagramMounts.get(root)?.() }
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
  toDOM() { const marker = document.createElement('span'); marker.className = 'live-list-bullet'; marker.textContent = '•'; return marker }
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

type TableContext = { from: number; to: number; raw: string; table: EditableTable; row: number; col: number }
type TableDOM = HTMLDivElement & { tableContext: TableContext }

class TableWidget extends WidgetType {
  constructor(readonly raw: string, readonly from: number, readonly to: number, readonly options: LiveOptions) { super() }
  eq(other: TableWidget) { return this.raw === other.raw && this.from === other.from }
  updateDOM(root: TableDOM, view: EditorView) {
    const table = parseEditableTable(this.raw)
    if (!table) return false
    const previous = root.tableContext
    const resize = previous.table.rows.length !== table.rows.length || previous.table.alignments.length !== table.alignments.length
    Object.assign(previous, { from: this.from, to: this.to, raw: this.raw, table })
    if (resize) {
      const wasFocused = root.contains(document.activeElement)
      this.fill(root, view)
      if (wasFocused) requestAnimationFrame(() => this.focus(root, previous.row, previous.col))
    } else root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(input => {
      const value = (table.rows[Number(input.dataset.row)]?.[Number(input.dataset.col)] ?? '').replace(/<br\s*\/?\s*>/gi, '\n')
      if (input.value !== value) input.value = value
      input.style.textAlign = table.alignments[Number(input.dataset.col)]
    })
    return true
  }
  toDOM(view: EditorView) {
    const root = document.createElement('div') as TableDOM
    root.className = 'live-table-widget'
    root.tableContext = { from: this.from, to: this.to, raw: this.raw, table: parseEditableTable(this.raw)!, row: 0, col: 0 }
    this.fill(root, view)
    return root
  }
  focus(root: TableDOM, row: number, col: number) {
    const ctx = root.tableContext
    ctx.row = Math.min(Math.max(0, row), ctx.table.rows.length - 1)
    ctx.col = Math.min(Math.max(0, col), ctx.table.alignments.length - 1)
    root.querySelector<HTMLTextAreaElement>(`textarea[data-row="${ctx.row}"][data-col="${ctx.col}"]`)?.focus()
  }
  commit(root: TableDOM, view: EditorView, change: (table: EditableTable, ctx: TableContext) => void) {
    const ctx = root.tableContext
    if (view.state.doc.sliceString(ctx.from, ctx.to) !== ctx.raw) { this.options.message('表格已变更，请重新选择后编辑'); return }
    const next = structuredClone(ctx.table)
    change(next, ctx)
    const source = serializeEditableTable(next).replace(/\n/g, ctx.raw.includes('\r\n') ? '\r\n' : '\n')
    if (source === ctx.raw) return
    view.dispatch({ changes: { from: ctx.from, to: ctx.to, insert: source }, userEvent: 'input.table' })
  }
  fill(root: TableDOM, view: EditorView) {
    root.replaceChildren()
    const ctx = root.tableContext
    const tools = document.createElement('div')
    tools.className = 'live-table-tools'
    tools.setAttribute('aria-label', '原地表格操作')
    const button = (label: string, action: () => void) => {
      const control = document.createElement('button')
      control.type = 'button'; control.textContent = label
      control.addEventListener('click', action)
      tools.append(control)
    }
    const modify = (change: (table: EditableTable, ctx: TableContext) => void) => this.commit(root, view, change)
    button('加行', () => modify((table, selected) => { table.rows.splice(selected.row + 1, 0, table.alignments.map(() => '')); selected.row++ }))
    button('加列', () => modify((table, selected) => { table.alignments.splice(selected.col + 1, 0, 'left'); table.rows.forEach(row => row.splice(selected.col + 1, 0, '')); selected.col++ }))
    button('删行', () => modify((table, selected) => { deleteTableRow(table, selected.row); selected.row = Math.min(selected.row, table.rows.length - 1) }))
    button('删列', () => modify((table, selected) => { deleteTableColumn(table, selected.col); selected.col = Math.min(selected.col, table.alignments.length - 1) }))
    button('行↑', () => modify((table, selected) => { selected.row = moveTableRow(table, selected.row, -1) }))
    button('行↓', () => modify((table, selected) => { selected.row = moveTableRow(table, selected.row, 1) }))
    button('列←', () => modify((table, selected) => { selected.col = moveTableColumn(table, selected.col, -1) }))
    button('列→', () => modify((table, selected) => { selected.col = moveTableColumn(table, selected.col, 1) }))
    for (const alignment of ['left', 'center', 'right'] as const) button({ left: '左对齐', center: '居中', right: '右对齐' }[alignment], () => modify((table, selected) => { table.alignments[selected.col] = alignment }))
    button('源码', () => { view.dispatch({ selection: { anchor: ctx.from, head: ctx.to } }); view.focus() })
    root.append(tools)
    const table = document.createElement('table')
    ctx.table.rows.forEach((row, r) => {
      const tr = table.insertRow()
      row.forEach((value, c) => {
        const cell = document.createElement(r === 0 ? 'th' : 'td')
        const input = document.createElement('textarea')
        input.rows = 1; input.value = value.replace(/<br\s*\/?\s*>/gi, '\n'); input.dataset.row = String(r); input.dataset.col = String(c)
        input.style.textAlign = ctx.table.alignments[c]
        input.setAttribute('aria-label', `表格第 ${r + 1} 行第 ${c + 1} 列`)
        input.addEventListener('focus', () => { ctx.row = r; ctx.col = c })
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
          requestAnimationFrame(() => this.focus(root, Math.floor(next / width), next % width))
        })
        cell.append(input)
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
  }
  ignoreEvent() { return true }
}

export function liveMarkdown(options: LiveOptions) {
  const build = (state: EditorState): DecorationSet => {
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
      if (!selectionTouches(state, from, to)) ranges.push(Decoration.replace({ widget: new FootnoteWidget(index, definitionFrom, nodeText(definition)) }).range(from, to))
    }
    for (const [identifier, definition] of notes) {
      const from = definition.position?.start?.offset, to = definition.position?.end?.offset
      if (from === undefined || to === undefined || selectionTouches(state, from, to)) continue
      const raw = state.doc.sliceString(from, to), content = raw.replace(/^\[\^[^\]]+\]:\s*/, '')
      const index = noteIndexes.get(identifier) ?? identifier
      ranges.push(Decoration.replace({ widget: new PreviewWidget(raw, from, options, true, `> **[${index}]** ${content}`), block: true }).range(from, to))
      replacedNotes.push({ from, to })
    }
    syntaxTree(state).iterate({ enter(node) {
      if (replacedNotes.some(range => node.from >= range.from && node.to <= range.to)) return false
      const raw = state.doc.sliceString(node.from, node.to)
      const active = selectionTouches(state, node.from, node.to)
      if ((node.name === 'Table' || node.name === 'Paragraph') && parseEditableTable(raw)) {
        // A table remains interactive while the editor caret is elsewhere; select its source to reveal it.
        if (!state.selection.ranges.some(range => !range.empty && range.from <= node.to && range.to >= node.from)) {
          ranges.push(Decoration.replace({ widget: new TableWidget(raw, node.from, node.to, options), block: true }).range(node.from, node.to))
          return false
        }
      }
      if (node.name === 'Image' && !active) {
        ranges.push(Decoration.replace({ widget: new PreviewWidget(raw, node.from, options, false, `${raw}\n\n${referenceDefinitions}`) }).range(node.from, node.to))
        return false
      }
      if (node.name === 'TaskMarker' && !active) {
        ranges.push(Decoration.replace({ widget: new TaskWidget(/x/i.test(raw), node.from) }).range(node.from, node.to))
        return false
      }
      if (node.name === 'ListMark' && node.node.parent && !selectionTouches(state, node.node.parent.from, node.node.parent.to)) {
        if (node.node.parent.getChild('Task')) replace(node.from, node.to)
        else if (/^[-+*]$/.test(raw)) ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
      }
      if (node.name === 'FencedCode' && !active) {
        const diagram = raw.match(/^\s*(`{3,}|~{3,})mermaid[^\n]*\r?\n([\s\S]*?)\r?\n\s*\1\s*$/i)
        if (diagram) {
          ranges.push(Decoration.replace({ widget: new DiagramWidget(raw, node.from, diagram[2], options), block: true }).range(node.from, node.to))
          return false
        }
      }
      const heading = node.name.match(/^(?:ATX|Setext)Heading([1-6])$/)
      if (heading) ranges.push(Decoration.line({ class: `live-heading live-h${heading[1]}` }).range(state.doc.lineAt(node.from).from))
      const classes: Record<string, string> = { StrongEmphasis: 'live-strong', Emphasis: 'live-emphasis', Strikethrough: 'live-strike', InlineCode: 'live-code', Link: 'live-link', Blockquote: 'live-quote', Subscript: 'live-sub', Superscript: 'live-sup' }
      if (classes[node.name]) ranges.push(Decoration.mark({ class: classes[node.name] }).range(node.from, node.to))
      if (node.name === 'FencedCode') {
        const first = state.doc.lineAt(node.from).number, last = state.doc.lineAt(node.to).number
        for (let line = first; line <= last; line++) ranges.push(Decoration.line({ class: 'live-code-line' }).range(state.doc.line(line).from))
      }
      if (/^(HeaderMark|EmphasisMark|StrikethroughMark|CodeMark|SubscriptMark|SuperscriptMark)$/.test(node.name) && node.node.parent && !selectionTouches(state, node.node.parent.from, node.node.parent.to)) {
        let to = node.to
        if (node.name === 'HeaderMark' && state.doc.sliceString(to, to + 1) === ' ') to++
        replace(node.from, to)
      }
      if (node.name === 'Link' && !active) {
        if (!ranges.some(range => range.value.spec.widget && range.from < node.to && range.to > node.from)) {
          ranges.push(Decoration.replace({ widget: new PreviewWidget(raw, node.from, options, false, `${raw}\n\n${referenceDefinitions}`) }).range(node.from, node.to))
          return false
        }
        return false
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
          if (!excluded && !selectionTouches(state, from, to)) ranges.push(Decoration.replace({ widget: new PreviewWidget(match[0], from, options) }).range(from, to))
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
            if (!selectionTouches(state, from, to)) { replace(from, from + 2); replace(to - 2, to) }
          }
        }
      }
    } })
    return Decoration.set(ranges, true)
  }
  return StateField.define<DecorationSet>({
    create: build,
    update(value, transaction) { return transaction.docChanged || transaction.selection || syntaxTree(transaction.startState) !== syntaxTree(transaction.state) ? build(transaction.state) : value },
    provide: field => EditorView.decorations.from(field),
  })
}
