import { markdownProcessor } from './markdown/fragment'
import { nodeText, resolveMarkdownReferences, type MdastNode } from './markdown/shared'
import { assetDataUrl } from './exportPresentation'
import type { MarkdownExportAsset } from './fileService'

export async function rasterizeExportImages(assets: readonly MarkdownExportAsset[], office = false): Promise<MarkdownExportAsset[]> {
  const result: MarkdownExportAsset[] = []
  for (const asset of assets) {
    const convert = asset.mime === 'image/svg+xml' || (office && asset.mime.startsWith('image/') && !['image/png', 'image/jpeg'].includes(asset.mime))
    if (!convert) { result.push(asset); continue }
    const url = URL.createObjectURL(new Blob([asset.bytes as BlobPart], { type: asset.mime }))
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image(), timeout = window.setTimeout(() => reject(new Error(`图片转换超时：${asset.url}`)), 15000)
        image.onload = () => { window.clearTimeout(timeout); resolve(image) }
        image.onerror = () => { window.clearTimeout(timeout); reject(new Error(`图片无法解码：${asset.url}，未丢弃图片`)) }
        image.src = url
      })
      const width = image.naturalWidth || 800, height = image.naturalHeight || 600
      const scale = asset.mime === 'image/svg+xml' ? 2 : 1
      if (width * height * scale * scale > 16000000) throw new Error(`图片过大：${asset.url}，请缩小后导出`)
      const canvas = document.createElement('canvas')
      canvas.width = width * scale; canvas.height = height * scale
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前系统不支持图片转换画布')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(`图片编码失败：${asset.url}`)), 'image/png'))
      result.push({ ...asset, name: asset.name.replace(/\.[^.]+$/, '.png'), mime: 'image/png', bytes: new Uint8Array(await blob.arrayBuffer()) })
    } finally { URL.revokeObjectURL(url) }
  }
  return result
}

export function embedExportImages(source: string, assets: readonly MarkdownExportAsset[]) {
  const urls = new Map(assets.filter(asset => asset.mime.startsWith('image/')).map(asset => [asset.url, assetDataUrl(asset)]))
  const replacements: Array<{ from: number; to: number; image: string }> = []
  const collect = (node: MdastNode) => {
    const url = node.type === 'image' ? urls.get(node.url ?? '') : null
    const from = node.position?.start?.offset, to = node.position?.end?.offset
    if (url && from !== undefined && to !== undefined) {
      const alt = nodeText(node).replace(/[\\\[\]]/g, '\\$&'), title = node.title ? ` "${node.title.replace(/[\\"]/g, '\\$&')}"` : ''
      replacements.push({ from, to, image: `![${alt}](${url}${title})` })
    }
    node.children?.forEach(collect)
  }
  collect(resolveMarkdownReferences(markdownProcessor.parse(source) as unknown as MdastNode))
  for (const item of replacements.sort((a, b) => b.from - a.from)) source = source.slice(0, item.from) + item.image + source.slice(item.to)
  return source
}
