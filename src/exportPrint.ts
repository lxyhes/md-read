interface PrintSettings { printPageSize: string; printMargin: number; printBackground: boolean; printHeader: string; printFooter: string }

export function createPrintHtml(html: string, settings: PrintSettings) {
  const css = `@page{size:${settings.printPageSize};margin:${settings.printMargin}mm}body{print-color-adjust:${settings.printBackground ? 'exact' : 'economy'};-webkit-print-color-adjust:${settings.printBackground ? 'exact' : 'economy'}}h1,h2,h3{break-after:avoid}pre,table,figure{break-inside:avoid}body::before{content:${JSON.stringify(settings.printHeader)};position:fixed;top:-${Math.max(8, settings.printMargin - 5)}mm;left:0;right:0;text-align:center;font-size:9pt;color:#667}body::after{content:${JSON.stringify(settings.printFooter)};position:fixed;bottom:-${Math.max(8, settings.printMargin - 5)}mm;left:0;right:0;text-align:center;font-size:9pt;color:#667}`
  return html.replace('</head>', `<style>${css.replace(/</g, '\\3c ')}</style></head>`)
}

export async function printPortableHtml(html: string) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1000px;height:1000px;border:0'
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  let cleanupTimer: number | undefined
  const cleanup = () => { window.clearTimeout(cleanupTimer); frame.remove() }
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('打印页面加载超时')), 15000)
      frame.onload = () => { window.clearTimeout(timeout); resolve() }
      frame.onerror = () => { window.clearTimeout(timeout); reject(new Error('打印页面加载失败')) }
      frame.srcdoc = html
      document.body.append(frame)
    })
    const page = frame.contentDocument, target = frame.contentWindow
    if (!page || !target) throw new Error('无法打开打印页面')
    await page.fonts.ready
    await Promise.all([...page.images].map(image => new Promise<void>((resolve, reject) => {
      if (image.complete) { image.naturalWidth ? resolve() : reject(new Error(`打印图片加载失败：${image.alt}`)); return }
      const timeout = window.setTimeout(() => reject(new Error(`打印图片加载超时：${image.alt}`)), 10000)
      image.onload = () => { window.clearTimeout(timeout); resolve() }
      image.onerror = () => { window.clearTimeout(timeout); reject(new Error(`打印图片加载失败：${image.alt}`)) }
    })))
    target.addEventListener('afterprint', cleanup, { once: true })
    cleanupTimer = window.setTimeout(cleanup, 300000)
    target.focus()
    target.print()
  } catch (error) { cleanup(); throw error }
}
