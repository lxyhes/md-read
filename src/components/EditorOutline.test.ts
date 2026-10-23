// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { parseMarkdown } from '../parser'
import EditorOutline from './EditorOutline.vue'

it('tracks draft headings and the caret, emits the chosen section, and handles an empty outline', async () => {
  const initial = parseMarkdown('draft.md', '# First\n\nIntro\n\n## Second\n\nText')
  const state = reactive({ document: initial, cursor: 0 })
  const onJump = vi.fn()
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(EditorOutline, { ...state, onJump }) })
  app.mount(host)
  try {
    const buttons = host.querySelectorAll<HTMLButtonElement>('nav button')
    expect([...buttons].map(button => button.textContent)).toEqual(['First', 'Second'])
    expect(buttons[1].style.paddingInlineStart).toBe('24px')
    expect(buttons[0].getAttribute('aria-current')).toBe('location')
    buttons[1].click()
    expect(onJump).toHaveBeenCalledWith(1)
    state.cursor = initial.source.indexOf('## Second')
    await nextTick()
    expect(buttons[1].getAttribute('aria-current')).toBe('location')
    state.document = parseMarkdown('draft.md', '# Renamed\n\n## Newly added')
    await nextTick()
    expect(host.textContent).toContain('Renamed')
    expect(host.textContent).toContain('Newly added')
    expect(host.textContent).not.toContain('First')
    state.document = parseMarkdown('draft.md', 'Plain text')
    await nextTick()
    expect(host.querySelector('nav')).toBeNull()
    expect(host.textContent).toContain('添加 Markdown 标题后')
  } finally {
    app.unmount()
    host.remove()
  }
})
