// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { liveMarkdown } from './liveMarkdown'

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
