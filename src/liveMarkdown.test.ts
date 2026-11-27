// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, undo } from '@codemirror/commands'
import { liveMarkdown } from './liveMarkdown'
import { editorCodeHighlight } from './editorCodeHighlight'
import { renderMarkdownFragment } from './parser'
import { parseEditableTable } from './tableEditing'
import { activeAppDialog, resolveAppDialog } from './appDialog'

it.each([
  ['Backspace', '```yaml', '\n```\n\n结尾', '开头\n\n结尾'],
  ['Delete', '~~~yaml', '', '开头\n\n'],
])('only removes the fence on the second %s, once its body is empty', (key, opening, tail, expected) => {
  const host = document.createElement('div')
  const start = `开头\n\n${opening}\n`
  const code = 'name: sample\nport: 8080'
  const source = start + code + tail
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      selection: { anchor: start.length + 2 },
      extensions: [markdown({ base: markdownLanguage }), keymap.of(defaultKeymap), history(), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    }),
    parent: host,
  })
  const press = (key: string, ctrlKey = false) => runScopeHandlers(view, new KeyboardEvent('keydown', { key, ctrlKey }), 'editor')
  try {
    expect(press('a', true)).toBe(true)
    expect(press(key)).toBe(true)
    expect(view.state.doc.toString()).toBe(start + tail)
    expect(host.querySelector('.live-code-footer')).not.toBeNull()
    expect(press(key)).toBe(true)
    expect(view.state.doc.toString()).toBe(expected)
    expect(host.querySelector('.live-code-footer')).toBeNull()
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(start + tail)
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(source)
  } finally {
    view.destroy()
  }
})

it('keeps normal Backspace behavior when there are still spaces or code in the block', () => {
  const prefix = '开头\n\n```yaml\n'
  const view = new EditorView({
    state: EditorState.create({
      doc: prefix + ' \n```',
      selection: { anchor: prefix.length + 1 },
      extensions: [markdown({ base: markdownLanguage }), keymap.of(defaultKeymap), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    }),
    parent: document.createElement('div'),
  })
  try {
    expect(runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Backspace' }), 'editor')).toBe(true)
    expect(view.state.doc.toString()).toBe(prefix + '\n```')
  } finally {
    view.destroy()
  }
})

it.each([
  ['正文\n\n```yaml\nkey: value\n  next: 1\n```\n\n结尾', 'key', 'key: value\n  next: 1'],
  ['正文\n\n~~~yaml\nkey: value\n', 'key', 'key: value\n'],
  ['正文\n\n```yaml\n\n```\n\n结尾', '\n```\n', ''],
  ['正文\n\n```mermaid\nflowchart TD\nA --> B\n```', 'flowchart', 'flowchart TD\nA --> B'],
])('scopes Select All to the current fenced code body', (source, start, expected) => {
  const host = document.createElement('div')
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      selection: { anchor: source.indexOf(start) + Math.min(start.length - 1, 2) },
      extensions: [markdown({ base: markdownLanguage }), keymap.of(defaultKeymap), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    }),
    parent: host,
  })
  const selectAll = () => runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }), 'editor')
  try {
    for (let press = 0; press < 2; press++) {
      expect(selectAll()).toBe(true)
      const { from, to } = view.state.selection.main
      expect(view.state.sliceDoc(from, to)).toBe(expected)
      expect(host.querySelector('.live-diagram-widget')).toBeNull()
    }
    view.dispatch({ selection: { anchor: 1 } })
    for (let press = 0; press < 2; press++) {
      expect(selectAll()).toBe(true)
      expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(source)
    }
  } finally {
    view.destroy()
  }
})

it.each([
  ['~~~yaml title', 'name: sample\nport: 8080\n', '~~~', 'yaml', 'json'],
  ['```', '', '```', '代码语言', 'yaml'],
  ['```yaml', 'name: sample', '', 'yaml', 'json'],
])('renders an editable code block with a language button for %s', (opening, body, closing, label, language) => {
  const source = `正文\n\n${opening}\n${body}${closing}`
  const host = document.createElement('div')
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), history(), liveMarkdown({ resolveUrl: value => value, openLink() {}, message() {} })],
    parent: host,
  })
  try {
    const button = () => host.querySelector<HTMLButtonElement>('.live-code-footer button')!
    const lines = () => [...host.querySelectorAll('.live-code-line')].map(line => line.textContent)
    expect(button().textContent).toBe(label)
    expect(lines()).toEqual(body ? body.trimEnd().split('\n') : [''])
    if (body) {
      view.dispatch({ selection: { anchor: source.indexOf(body) + 2 } })
      expect(lines()[0]).toBe('name: sample')
    }
    button().click()
    const input = host.querySelector<HTMLInputElement>('.live-code-language-search')!
    input.value = language
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    const updatedOpening = label === '代码语言' ? opening + language : opening.replace(label, language)
    expect(view.state.doc.toString()).toBe(source.replace(opening, updatedOpening))
    expect(button().textContent).toBe(language)
    expect(lines()).not.toContain(updatedOpening)
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(source)
  } finally {
    view.destroy()
  }
})

it('filters language names and aliases, supports arrow navigation, and cancels on Escape', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const view = new EditorView({
    doc: '正文\n\n```yaml\nname: sample\n```',
    extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    parent: host,
  })
  try {
    const button = host.querySelector<HTMLButtonElement>('.live-code-language-trigger')!
    button.click()
    const input = host.querySelector<HTMLInputElement>('.live-code-language-search')!
    input.value = 'j'
    input.dispatchEvent(new Event('input'))
    const list = document.getElementById(input.getAttribute('aria-controls')!)!
    expect([...list.children].map(option => option.textContent)).toEqual(expect.arrayContaining(['jade', 'java', 'javascript', 'jinja2', 'js']))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(list.querySelector('[aria-selected="true"]')?.textContent).toBe('java')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(list.isConnected).toBe(false)
    expect(view.state.doc.toString()).toContain('```yaml')
  } finally {
    view.destroy()
    host.remove()
  }
})

it('highlights selected language syntax in editable source positions', async () => {
  const host = document.createElement('div')
  const source = '正文\n\n```js\nconst value = "语法";\nreturn value;\n```'
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), editorCodeHighlight, liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    parent: host,
  })
  try {
    const tokens = () => [...host.querySelectorAll('.editor-code-token')]
    await vi.waitFor(() => expect(tokens().map(token => token.textContent)).toContain('return'))
    const token = tokens().find(token => token.textContent === 'return')!
    expect(view.posAtDOM(token.firstChild!, 2)).toBe(source.indexOf('return') + 2)
    expect(token.getAttribute('style')).toContain('--code-token-dark')

    host.querySelector<HTMLButtonElement>('.live-code-language-trigger')!.click()
    const input = host.querySelector<HTMLInputElement>('.live-code-language-search')!
    input.value = 'text'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(tokens()).toHaveLength(0))
    expect(view.state.doc.toString()).toBe(source.replace('```js', '```text'))
  } finally {
    view.destroy()
  }
})

it('keeps tables and heading markup stable across pointer and keyboard selections', () => {
  const host = document.createElement('div')
  const source = '正文\n\n## 标题\n\n| 步骤 | 说明 |\n| --- | --- |\n| 读取 | 内容 |\n\n结尾'
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink: () => {}, message: () => {} })],
    parent: host,
  })

  const table = host.querySelector('.live-table-widget')!
  expect(table).not.toBeNull()
  expect(host.querySelector('.live-heading')?.textContent).toBe('标题')
  view.dispatch({ selection: { anchor: 1 }, userEvent: 'select.pointer' })
  const head = source.indexOf('读取')
  view.dispatch({ selection: { anchor: 1, head }, userEvent: 'select.pointer' })
  expect(view.state.selection.main.head).toBe(head)
  expect(host.querySelector('.live-table-widget')).toBe(table)
  expect(host.querySelector('.live-heading')?.textContent).toBe('标题')

  view.dispatch({ selection: { anchor: 1, head: source.length }, userEvent: 'select' })
  expect(host.querySelector('.live-table-widget')).toBe(table)
  expect(host.querySelector('.live-heading')?.textContent).toBe('标题')
  expect(view.state.sliceDoc(1, source.length)).toContain('| 读取 | 内容 |')

  Array.from(table.querySelectorAll('button')).find(button => button.textContent === '源码')!.click()
  expect(host.querySelector('.live-table-widget')).toBeNull()
  expect(host.querySelector('.cm-content')?.textContent).toContain('| 读取 | 内容 |')
  view.destroy()
})

it('previews table dimensions, aligns the current column, and confirms populated cells before shrinking', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const source = '| A | B |\n| :--- | :--- |\n| first | second |'
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), history(), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    parent: host,
  })
  const open = () => {
    host.querySelector<HTMLButtonElement>('[aria-label="调整表格尺寸"]')!.click()
    return document.querySelector<HTMLFormElement>('.live-table-size-picker')!
  }
  const table = () => parseEditableTable(view.state.doc.toString())!
  try {
    const picker = open()
    const expand = picker.querySelector<HTMLButtonElement>('[aria-label="3 列 4 行"]')!
    expand.dispatchEvent(new Event('pointerenter'))
    expect(picker.querySelectorAll('.is-preview')).toHaveLength(12)
    expect(view.state.doc.toString()).toBe(source)
    expand.click()
    expect(picker.isConnected).toBe(false)
    expect(table().rows).toEqual([['A', 'B', ''], ['first', 'second', ''], ['', '', ''], ['', '', '']])

    await vi.waitFor(() => expect(host.querySelectorAll('tr')).toHaveLength(4))
    host.querySelector<HTMLTextAreaElement>('textarea[data-row="0"][data-col="1"]')!.focus()
    const center = host.querySelector<HTMLButtonElement>('[data-alignment="center"]')!
    center.click()
    expect(table().alignments).toEqual(['left', 'center', 'left'])
    expect(center.getAttribute('aria-pressed')).toBe('true')

    const shrink = open()
    shrink.querySelector<HTMLButtonElement>('[aria-label="1 列 1 行"]')!.click()
    expect(shrink.querySelector('[role="status"]')?.textContent).toContain('3 个')
    expect(table().rows).toHaveLength(4)
    shrink.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(table().rows).toEqual([['A']])
    expect(undo(view)).toBe(true)
    expect(table().rows[1]).toEqual(['first', 'second', ''])
    expect(table().alignments).toEqual(['left', 'center', 'left'])
  } finally {
    view.destroy()
    host.remove()
  }
})

it('supports keyboard preview and escaping the table dimension grid', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const source = '| A | B |\n| :--- | :--- |\n| first | second |'
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    parent: host,
  })
  try {
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="调整表格尺寸"]')!
    trigger.click()
    const picker = document.querySelector('.live-table-size-picker')!
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('2 列 2 行'))
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    expect(document.activeElement?.getAttribute('aria-label')).toBe('3 列 2 行')
    expect(picker.querySelectorAll('.is-preview')).toHaveLength(6)
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(picker.isConnected).toBe(false)
    expect(document.activeElement).toBe(trigger)
    expect(view.state.doc.toString()).toBe(source)
  } finally {
    view.destroy()
    host.remove()
  }
})

it('confirms deleting just the chosen table and restores it on undo', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const table = '| 第一列 |\n| --- |\n| 内容 |'
  const other = '| 另一张表 |\n| --- |\n| 保留 |'
  const source = `开头\n\n${table}\n\n中间\n\n${other}`
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), history(), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    parent: host,
  })
  try {
    const remove = host.querySelector<HTMLButtonElement>('.live-table-delete')!
    remove.click()
    expect(activeAppDialog.value).toMatchObject({ kind: 'confirm', destructive: true })
    expect(view.state.doc.toString()).toBe(source)
    resolveAppDialog(false)
    await vi.waitFor(() => expect(remove.disabled).toBe(false))
    expect(view.state.doc.toString()).toBe(source)

    remove.click()
    resolveAppDialog(true)
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(`开头\n\n中间\n\n${other}`))
    expect(host.querySelectorAll('.live-table-widget')).toHaveLength(1)
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(source)
  } finally {
    resolveAppDialog(false)
    view.destroy()
    host.remove()
  }
})

it('keeps formatted text in place when a mouse click moves the caret', () => {
  const host = document.createElement('div')
  const source = 'Start\n\n## Heading\n\nPlain **bold** text\n\n- List'
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink() {}, message() {} })],
    parent: host,
  })
  const lines = () => [...host.querySelectorAll('.cm-line')].map(line => line.textContent)
  try {
    const before = lines()
    expect(before).toContain('Heading')
    expect(before).toContain('Plain bold text')
    expect(before).toContain('•List')
    for (const text of ['Heading', 'bold', 'List']) {
      const anchor = source.indexOf(text) + 2
      view.dispatch({ selection: { anchor }, userEvent: 'select.pointer' })
      expect(view.state.selection.main.head).toBe(anchor)
      expect(lines()).toEqual(before)
    }
    view.dispatch({ selection: { anchor: source.indexOf('bold') + 2 }, userEvent: 'select' })
    expect(lines()).toContain('Plain **bold** text')
  } finally {
    view.destroy()
  }
})

it.each([
  ['[链接文字](https://example.test?a=1\\&b=2)', 'https://example.test?a=1&b=2'],
  ['[链接文字][ref]\n\n[ref]: https://example.test', 'https://example.test'],
])('gives link labels editable text positions and keeps modified clicks opening the link', (link, target) => {
  const host = document.createElement('div')
  const source = `Start\n\n${link}`
  const openLink = vi.fn()
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink, message() {} })],
    parent: host,
  })
  try {
    const label = host.querySelector<HTMLElement>('[data-live-link]')!
    expect(label.textContent).toBe('链接文字')
    const position = view.posAtDOM(label.firstChild!, 2)
    expect(position).toBe(source.indexOf('链接文字') + 2)
    label.click()
    expect(openLink).not.toHaveBeenCalled()
    label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    expect(openLink).toHaveBeenCalledWith(target)
    view.dispatch({ selection: { anchor: position }, userEvent: 'select.pointer' })
    view.dispatch(view.state.replaceSelection('新'))
    expect(view.state.doc.toString()).toBe(source.replace('链接文字', '链接新文字'))
  } finally {
    view.destroy()
  }
})

it('renders quote bars and hard breaks without exposing inactive Markdown markers', () => {
  const host = document.createElement('div')
  const source = '> 引用\\\n> 第二行\n\n正文'
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink: () => {}, message: () => {} })],
      selection: { anchor: source.length },
    }),
    parent: host,
  })

  expect(Array.from(host.querySelectorAll('.live-quote-line'), line => line.textContent)).toEqual(['引用', '第二行'])
  view.dispatch({ selection: { anchor: 2 } })
  expect(host.querySelector('.live-quote-start')?.textContent).toBe('> 引用\\')
  expect(view.state.doc.toString()).toBe(source)
  view.destroy()
})

it('uses list depth for preview bullets and restores the original prefix while editing', () => {
  const host = document.createElement('div')
  const source = '- 一级\n  - 二级\n    - 三级\n\n正文'
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink: () => {}, message: () => {} })],
      selection: { anchor: source.length },
    }),
    parent: host,
  })

  const bullets = Array.from(host.querySelectorAll<HTMLElement>('.live-bullet-line'))
  expect(bullets.map(line => line.style.getPropertyValue('--live-list-depth'))).toEqual(['1', '2', '3'])
  expect(bullets.map(line => line.textContent)).toEqual(['•一级', '二级', '•三级'])
  expect(host.querySelector('.live-list-bullet-hollow')?.closest('.cm-line')).toBe(bullets[1])

  view.dispatch({ selection: { anchor: source.indexOf('二级') + 1 } })
  expect(host.querySelectorAll('.cm-line')[1]?.textContent).toBe('  - 二级')
  expect(view.state.doc.toString()).toBe(source)
  view.destroy()
})

it.each([' ', ''])('renders Chinese quoted bold in the editor with trailing space %j', space => {
  const host = document.createElement('div')
  const content = '「每天都做 + 规则固定 + 做错有代价」'
  const sentence = `凡是**${content}${space}**的话`
  const source = `${sentence}\n\n**普通粗体** 和 \`**代码 **\``
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink: () => {}, message: () => {} })],
      selection: { anchor: source.length },
    }),
    parent: host,
  })

  expect(renderMarkdownFragment(sentence)).toContain(`<strong>${content}</strong>`)
  expect(host.querySelector('.cm-line')?.textContent).toBe(`凡是${content}的话`)
  expect(Array.from(host.querySelectorAll('.live-strong'), element => element.textContent)).toEqual([content, '普通粗体'])
  expect(host.querySelector('.live-code')?.textContent).toContain('**代码 **')

  view.dispatch({ selection: { anchor: sentence.indexOf(content) + 1 } })
  expect(host.querySelector('.cm-line')?.textContent).toBe(sentence)
  expect(view.state.doc.toString()).toBe(source)
  view.destroy()
})

describe('rich Markdown image previews', () => {
  it('renders a standalone Quark clipboard link as an image', () => {
    const host = document.createElement('div')
    const source = '[image](https://img-view-c-sz.drive.quark.cn/a/preview?auth_key=demo\\&sp=100)\n\n正文'
    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink: () => {}, message: () => {} })],
        selection: { anchor: source.length },
      }),
      parent: host,
    })

    expect(host.querySelector('.live-preview-widget img')).not.toBeNull()
    expect(host.querySelector('a.live-link')).toBeNull()
    view.destroy()
  })

  it('keeps long embedded image sources compact while editing', () => {
    const source = `![截图](data:image/png;base64,${'A'.repeat(400)})`
    const host = document.createElement('div')
    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink: () => {}, message: () => {} })],
        selection: { anchor: source.indexOf('AAAA') },
      }),
      parent: host,
    })

    expect(host.querySelector('.live-preview-widget img')).not.toBeNull()
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('data:image/png;base64')
    view.destroy()
  })
})

it('renders table cell formatting and refreshes it after a source edit', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const view = new EditorView({
    doc: '| **配置项** | 当前值 |\n| --- | ---: |\n| 分块方式 | 第一行<br>第二行 |\n\n正文',
    extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    parent: host,
  })
  try {
    const input = host.querySelector<HTMLTextAreaElement>('textarea[data-row="0"][data-col="0"]')!
    const cell = input.closest('th')!
    expect(cell.querySelector('.live-table-cell-preview strong')?.textContent).toBe('配置项')
    expect(host.querySelector('td:nth-child(2) .live-table-cell-preview br')).not.toBeNull()
    input.focus()
    expect(input.value).toBe('**配置项**')
    input.value = '*新名称*'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.activeElement).toBe(input)
    expect(view.state.doc.toString()).toContain('| *新名称* | 当前值 |')
    input.blur()
    expect(cell.querySelector('.live-table-cell-preview em')?.textContent).toBe('新名称')
  } finally {
    view.destroy()
    host.remove()
  }
})

it.each([false, true])('refocuses a resized table only while focus has stayed there (left: %s)', async left => {
  const host = document.createElement('div')
  document.body.append(host)
  const outside = document.createElement('button')
  document.body.append(outside)
  const source = '| 场景 | 安全 |\n| --- | --- |\n| GET | 是 |\n\n正文'
  const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink: () => {}, message: () => {} })],
      selection: { anchor: source.length },
    }),
    parent: host,
  })

  host.querySelector<HTMLTextAreaElement>('textarea[data-row="1"][data-col="0"]')?.focus()
  Array.from(host.querySelectorAll<HTMLButtonElement>('.live-table-tools button')).find(button => button.textContent === '加行')?.click()
  if (left) outside.focus()
  await new Promise(requestAnimationFrame)

  expect(view.state.doc.toString()).toContain('|  |  |')
  if (left) expect(document.activeElement).toBe(outside)
  else expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  focus.mockRestore()
  view.destroy()
  host.remove()
  outside.remove()
})

it('focuses the new row when Tab extends a table', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const view = new EditorView({
    doc: '| 第 1 列 | 第 2 列 |\n| --- | --- |\n| 左 | 右 |\n\n正文',
    extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })],
    parent: host,
  })
  try {
    const cell = host.querySelector<HTMLTextAreaElement>('textarea[data-row="1"][data-col="1"]')!
    cell.focus()
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    await new Promise(requestAnimationFrame)
    expect(document.activeElement).toBe(host.querySelector('textarea[data-row="2"][data-col="0"]'))
  } finally {
    view.destroy()
    host.remove()
  }
})

it('tracks the focused table row after an outline jump and returns to the clicked paragraph', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const source = '# First\n\n## Table section\n\n| Title | Value |\n| --- | --- |\n| First | One |\n| Second | Two |\n\nNext paragraph'
  const view = new EditorView({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: value => value, openLink() {}, message() {} })],
    parent: host,
  })
  try {
    view.dispatch({ selection: { anchor: source.indexOf('## Table section') }, userEvent: 'select.outline' })
    view.dispatch({ selection: { anchor: 0, head: source.length }, userEvent: 'select.pointer' })
    const cell = host.querySelector<HTMLTextAreaElement>('textarea[data-row="2"][data-col="1"]')!
    cell.focus()
    expect(document.activeElement).toBe(cell)
    const currentLine = () => view.state.doc.lineAt(view.state.selection.main.head).text
    expect(currentLine()).toContain('| Second | Two |')
    cell.value = 'Updated'
    cell.dispatchEvent(new Event('input', { bubbles: true }))
    expect(currentLine()).toContain('| Second | Updated |')
    expect(document.activeElement).toBe(cell)
    view.focus()
    const next = view.state.doc.toString().indexOf('Next paragraph') + 2
    view.dispatch({ selection: { anchor: next }, userEvent: 'select.pointer' })
    expect(view.state.selection.main.head).toBe(next)
    expect(currentLine()).toBe('Next paragraph')
  } finally {
    view.destroy()
    host.remove()
  }
})
