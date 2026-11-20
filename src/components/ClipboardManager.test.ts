// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ClipboardManager from './ClipboardManager.vue'
import { loadDurableData } from '../persistence'

vi.mock('../persistence', () => ({ loadDurableData: vi.fn(), saveDurableData: vi.fn() }))

it('shows skeletons instead of an empty state until clipboard history is restored', async () => {
  let resolveHistory!: (items: unknown[]) => void
  const history = new Promise<unknown[]>(resolve => { resolveHistory = resolve })
  vi.mocked(loadDurableData).mockReturnValueOnce(history)
  localStorage.setItem('moyue:clipboard-capture-enabled', 'false')
  const host = document.createElement('div')
  const app = createApp(ClipboardManager)
  app.mount(host)
  try {
    expect(host.querySelectorAll('.content-skeleton')).toHaveLength(2)
    expect(host.querySelector('.clipboard-empty')).toBeNull()
    expect(host.querySelector('.clipboard-quiet-action')?.hasAttribute('disabled')).toBe(true)

    resolveHistory([{ id: 'record', signature: 'record', kind: 'text', text: '已保存内容', createdAt: 1, pinned: false }])
    await history
    await nextTick()

    expect(host.querySelector('.content-skeleton')).toBeNull()
    expect(host.querySelector('.clipboard-item')).not.toBeNull()
    expect(host.querySelector('.clipboard-detail-text')?.textContent).toBe('已保存内容')
  } finally {
    app.unmount()
    localStorage.removeItem('moyue:clipboard-capture-enabled')
  }
})
