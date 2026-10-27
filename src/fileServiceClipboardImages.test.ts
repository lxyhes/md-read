import { describe, expect, it, vi } from 'vitest'
import { cachePastedRemoteImages, downloadMarkdownImages } from './fileService'

const invoke = vi.hoisted(() => vi.fn(async (command: string) => command === 'download_remote_image' ? { bytes: [1, 2], mime: 'image/webp' } : undefined))
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
})
