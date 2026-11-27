import { isolateHistory } from '@codemirror/commands'
import { WidgetType, type EditorView } from '@codemirror/view'
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'
import { searchCodeLanguages } from './codeLanguages'

let nextPickerId = 0
const pickerCleanup = new WeakMap<HTMLElement, () => void>()

export class CodeLanguageWidget extends WidgetType {
  constructor(readonly language: string, readonly from: number, readonly onSelect?: (language: string) => void) { super() }
  eq(other: CodeLanguageWidget) { return this.language === other.language && this.from === other.from }

  toDOM(view: EditorView) {
    const footer = document.createElement('div')
    footer.className = 'live-code-footer'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'live-code-language-trigger'
    button.textContent = this.language || '代码语言'
    button.setAttribute('aria-label', this.language ? `修改代码语言：${this.language}` : '设置代码语言')
    button.setAttribute('aria-haspopup', 'listbox')
    button.setAttribute('aria-expanded', 'false')

    const input = document.createElement('input')
    input.className = 'live-code-language-search'
    input.type = 'text'
    input.hidden = true
    input.autocomplete = 'off'
    input.spellcheck = false
    input.placeholder = this.language || '搜索代码语言'
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-label', '搜索代码语言')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', 'false')

    const list = document.createElement('div')
    list.className = 'live-code-language-options'
    list.id = `live-code-languages-${++nextPickerId}`
    list.setAttribute('role', 'listbox')
    list.setAttribute('aria-label', '代码语言选项')
    input.setAttribute('aria-controls', list.id)
    button.setAttribute('aria-controls', list.id)

    let active = 0
    let options: ReturnType<typeof searchCodeLanguages> = []
    let stopPositioning: (() => void) | undefined
    const documentRoot = view.dom.ownerDocument
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !footer.contains(event.target) && !list.contains(event.target)) close()
    }
    const close = () => {
      stopPositioning?.()
      stopPositioning = undefined
      documentRoot.removeEventListener('pointerdown', outside, true)
      list.remove()
      input.hidden = true
      button.hidden = false
      button.setAttribute('aria-expanded', 'false')
      input.setAttribute('aria-expanded', 'false')
      input.removeAttribute('aria-activedescendant')
    }
    const select = (id: string) => {
      close()
      if (id !== this.language && view.state.sliceDoc(this.from, this.from + this.language.length) === this.language) {
        view.dispatch({
          changes: { from: this.from, to: this.from + this.language.length, insert: id },
          annotations: isolateHistory.of('full'),
          userEvent: 'input.code-language',
        })
        this.onSelect?.(id)
      }
      view.focus()
    }
    const setActive = (index: number, scroll = false) => {
      if (!options.length) return
      list.children[active]?.setAttribute('aria-selected', 'false')
      active = index
      const row = list.children[active]!
      row.setAttribute('aria-selected', 'true')
      input.setAttribute('aria-activedescendant', row.id)
      if (scroll) row.scrollIntoView?.({ block: 'nearest' })
    }
    const filter = () => {
      options = searchCodeLanguages(input.value)
      list.replaceChildren()
      input.removeAttribute('aria-activedescendant')
      if (!options.length) {
        const empty = document.createElement('div')
        empty.className = 'live-code-language-empty'
        empty.setAttribute('role', 'status')
        empty.textContent = '没有匹配的语言'
        list.append(empty)
        return
      }
      for (const [index, option] of options.entries()) {
        const row = document.createElement('div')
        row.id = `${list.id}-${index}`
        row.setAttribute('role', 'option')
        row.setAttribute('aria-selected', 'false')
        row.textContent = option.id
        row.title = option.name
        row.addEventListener('pointermove', () => setActive(index))
        row.addEventListener('mousedown', event => event.preventDefault())
        row.addEventListener('click', () => select(option.id))
        list.append(row)
      }
      list.scrollTop = 0
      setActive(0)
    }

    button.addEventListener('click', () => {
      input.hidden = false
      button.hidden = true
      button.setAttribute('aria-expanded', 'true')
      input.setAttribute('aria-expanded', 'true')
      input.value = ''
      filter()
      list.style.visibility = 'hidden'
      const container = view.dom.closest('.app-shell') ?? documentRoot.body
      container.append(list)
      if (input.isConnected) {
        stopPositioning = autoUpdate(input, list, () => {
          void computePosition(input, list, {
            strategy: 'fixed', placement: 'bottom-end',
            middleware: [offset(5), flip(), shift({ padding: 8 }), size({
              padding: 8,
              apply({ availableHeight, elements }) {
                elements.floating.style.maxHeight = `${Math.max(0, Math.min(230, availableHeight))}px`
              },
            })],
          }).then(({ x, y }) => {
            if (list.isConnected) Object.assign(list.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' })
          })
        })
      }
      documentRoot.addEventListener('pointerdown', outside, true)
      input.focus({ preventScroll: true })
    })
    input.addEventListener('input', filter)
    input.addEventListener('blur', close)
    input.addEventListener('keydown', event => {
      if (event.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        button.focus({ preventScroll: true })
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (options[active]) select(options[active].id)
      } else if (options.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActive((active + direction + options.length) % options.length, true)
      }
    })
    footer.append(button, input)
    pickerCleanup.set(footer, close)
    return footer
  }

  destroy(footer: HTMLElement) { pickerCleanup.get(footer)?.() }
}
