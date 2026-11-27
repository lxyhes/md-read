// @vitest-environment happy-dom
import { EditorView } from '@codemirror/view'
import { expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import MarkdownEditor from './MarkdownEditor.vue'

it.each([false, true])('finds a node under a collapsed branch and focuses its source line (live=%s)', async live => {
  const source = ['Before', '', '```text', 'project', '├── src', '│   └── same.md', '└── docs', '    └── same.md', '```', '', 'After'].join('\n')
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp({ render: () => h(MarkdownEditor, {
    modelValue: source, directoryTreeSource: source, live, spellcheck: false, typewriter: false, focusMode: false, resolveUrl: url => url,
  }) })
  const ignoreSelectionChange = (event: Event) => event.stopImmediatePropagation()
  document.addEventListener('selectionchange', ignoreSelectionChange, true)
  app.mount(host)
  try {
    const editor = EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!)!
    vi.spyOn(editor.scrollDOM, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 700, 600))
    expect(host.querySelector('.directory-trigger')).toBeNull()
    editor.dispatch({ selection: { anchor: editor.state.doc.line(5).from } })
    const trigger = await vi.waitFor(() => {
      const button = host.querySelector<HTMLButtonElement>('.directory-trigger')
      expect(button).toBeTruthy()
      return button!
    })
    trigger.click()
    const dropdown = await vi.waitFor(() => {
      const panel = document.querySelector('.directory-panel')
      expect(panel).toBeTruthy()
      return panel!
    })
    dropdown.querySelector<HTMLButtonElement>('[aria-label="折叠 docs"]')!.click()
    await vi.waitFor(() => expect(dropdown.querySelectorAll('[title*="same.md"]')).toHaveLength(1))
    const input = dropdown.querySelector('input')!
    input.value = 'docs/same'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const result = await vi.waitFor(() => {
      const button = dropdown.querySelector<HTMLButtonElement>('.directory-result')!
      expect(button.textContent).toContain('project/docs/same.md')
      return button
    })
    result.click()
    expect(editor.state.selection.main.from).toBe(editor.state.doc.line(8).to)
    expect(document.activeElement).toBe(editor.contentDOM)
    await vi.waitFor(() => expect(document.querySelector('.directory-panel')).toBeNull())
    editor.dispatch({ selection: { anchor: editor.state.doc.line(11).from } })
    await vi.waitFor(() => expect(host.querySelector('.directory-trigger')).toBeNull())
  } finally {
    app.unmount()
    document.removeEventListener('selectionchange', ignoreSelectionChange, true)
    host.remove()
  }
})
