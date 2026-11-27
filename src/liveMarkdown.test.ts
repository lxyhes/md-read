// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { liveMarkdown } from './liveMarkdown'
import { renderMarkdownFragment } from './parser'

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

it('refocuses a resized table without scrolling away from it', async () => {
  const host = document.createElement('div')
  document.body.append(host)
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
  await new Promise(requestAnimationFrame)

  expect(view.state.doc.toString()).toContain('|  |  |')
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  focus.mockRestore()
  view.destroy()
  host.remove()
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
