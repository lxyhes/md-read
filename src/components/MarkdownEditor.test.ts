// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { EditorView } from '@codemirror/view'
import { StateField } from '@codemirror/state'

vi.mock('../liveMarkdown', () => ({
  liveMarkdown: () => StateField.define({ create() { throw new Error('render failed') }, update(value: null) { return value } }),
}))

import MarkdownEditor from './MarkdownEditor.vue'

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

it.each(['editor wheel', 'outside wheel', 'window blur'])('ends an interrupted pointer selection on %s', trigger => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(MarkdownEditor, {
    modelValue: '短距离拖选', live: false, spellcheck: false, typewriter: false, focusMode: false,
    resolveUrl: (url: string) => url,
  }) })
  app.mount(host)
  // Happy DOM fires selectionchange synchronously inside CodeMirror's DOM updates.
  const stopNativeSelection = (event: Event) => event.stopImmediatePropagation()
  document.addEventListener('selectionchange', stopNativeSelection, true)
  try {
    const content = host.querySelector('.cm-content')!
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!)!
    view.dispatch({ selection: { anchor: 1, head: 4 } })
    content.addEventListener('mousedown', event => event.stopImmediatePropagation(), { capture: true, once: true })
    const release = vi.fn(() => view.dispatch({ selection: { anchor: 2 }, userEvent: 'select.pointer' }))
    document.addEventListener('mouseup', release, { once: true })
    content.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1, clientX: 50 }))
    content.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 53 }))

    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60 })
    if (trigger === 'window blur') window.dispatchEvent(new FocusEvent('blur'))
    else (trigger === 'editor wheel' ? content : document.body).dispatchEvent(wheel)
    expect(release).toHaveBeenCalledOnce()
    expect(wheel.defaultPrevented).toBe(false)
    expect(view.state.selection.main.from).toBe(1)
    expect(view.state.selection.main.to).toBe(4)

    const move = new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1 })
    content.dispatchEvent(move)
    expect(move.defaultPrevented).toBe(true)
    content.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 0 }))
    const nextMove = new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1 })
    content.dispatchEvent(nextMove)
    expect(nextMove.defaultPrevented).toBe(false)
  } finally {
    document.removeEventListener('selectionchange', stopNativeSelection, true)
    app.unmount()
  }
})

describe('editor initialization', () => {
  it('falls back to editable source without changing the draft when live rendering fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const changes: string[] = []
    const onCaret = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(MarkdownEditor, {
      modelValue: '# 原文\n\n内容', live: true, spellcheck: false, typewriter: false, focusMode: false,
      resolveUrl: (url: string) => url, 'onUpdate:modelValue': (value: string) => changes.push(value), onCaret,
    }) })
    app.mount(host)
    await nextTick()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('已切换到源码编辑')
    const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!
    expect(view.state.doc.toString()).toBe('# 原文\n\n内容')
    expect(changes).toEqual([])
    const end = view.state.doc.length
    view.dispatch({ changes: { from: end, insert: '新增' }, selection: { anchor: end + 2 } })
    expect(changes).toEqual(['# 原文\n\n内容新增'])
    expect(onCaret).toHaveBeenLastCalledWith({ offset: end + 2, line: 3, column: 5 })
    app.unmount()
  })
})

it.each(['pointer selection', 'wheel'])('cancels pending typewriter centering on %s', async trigger => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(MarkdownEditor, {
    modelValue: 'First\nSecond', live: false, spellcheck: false, typewriter: true, focusMode: false,
    resolveUrl: (url: string) => url,
  }) })
  app.mount(host)
  const stopNativeSelection = (event: Event) => event.stopImmediatePropagation()
  document.addEventListener('selectionchange', stopNativeSelection, true)
  const scroll = vi.spyOn(EditorView, 'scrollIntoView')
  try {
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!)!
    view.dispatch({ selection: { anchor: 1 } })
    if (trigger === 'wheel') view.scrollDOM.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50 }))
    else view.dispatch({ selection: { anchor: 6 }, userEvent: 'select.pointer' })
    await new Promise(requestAnimationFrame)
    expect(scroll).not.toHaveBeenCalled()
    view.dispatch({ selection: { anchor: 8 } })
    await new Promise(requestAnimationFrame)
    expect(scroll).toHaveBeenCalledWith(8, { y: 'center' })
  } finally {
    document.removeEventListener('selectionchange', stopNativeSelection, true)
    app.unmount()
  }
})
