import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { history, undo } from '@codemirror/commands'
import { liveMarkdown } from './liveMarkdown'

function editor(source: string) {
  const field = liveMarkdown({ resolveUrl: url => url, openLink() {}, message() {} })
  const state = EditorState.create({ doc: source, selection: { anchor: source.length }, extensions: [EditorState.lineSeparator.of('\n'), markdown({ base: markdownLanguage }), history(), field] })
  const widgets = (state: EditorState) => {
    const result: Array<{ from: number; to: number; kind: string }> = []
    state.field(field).between(0, state.doc.length, (from, to, value) => {
      if (value.spec.widget) result.push({ from, to, kind: value.spec.widget.constructor.name })
    })
    return result
  }
  return { state, field, widgets }
}

describe('source-backed live Markdown', () => {
  it('renders inline math, block math, images, diagrams, tables and tasks without rewriting source', () => {
    const source = '# 标题\r\n\r\n**粗体** $x^2$\r\n\r\n$$\r\n\\frac{a}{b}\r\n$$\r\n\r\n![图](./图.png)\r\n\r\n```mermaid\r\ngraph TD; A-->B\r\n```\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 一 | 二 |\r\n\r\n- [ ] 待办\r\n\r\n尾段'
    const { state, widgets } = editor(source)
    expect(state.doc.toString()).toBe(source)
    expect(widgets(state).map(item => item.kind)).toEqual(expect.arrayContaining(['PreviewWidget', 'DiagramWidget', 'TableWidget', 'TaskWidget']))
    expect(widgets(state).filter(item => item.kind === 'PreviewWidget')).toHaveLength(3)
  })

  it('does not interpret dollars inside code, links, images or escaped dollars', () => {
    const { state, widgets } = editor('`$code$` [链接](https://example.com/$path$) ![图](./$file$.png) \\$literal$ $real$\n\n尾段')
    const math = widgets(state).filter(item => state.doc.sliceString(item.from, item.to).startsWith('$'))
    expect(math.map(item => state.doc.sliceString(item.from, item.to))).toEqual(['$real$'])
  })

  it('reveals the exact math source at the caret, then renders again after leaving', () => {
    const { state, widgets } = editor('$x^2$\n\n尾段')
    expect(widgets(state)).toHaveLength(1)
    const active = state.update({ selection: { anchor: 2 } }).state
    expect(widgets(active)).toHaveLength(0)
    expect(active.doc.toString()).toBe(state.doc.toString())
    expect(widgets(active.update({ selection: { anchor: active.doc.length } }).state)).toHaveLength(1)
  })

  it('renders repeated footnote references and reveals the original definition at the caret', () => {
    const source = '注[^n]，再次引用[^n]。\r\n\r\n[^n]: **真实脚注**\r\n\r\n尾段'
    const { state, widgets } = editor(source)
    expect(widgets(state).filter(item => item.kind === 'FootnoteWidget')).toHaveLength(2)
    expect(widgets(state).some(item => item.kind === 'PreviewWidget' && source.slice(item.from, item.to).startsWith('[^n]:'))).toBe(true)
    const active = state.update({ selection: { anchor: source.indexOf('[^n]:') } }).state
    expect(widgets(active).filter(item => item.kind === 'PreviewWidget')).toHaveLength(0)
    expect(active.doc.toString()).toBe(source)
  })

  it('renders reference images and links without rewriting their definitions', () => {
    const source = '![图][cover]\n\n[链接][site]\n\n[cover]: <图 片.png> "图注"\n[site]: https://example.com\n\n尾段'
    const { state, widgets } = editor(source)
    expect(widgets(state).filter(item => item.kind === 'PreviewWidget').map(item => source.slice(item.from, item.to))).toEqual(['![图][cover]', '[链接][site]'])
    expect(state.doc.toString()).toBe(source)
  })

  it('reveals a selected table and keeps it source-backed through undo', () => {
    const source = '| A | B |\n| --- | --- |\n| 一 | 二 |\n\n尾段'
    const { state, widgets } = editor(source)
    expect(widgets(state).some(item => item.kind === 'TableWidget')).toBe(true)
    const active = state.update({ selection: { anchor: 0, head: 9 } }).state
    expect(widgets(active).some(item => item.kind === 'TableWidget')).toBe(false)
    let changed = state.update({ changes: { from: source.indexOf('二'), to: source.indexOf('二') + 1, insert: '原地修改' } }).state
    expect(undo({ state: changed, dispatch: transaction => { changed = transaction.state } })).toBe(true)
    expect(changed.doc.toString()).toBe(source)
  })
})
