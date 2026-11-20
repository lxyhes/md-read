(origin, text) => {
  if (location.origin !== origin) return 'waiting'

  const editors = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')]
    .filter((editor) => !editor.closest('dialog, [role="dialog"], [role="search"], [inert], [aria-hidden="true"]') &&
      !editor.matches(':disabled, [readonly], [aria-disabled="true"], [aria-readonly="true"], [role="searchbox"]') &&
      editor.getClientRects().length && getComputedStyle(editor).visibility === 'visible')
  const composers = editors.filter((editor) => /问|消息|message|prompt|ask/i.test([
    editor.getAttribute('placeholder'), editor.getAttribute('data-placeholder'), editor.getAttribute('aria-label'),
  ].join(' ')))
  const editor = composers.length === 1 ? composers[0] : editors.length === 1 ? editors[0] : null
  if (!editor) return 'waiting'

  const filledDraft = Symbol.for('moyue.ai-web-draft')
  function rememberDraft(snapshot) {
    if (editor[filledDraft] === undefined) {
      editor.addEventListener('input', () => { delete editor[filledDraft] }, { once: true })
    }
    editor[filledDraft] = snapshot
    return 'filled'
  }

  if (editor instanceof HTMLTextAreaElement) {
    if (editor.value && editor.value !== editor[filledDraft]) return 'occupied'
    if (editor.maxLength >= 0 && text.length > editor.maxLength) return 'unsupported'
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, text)
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }))
    return editor.value ? rememberDraft(editor.value) : 'unsupported'
  }

  const snapshot = editor.innerHTML
  const occupied = editor.textContent.trim() || editor.querySelector('img, [contenteditable="false"]')
  if (occupied && snapshot !== editor[filledDraft]) return 'occupied'
  editor.focus({ preventScroll: true })
  if (document.activeElement !== editor) return 'unsupported'
  if (editor.innerHTML !== snapshot) return 'occupied'
  const selection = window.getSelection()
  if (!selection) return 'unsupported'
  const range = document.createRange()
  range.selectNodeContents(editor)
  selection.removeAllRanges()
  selection.addRange(range)
  return document.execCommand('insertText', false, text) ? rememberDraft(editor.innerHTML) : 'unsupported'
}
