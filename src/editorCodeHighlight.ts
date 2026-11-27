import { StateEffect, type Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'
import { codeLanguageLoader, normalizeCodeLanguage } from './codeLanguages'

const codeColors = StateEffect.define<DecorationSet>()

async function highlightVisibleCode(view: EditorView) {
  const { state, viewport } = view
  const blocks: Array<{ from: number; code: string; lang: string }> = []
  syntaxTree(state).iterate({
    from: viewport.from,
    to: viewport.to,
    enter(node) {
      if (node.name !== 'FencedCode') return
      const info = node.node.getChild('CodeInfo')
      if (!info) return false
      const lang = normalizeCodeLanguage(state.sliceDoc(info.from, info.to).trim().split(/\s+/, 1)[0])
      if (!codeLanguageLoader(lang)) return false
      const parts = node.node.getChildren('CodeText')
      if (!parts.length) return false
      const from = parts[0].from
      let previous = from
      const code = parts.map(part => {
        // Blank out quote prefixes while keeping token positions aligned with the Markdown.
        const gap = state.sliceDoc(previous, part.from).replace(/[^\n]/g, ' ')
        previous = part.to
        return gap + state.sliceDoc(part.from, part.to)
      }).join('')
      blocks.push({ from, code, lang })
      return false
    },
  })
  if (!blocks.length) return Decoration.none
  const { codeTokens } = await import('./highlight')
  const ranges: Range<Decoration>[] = []
  await Promise.all(blocks.map(async ({ from, code, lang }) => {
    for (const line of await codeTokens(code, lang)) {
      for (const token of line) {
        if (!token.content.trim()) continue
        const start = from + token.offset
        const end = start + token.content.length
        if (end <= viewport.from || start >= viewport.to) continue
        const light = token.variants.light?.color ?? 'var(--ink)'
        const dark = token.variants.dark?.color ?? 'var(--ink)'
        ranges.push(Decoration.mark({
          class: 'editor-code-token',
          attributes: { style: `--code-token-light:${light};--code-token-dark:${dark}` },
        }).range(start, end))
      }
    }
  }))
  return Decoration.set(ranges, true)
}

export const editorCodeHighlight = ViewPlugin.fromClass(class {
  decorations = Decoration.none
  private request = 0

  constructor(view: EditorView) { this.refresh(view) }

  update(update: ViewUpdate) {
    if (update.docChanged) this.decorations = this.decorations.map(update.changes)
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(codeColors)) this.decorations = effect.value
      }
    }
    if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.refresh(update.view)
    }
  }

  private refresh(view: EditorView) {
    const request = ++this.request
    void highlightVisibleCode(view).then(decorations => {
      if (request === this.request && (decorations !== Decoration.none || this.decorations !== Decoration.none)) {
        view.dispatch({ effects: codeColors.of(decorations) })
      }
    }).catch(() => {
      if (request === this.request && this.decorations !== Decoration.none) view.dispatch({ effects: codeColors.of(Decoration.none) })
    })
  }

  destroy() { this.request++ }
}, { decorations: plugin => plugin.decorations })
