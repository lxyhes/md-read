// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { liveMarkdown } from './liveMarkdown'

describe('live image previews', () => {
  it.each(['![cover](./cover.png)', '<img src="./cover.png" alt="cover" width="50%">'])('uses the resolved URL without rewriting %s', (reference) => {
    const source = `${reference}\n\ntext`
    const view = new EditorView({ parent: document.body, state: EditorState.create({
      doc: source,
      selection: { anchor: source.length },
      extensions: [markdown({ base: markdownLanguage }), liveMarkdown({ resolveUrl: () => 'blob:reader-image', openLink() {}, message() {} })],
    }) })
    const image = view.dom.querySelector('.live-preview-widget img')
    expect(image?.getAttribute('src')).toBe('blob:reader-image')
    expect(image?.getAttribute('alt')).toBe('cover')
    expect(image?.closest('[data-image-offset]')?.getAttribute('data-image-offset')).toBe('0')
    expect(view.state.doc.toString()).toBe(source)
    view.destroy()
  })
})
