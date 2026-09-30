export async function createDocumentPng(html: string, width: number): Promise<Uint8Array> {
  const frame = document.createElement('iframe')
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:1000px;border:0`
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('长图页面加载超时')), 15000)
      frame.onload = () => { window.clearTimeout(timeout); resolve() }
      frame.onerror = () => { window.clearTimeout(timeout); reject(new Error('长图页面加载失败')) }
      frame.srcdoc = html
      document.body.append(frame)
    })
    const page = frame.contentDocument!
    await page.fonts.ready
    await Promise.all([...page.images].map(image => new Promise<void>((resolve, reject) => {
      if (!image.src.startsWith('data:')) { reject(new Error(`长图请先下载远程图片或修复本地引用：${image.alt || image.src}`)); return }
      if (image.complete) { image.naturalWidth ? resolve() : reject(new Error(`长图图片加载失败：${image.alt}`)); return }
      const timeout = window.setTimeout(() => reject(new Error(`长图图片加载超时：${image.alt}`)), 10000)
      image.onload = () => { window.clearTimeout(timeout); resolve() }
      image.onerror = () => { window.clearTimeout(timeout); reject(new Error(`长图图片加载失败：${image.alt}`)) }
    })))
    const height = Math.ceil(page.body.scrollHeight)
    if (height > 16000) throw new Error('文档长图超过 16000 像素，请分章导出或使用 PDF')
    const root = document.createElement('div')
    root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
    root.style.cssText = `width:${width}px;height:${height}px;overflow:hidden`
    const styles = [...page.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n')
    root.innerHTML = `<style>${styles.replace(/:root/g, '.export-canvas').replace(/\bbody\b/g, '.export-body').replace(/</g, '\\3c ')}</style><div class="export-body app-shell">${page.body.innerHTML}</div>`
    root.className = 'export-canvas'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(root)}</foreignObject></svg>`
    // Chromium treats blob-backed SVG foreignObject as origin-unclean; a self-contained data URL remains exportable.
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image(), timeout = window.setTimeout(() => reject(new Error('长图渲染超时')), 15000)
      candidate.onload = () => { window.clearTimeout(timeout); resolve(candidate) }
      candidate.onerror = () => { window.clearTimeout(timeout); reject(new Error('长图渲染失败，请先下载远程图片后重试')) }
      candidate.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前系统不支持 PNG 画布')
    context.drawImage(image, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 编码失败')), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally { frame.remove() }
}
