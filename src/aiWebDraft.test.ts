// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import script from '../src-tauri/src/ai_web_draft.js?raw'

const fillDraft = new Function(`return (${script})`)() as (origin: string, text: string) => string

function composer<T extends HTMLElement>(markup: string) {
  document.body.innerHTML = markup
  const editor = document.body.firstElementChild as HTMLElement
  vi.spyOn(editor, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 30)] as unknown as DOMRectList)
  editor.style.visibility = 'visible'
  return editor as T
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('fills a textarea as plain text and lets the page update the draft without submitting', () => {
  const editor = composer<HTMLTextAreaElement>('<textarea></textarea>')
  const text = '选中的文字\n"<b>第二行</b>"'
  const input = vi.fn()
  const submit = vi.fn()
  editor.addEventListener('input', input)
  document.body.addEventListener('submit', submit, { once: true })
  try {
    expect(fillDraft(location.origin, text)).toBe('filled')
    expect(editor.value).toBe(text)
    expect(input).toHaveBeenCalledOnce()
    expect(submit).not.toHaveBeenCalled()
  } finally {
    document.body.removeEventListener('submit', submit)
  }
})

it('waits for the correct site and a recognizable editor, and preserves existing drafts', () => {
  expect(fillDraft(location.origin, '选中文字')).toBe('waiting')
  const editor = composer<HTMLTextAreaElement>('<textarea>已有草稿</textarea>')
  expect(fillDraft('https://another.example', '选中文字')).toBe('waiting')
  expect(fillDraft(location.origin, '选中文字')).toBe('occupied')
  expect(editor.value).toBe('已有草稿')
})

it('replaces a previous automatic fill in a textarea and preserves manual edits', () => {
  const editor = composer<HTMLTextAreaElement>('<textarea></textarea>')
  expect(fillDraft(location.origin, '全能课')).toBe('filled')
  expect(fillDraft(location.origin, '影视飓风全能课')).toBe('filled')
  expect(editor.value).toBe('影视飓风全能课')
  editor.value += '是什么？'
  editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
  expect(fillDraft(location.origin, '另一个选区')).toBe('occupied')
  expect(editor.value).toBe('影视飓风全能课是什么？')
})

it('replaces a previous automatic fill with literal text in a rich chat composer', () => {
  const editor = composer('<div contenteditable="true" role="textbox"><p><br></p></div>')
  const insert = vi.fn((_command: string, _showUi: boolean, text: string) => {
    expect(window.getSelection()?.toString()).toBe(editor.textContent)
    editor.textContent = text
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    return true
  })
  Object.defineProperty(document, 'execCommand', { value: insert, configurable: true })
  try {
    expect(fillDraft(location.origin, '选中文字')).toBe('filled')
    expect(document.activeElement).toBe(editor)
    expect(insert).toHaveBeenCalledWith('insertText', false, '选中文字')
    expect(fillDraft(location.origin, '<b>另一个选区</b>')).toBe('filled')
    expect(editor.innerHTML).toBe('&lt;b&gt;另一个选区&lt;/b&gt;')
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(fillDraft(location.origin, '再选一次')).toBe('occupied')
    expect(editor.textContent).toBe('<b>另一个选区</b>')
  } finally {
    Reflect.deleteProperty(document, 'execCommand')
  }
})
