import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readMarkdownExportAssets } from './fileService'

const readFile = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn(), convertFileSrc: (path: string) => path }))
vi.mock('@tauri-apps/plugin-fs', async importOriginal => ({ ...await importOriginal<typeof import('@tauri-apps/plugin-fs')>(), readFile }))

describe('native portable export assets', () => {
  beforeEach(() => { readFile.mockReset(); readFile.mockResolvedValue(new Uint8Array([1, 2, 3])) })

  it('collects titled/spaced/Unicode images, reference images, video posters and subtitles', async () => {
    const assets = await readMarkdownExportAssets('C:/笔记/说明.md', '![图](<图片/中文 图.png> "图注")\n\n![引用][cover]\n\n[cover]: cover.jpg\n\n[视频](clip.mp4 "poster=封面.png;track=中文.vtt")')
    expect(assets.map(asset => asset.url)).toEqual(['图片/中文 图.png', 'cover.jpg', '封面.png', '中文.vtt', 'clip.mp4'])
    expect(assets.find(asset => asset.url === '中文.vtt')?.mime).toBe('text/vtt')
    expect(readFile.mock.calls.map(([path]) => path)).toContain('C:/笔记/图片/中文 图.png')
  })

  it('refuses to silently omit missing local media', async () => {
    readFile.mockRejectedValue(new Error('file not found'))
    await expect(readMarkdownExportAssets('C:/笔记/说明.md', '![图](missing.png)')).rejects.toThrow('未导出不完整文件')
  })
})
