import { h, render, type AppContext } from 'vue'
import MermaidBlock from './components/MermaidBlock.vue'
import { markdownProcessor } from './markdown/fragment'
import type { MdastNode } from './markdown/shared'

async function diagramPng(code: string, appContext: AppContext) {
  const root = document.createElement('div')
  root.style.cssText = 'position:fixed;left:-100000px;top:0;width:1100px'
  document.body.append(root)
  let timeout: number | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = window.setTimeout(() => reject(new Error('图表未能完成渲染，导出已停止，请检查 Mermaid 语法')), 15000)
      const node = h(MermaidBlock, { code, large: true, nativeLabels: true, onRendered: () => resolve() })
      node.appContext = appContext
      render(node, root)
    })
    const svg = root.querySelector('svg')
    if (!svg) throw new Error('图表没有可导出的 SVG')
    const box = svg.viewBox.baseVal
    const width = Math.max(1, box.width || svg.clientWidth), height = Math.max(1, box.height || svg.clientHeight)
    if (width * height > 20000000) throw new Error('图表过大，请拆分后导出')
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image); image.onerror = () => reject(new Error('图表图片转换失败'))
        image.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(width * 2); canvas.height = Math.ceil(height * 2)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前系统不支持图表画布')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    } finally { URL.revokeObjectURL(url) }
  } finally {
    window.clearTimeout(timeout)
    render(null, root)
    root.remove()
  }
}

export async function prepareExportDiagrams(source: string, appContext: AppContext) {
  const diagrams: MdastNode[] = []
  const collect = (node: MdastNode) => {
    if (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid') diagrams.push(node)
    node.children?.forEach(collect)
  }
  collect(markdownProcessor.parse(source) as unknown as MdastNode)
  let result = source
  // Reverse source offsets keep every other Markdown byte and nested block intact.
  for (const diagram of diagrams.reverse()) {
    const from = diagram.position?.start?.offset, to = diagram.position?.end?.offset
    if (from === undefined || to === undefined) throw new Error('无法确定图表位置，未导出不完整文件')
    const image = await diagramPng(diagram.value ?? '', appContext)
    result = result.slice(0, from) + `![Mermaid 图表](${image})` + result.slice(to)
  }
  return result
}
