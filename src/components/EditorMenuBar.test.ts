// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import EditorMenuBar from './EditorMenuBar.vue'

describe('editor menu', () => {
  it('runs the selected action and closes the menu', async () => {
    const action = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(EditorMenuBar, { groups: [{ label: '格式', items: [{ label: '粗体', action }] }] }) })
    app.mount(host)
    host.querySelector<HTMLButtonElement>('.editor-menu-trigger')!.click()
    await nextTick()
    expect(host.querySelector('[role="menu"]')).not.toBeNull()
    host.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click()
    await nextTick()
    expect(action).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="menu"]')).toBeNull()
    app.unmount()
    host.remove()
  })
})
