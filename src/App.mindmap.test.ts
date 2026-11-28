// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))

it.each([
  { tab: '思维导图', branch: '.tree-branch-toggle' },
  { tab: '并排', branch: '.reader-mindmap summary' },
])('opens the shared image viewer from $tab', async ({ tab, branch }) => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  const url = 'blob:https://moyue.example/preview'
  await store.addOpenedFiles([{
    path: 'notes/design.md',
    source: '# Design\n\n## Reference\n\n![Preview](./images/example.png)',
    assets: { 'notes/images/example.png': url },
  }], { persist: false })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  try {
    const viewButton = await vi.waitFor(() => {
      const button = [...host.querySelectorAll<HTMLButtonElement>('.reader-display-switch button')]
        .find(button => button.textContent?.trim() === tab)
      expect(button).toBeDefined()
      return button!
    })
    viewButton.click()
    await nextTick()
    if (tab === '思维导图') {
      const canvas = host.querySelector('.reader-mindmap-scroll')!
      const motion = host.querySelector<HTMLButtonElement>('.reader-mindmap-options [aria-pressed]')!
      expect(canvas).toBe(host.querySelector('.reader-viewport'))
      expect(canvas.classList.contains('has-animated-branches')).toBe(true)
      expect(motion.getAttribute('aria-pressed')).toBe('true')
      motion.click()
      await nextTick()
      expect(canvas.classList.contains('has-animated-branches')).toBe(false)
      expect(motion.getAttribute('aria-pressed')).toBe('false')
    }
    host.querySelector<HTMLElement>(branch)!.click()
    await nextTick()
    host.querySelector<HTMLElement>('.tree-summary-leaf')!.click()
    await nextTick()
    const previewButton = document.querySelector<HTMLButtonElement>('.tree-summary-markdown button[aria-label="放大查看 Preview"]')!
    expect(previewButton).not.toBeNull()
    previewButton.querySelector('img')!.click()
    await nextTick()

    const image = document.querySelector('.viewer-overlay .image-viewer img')
    expect(image?.getAttribute('src')).toBe(url)
    expect(image?.getAttribute('alt')).toBe('Preview')
    expect(document.querySelector('.tree-summary-popover')).toBeNull()
    document.querySelector<HTMLButtonElement>('.viewer-overlay button[aria-label="关闭查看器"]')!.click()
    await nextTick()
    expect(document.querySelector('.viewer-overlay')).toBeNull()
    expect(host.querySelector('.tree-summary-leaf')).not.toBeNull()
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})

it('opens flowchart playback from the mind map and lets the reader stop it', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{
    path: 'notes/flow.md',
    source: '# 文档\n\n## 阅读流程\n\n' + [
      '```mermaid', 'flowchart LR', 'A[读取] -->|原文| B[解析]', 'B --> C[阅读]', '```',
    ].join('\n'),
  }], { persist: false })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  const findButton = (root: ParentNode, label: string) => [...root.querySelectorAll('button')]
    .find(button => button.textContent?.trim() === label)

  try {
    await vi.waitFor(() => expect(findButton(host, '思维导图')).toBeDefined())
    findButton(host, '思维导图')!.click()
    await nextTick()
    const playButton = findButton(host, '播放数据流')
    expect(playButton).toBeDefined()
    playButton!.click()
    await nextTick()

    const viewer = document.querySelector('.viewer-overlay')!
    const paths = [...viewer.querySelectorAll<SVGPathElement>('path[marker-end]')]
    expect(paths).toHaveLength(2)
    const stopButton = findButton(viewer, '停止数据流')
    expect(stopButton).toBeDefined()
    stopButton!.click()
    await nextTick()
    const replayButton = findButton(viewer, '播放数据流')
    expect(replayButton).toBeDefined()

    const secondEdge = vi.fn((length: number) => ({ x: 200 + length, y: 24 }))
    Object.assign(paths[0], {
      getTotalLength: () => 100,
      getPointAtLength: (length: number) => ({ x: length, y: 24 }),
    })
    Object.assign(paths[1], { getTotalLength: () => 100, getPointAtLength: secondEdge })
    replayButton!.click()
    await vi.waitFor(() => expect(secondEdge).toHaveBeenCalled(), { timeout: 2500 })
    const dot = viewer.querySelector('.mermaid-flow-dot')!
    expect(Number(dot.getAttribute('cx'))).toBeGreaterThanOrEqual(200)
    findButton(viewer, '停止数据流')!.click()
    await nextTick()
    expect(viewer.querySelector('.mermaid-flow-dot')).toBeNull()
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})

it('reveals folded matches and returns to the exact node after reading its source', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{
    path: 'notes/navigation.md',
    source: '# 文档\n\n## 第一章\n\n### 当前受理额度\n\n第一章原文。\n\n## 第二章\n\n### 当前受理额度\n\n第二章原文。',
  }], { persist: false })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  const button = (label: string) => [...host.querySelectorAll('button')].find(element => element.textContent?.trim() === label)!
  const selected = () => host.querySelector<HTMLElement>('.is-mindmap-selected')
  try {
    await vi.waitFor(() => expect(button('思维导图')).toBeDefined())
    button('思维导图').click()
    await nextTick()
    const toolbar = host.querySelector('.reader-mindmap-heading')
    const viewport = host.querySelector('.reader-viewport')!
    expect(toolbar?.parentElement?.nextElementSibling).toBe(viewport)
    const search = host.querySelector<HTMLInputElement>('input[aria-label="搜索节点"]')!
    search.value = '当前受理额度'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await nextTick()
    expect(selected()?.dataset.mindmapNode).toBe('0.0.0')
    host.querySelector<HTMLButtonElement>('[aria-label="下一个匹配节点"]')!.click()
    await nextTick()
    expect(selected()?.dataset.mindmapNode).toBe('0.1.0')

    button('聚焦分支').click()
    await nextTick()
    expect(host.querySelector('.is-mindmap-dimmed')?.textContent).toContain('第一章')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await nextTick()
    expect(host.querySelector('.is-mindmap-dimmed')).toBeNull()
    button('定位原文').click()
    await nextTick()
    await nextTick()
    expect(button('并排').getAttribute('aria-selected')).toBe('true')
    const splitMap = host.querySelector('[role="region"][aria-label="并排思维导图"]')
    expect(splitMap?.previousElementSibling).toBe(toolbar)
    expect(splitMap?.querySelector('.is-mindmap-selected')?.getAttribute('data-mindmap-node')).toBe('0.1.0')
    expect(store.activeHeadingId).toBe(store.currentDocument?.headings.filter(heading => heading.text === '当前受理额度')[1]?.id)

    button('回到导图节点').click()
    await nextTick()
    expect(button('思维导图').getAttribute('aria-selected')).toBe('true')
    expect(toolbar?.parentElement?.nextElementSibling).toBe(viewport)
    expect(selected()?.dataset.mindmapNode).toBe('0.1.0')
    button('回到中心').click()
    await nextTick()
    expect(selected()?.dataset.mindmapNode).toBe('0')
    expect(host.querySelector('[data-mindmap-node="0.1"]')?.getAttribute('aria-expanded')).toBe('true')
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})
