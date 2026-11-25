import { describe, expect, it, vi } from 'vitest'
import { cachePastedRemoteImages, downloadMarkdownImages } from './fileService'

const invoke = vi.hoisted(() => vi.fn(async (command: string, args?: { url?: string }) => {
  if (command !== 'download_remote_image') return undefined
  if (args?.url?.endsWith('/missing.png')) throw new Error('image unavailable')
  return { bytes: [1, 2], mime: 'image/webp' }
}))
const writeFile = vi.hoisted(() => vi.fn(async () => {}))
const copyFile = vi.hoisted(() => vi.fn(async (source: string, _target: string) => {
  if (source.endsWith('/missing.png')) throw new Error('cache entry unavailable')
}))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke, convertFileSrc: (path: string) => path }))
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => 'C:\\User Name\\墨阅\\' }))
vi.mock('@tauri-apps/plugin-fs', async importOriginal => ({ ...await importOriginal<typeof import('@tauri-apps/plugin-fs')>(), mkdir: vi.fn(async () => {}), writeFile, copyFile }))

describe('clipboard image downloads', () => {
  it('unescapes a pasted image URL and saves it as a local image', async () => {
    const result = await downloadMarkdownImages('C:/notes/test.md', '[image](https://img-view-c-sz.drive.quark.cn/a/preview?x=1\\&y=2)')
    expect(invoke).toHaveBeenCalledWith('download_remote_image', { url: 'https://img-view-c-sz.drive.quark.cn/a/preview?x=1&y=2' })
    expect(result.source).toMatch(/^!\[image\]\(\.moyue-assets\/download-.*\.webp\)$/)
    expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.webp$/), Uint8Array.of(1, 2))
  })

  it('keeps an unsaved paste backed by an encoded application data path', async () => {
    const result = await cachePastedRemoteImages('![image](https://example.com/a.png)')
    expect(result.source).toContain('C:/User%20Name/%E5%A2%A8%E9%98%85/.moyue-assets/')
    expect(result.count).toBe(1)
  })

  it('copies draft images into the chosen folder without downloading cached URLs again', async () => {
    const draft = await cachePastedRemoteImages('![首图](https://example.com/a.png)\n\n![首图再用](https://example.com/a.png)')
    invoke.mockClear()
    copyFile.mockClear()
    const source = `${draft.source}\n\n![剩余远程图](https://example.com/new.png)\n\n![其他目录](C:/elsewhere/external.png)`
    const result = await downloadMarkdownImages('D:/笔记/文章.md', source, true, { includeClipboardCache: true })

    const copies = copyFile.mock.calls
    expect(copies).toHaveLength(1)
    expect(copies[0][0]).toMatch(/^C:\/User Name\/墨阅\/\.moyue-assets\/download-.*\.png$/)
    expect(copies[0][1]).toMatch(/^D:\/笔记\/\.moyue-assets\/download-.*\.png$/)
    expect(invoke.mock.calls.filter(([command]) => command === 'download_remote_image')).toEqual([
      ['download_remote_image', { url: 'https://example.com/new.png' }],
    ])
    expect(result).toMatchObject({ count: 2, failed: 0 })
    expect(result.source.match(/\.\/\.moyue-assets\//g)).toHaveLength(3)
    expect(result.source).toContain('![其他目录](C:/elsewhere/external.png)')
  })

  it('retains the original reference and reports a missing cached image on save', async () => {
    const missing = '![缺失图片](C:/User%20Name/%E5%A2%A8%E9%98%85/.moyue-assets/missing.png)'
    const source = `${missing}\n\n![远程图片](https://example.com/new.png)`
    const result = await downloadMarkdownImages('D:/笔记/文章.md', source, false, { includeClipboardCache: true })
    expect(result).toMatchObject({ count: 1, failed: 1 })
    expect(result.source).toContain(missing)
    expect(result.source).toContain('![远程图片](.moyue-assets/')
  })

  it('reports a failed image and keeps its original position and URL', async () => {
    const source = '![图一](https://example.com/a.png)\n\n![图二](https://example.com/missing.png)\n\n![图三](https://example.com/c.png)'
    const result = await downloadMarkdownImages('C:/notes/test.md', source)
    expect(result.count).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.source.split('\n\n').map((block) => block.replace(/\.moyue-assets\/[^)]+/g, 'local'))).toEqual([
      '![图一](local)',
      '![图二](https://example.com/missing.png)',
      '![图三](local)',
    ])
  })
})
