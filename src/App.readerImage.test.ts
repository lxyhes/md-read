// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))

it('opens body images in the reader and shows a message if the image fails to load', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  const cover = 'https://img-view-c-sz.drive.quark.cn/assets/preview?token=example&sp=100'
  const inline = 'blob:https://moyue.example/image'
  await store.addOpenedFiles([{
    path: 'course.md',
    source: `[image](${cover.replace('&', '\\&')})\n\n- 配图 ![示意图](${inline})`,
  }], { persist: false })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  try {
    const coverImage = await vi.waitFor(() => {
      const image = host.querySelector<HTMLImageElement>('.image-region img')
      expect(image).not.toBeNull()
      return image!
    })
    coverImage.click()
    await nextTick()
    const viewerImage = () => document.querySelector<HTMLImageElement>('.viewer-overlay .image-viewer img')
    expect(viewerImage()?.getAttribute('src')).toBe(cover)
    viewerImage()!.dispatchEvent(new Event('error'))
    await nextTick()
    expect(document.querySelector('.image-viewer [role="status"]')?.textContent).toContain('图片加载失败')

    document.querySelector<HTMLButtonElement>('.viewer-overlay button[aria-label="关闭查看器"]')!.click()
    await nextTick()
    host.querySelector<HTMLButtonElement>('button[aria-label="放大查看 示意图"]')!.click()
    await nextTick()
    expect(viewerImage()?.getAttribute('src')).toBe(inline)
    Object.defineProperties(viewerImage()!, { naturalWidth: { value: 640 }, naturalHeight: { value: 360 } })
    viewerImage()!.dispatchEvent(new Event('load'))
    await vi.waitFor(() => expect(document.querySelector('.viewer-header')?.textContent).toContain('640 × 360 像素'))
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
  }
})
