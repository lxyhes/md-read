// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import EditorContextActions from './EditorContextActions.vue'

it('opens a group by keyboard and runs its command', async () => {
  const host = document.createElement('div')
  host.setAttribute('role', 'menu')
  document.body.append(host)
  const action = vi.fn()
  const close = vi.fn()
  const app = createApp({ render: () => h(EditorContextActions, {
    clipboard: [],
    format: [],
    groups: [{ label: '段落', items: [{ label: '一级标题', action }] }],
    onClose: close,
  }) })
  app.mount(host)
  const group = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!
  group.focus()
  group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('一级标题'))
  host.querySelector<HTMLButtonElement>('[role="menu"][aria-label="段落"] button')!.click()
  expect(action).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  app.unmount()
  host.remove()
})
