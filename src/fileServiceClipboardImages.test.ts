import { describe, expect, it, vi } from 'vitest'
import { cachePastedRemoteImages, downloadMarkdownImages } from './fileService'

const invoke = vi.hoisted(() => vi.fn(async (command: string, args?: { url?: string }) => {
  if (command !== 'download_remote_image') return undefined
  if (args?.url?.endsWith('/missing.png')) throw new Error('image unavailable')
  return { bytes: [1, 2], mime: 'image/webp' }
}))
const writeFile = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke, convertFileSrc: (path: string) => path }))
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => 'C:\\User Name\\墨阅\\' }))
vi.mock('@tauri-apps/plugin-fs', async importOriginal => ({ ...await importOriginal<typeof import('@tauri-apps/plugin-fs')>(), mkdir: vi.fn(async () => {}), writeFile }))

describe('clipboard image downloads', () => {
  it('unescapes a pasted image URL and saves it as a local image', async () => {
    const result = await downloadMarkdownImages('C:/notes/test.md', '[image](https://img-view-c-sz.drive.quark.cn/a/preview?x=1\\&y=2)')
    expect(invoke).toHaveBeenCalledWith('download_remote_image', { url: 'https://img-view-c-sz.drive.quark.cn/a/preview?x=1&y=2' })
    expect(result.source).toMatch(/^!\[image\]\(\.moyue-assets\/download-.*\.webp\)$/)
    expect(writeFile).toHaveBeenCalled()
  })

  it('keeps an unsaved paste backed by an encoded application data path', async () => {
    const result = await cachePastedRemoteImages('![image](https://example.com/a.png)')
    expect(result.source).toContain('C:/User%20Name/%E5%A2%A8%E9%98%85/.moyue-assets/')
    expect(result.count).toBe(1)
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
