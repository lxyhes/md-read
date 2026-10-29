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

describe('editor initialization', () => {
  it('falls back to editable source without changing the draft when live rendering fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const changes: string[] = []
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(MarkdownEditor, {
      modelValue: '# 原文\n\n内容', live: true, spellcheck: false, typewriter: false, focusMode: false,
      resolveUrl: (url: string) => url, 'onUpdate:modelValue': (value: string) => changes.push(value),
    }) })
    app.mount(host)
    await nextTick()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('已切换到源码编辑')
    const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!
    expect(view.state.doc.toString()).toBe('# 原文\n\n内容')
    expect(changes).toEqual([])
    view.dispatch({ changes: { from: view.state.doc.length, insert: '新增' } })
    expect(changes).toEqual(['# 原文\n\n内容新增'])
    app.unmount()
  })
})
