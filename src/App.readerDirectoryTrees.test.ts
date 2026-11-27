// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))

it('collapses all directory trees, copies their full text, and allows individual reopening', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  const tree = (root: string) => ['```text', root, '└── folder', '    └── file.md', '```'].join('\n')
  await store.addOpenedFiles([{ path: 'trees.md', source: [tree('first'), tree('second')].join('\n\n') }], { persist: false })

  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp(App).use(pinia)
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  app.mount(host)
  try {
    const collapseButton = () => [...host.querySelectorAll<HTMLButtonElement>('.reader-edit-actions button')]
      .find(button => button.textContent?.trim() === '折叠全部目录树')
    const treeRoots = () => [...host.querySelectorAll<HTMLButtonElement>('.is-directory .tree-root')]
    const expansion = () => treeRoots().map(root => root.getAttribute('aria-expanded'))

    await vi.waitFor(() => expect(expansion()).toEqual(['true', 'true']))
    collapseButton()!.click()
    await nextTick()
    expect(expansion()).toEqual(['false', 'false'])

    const copyButtons = [...host.querySelectorAll<HTMLButtonElement>('.tree-copy')]
    expect(copyButtons).toHaveLength(2)
    writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
    copyButtons[1].click()
    await vi.waitFor(() => expect(copyButtons[1].textContent).toContain('复制失败'))
    copyButtons[1].click()
    await vi.waitFor(() => expect(copyButtons[1].textContent).toContain('已复制'))
    expect(writeText).toHaveBeenLastCalledWith('second\n└── folder\n    └── file.md')
    expect(expansion()).toEqual(['false', 'false'])

    treeRoots()[0].click()
    await nextTick()
    expect(expansion()).toEqual(['true', 'false'])

    collapseButton()!.click()
    await nextTick()
    expect(expansion()).toEqual(['false', 'false'])

    await store.addOpenedFiles([{ path: 'other.md', source: tree('third') }], { persist: false })
    await vi.waitFor(() => expect(expansion()).toEqual(['true']))

    await store.addOpenedFiles([{ path: 'plain.md', source: '# Plain text' }], { persist: false })
    await vi.waitFor(() => expect(collapseButton()).toBeUndefined())
  } finally {
    writeText.mockRestore()
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})
