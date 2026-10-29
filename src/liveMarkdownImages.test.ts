// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { liveMarkdown } from './liveMarkdown'

describe('live image previews', () => {
  it('uses the resolved image URL without rewriting source', () => {
    const source = '![cover](./cover.png)\n\ntext'
    const view = new EditorView({ parent: document.body, state: EditorState.create({
      doc: source,
      selection: { anchor: source.length },
      extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: () => 'blob:reader-image', openLink() {}, message() {} })],
    }) })
    const image = view.dom.querySelector('.live-preview-widget img')
    expect(image?.getAttribute('src')).toBe('blob:reader-image')
    expect(image?.getAttribute('alt')).toBe('cover')
    expect(view.state.doc.toString()).toBe(source)
    view.destroy()
  })
})
