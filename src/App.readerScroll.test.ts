// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))

it('keeps the highlight on the visible reading line when scrolling to the bottom', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: 'short.md', source: '# Start\n\n## Checklist\n\n## Final section\n\nLast paragraph.' }], { persist: false })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  try {
    const regions = await vi.waitFor(() => {
      const blocks = host.querySelectorAll<HTMLElement>('.reader-viewport [data-region-id]')
      expect(blocks).toHaveLength(4)
      return [...blocks]
    })
    const viewport = host.querySelector<HTMLElement>('.reader-viewport')!
    Object.defineProperties(viewport, { clientHeight: { value: 700 }, scrollHeight: { value: 900 } })
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 900, 700)
    const regionTops = [150, 370, 640, 750]
    regions.forEach((region, index) => {
      region.getBoundingClientRect = () => new DOMRect(0, regionTops[index] - viewport.scrollTop, 900, 80)
    })

    viewport.scrollTop = 40
    viewport.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(store.progress[store.currentDocumentId!]?.scrollPercent).toBe(.2))
    expect(host.querySelector('.region-block.active')).toBe(regions[0])

    for (const top of [180, 200]) {
      viewport.scrollTop = top
      viewport.dispatchEvent(new Event('scroll'))
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
      expect(host.querySelector('.region-block.active')).toBe(regions[0])
    }
    await vi.waitFor(() => expect(store.progress[store.currentDocumentId!]?.scrollPercent).toBe(1))
    expect(host.querySelector('.region-block.active')).toBe(regions[1])

    const wheel = new WheelEvent('wheel', { deltaY: 900, bubbles: true, cancelable: true })
    viewport.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    expect(store.activeRegionId).toBe(regions[2].dataset.regionId)

    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 900, bubbles: true, cancelable: true }))
    expect(store.activeRegionId).toBe(regions[2].dataset.regionId)
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})
