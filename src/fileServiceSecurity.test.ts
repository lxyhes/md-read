import { describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { createTauriAssetMap, isLocalMarkdownAssetPath, remoteImageLogTarget, resolveMarkdownAssetUrl } from './fileService'
import { renderMarkdownFragment } from './markdown/fragment'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn(), convertFileSrc: (path: string) => `asset:${path}` }))
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: async () => 'C:/Users/reader/AppData/Roaming/com.moyue.reader',
  configDir: async () => 'C:\\Users\\reader\\AppData\\Roaming\\',
}))
vi.mock('@tauri-apps/plugin-fs', async importOriginal => ({ ...await importOriginal<typeof import('@tauri-apps/plugin-fs')>() }))

describe('local Markdown asset boundaries', () => {
  it('renders a Typora Windows image and skips neighboring directories', async () => {
    const path = 'D:/notes/readme.md'
    const image = String.raw`C:\Users\reader\AppData\Roaming\Typora\typora-user-images\cover.png`
    const outside = image.replace('typora-user-images', 'typora-user-images-other')
    vi.mocked(invoke).mockResolvedValueOnce([1, 2, 3])
    const assets = await createTauriAssetMap(path, [image, outside])
    try {
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(renderMarkdownFragment(`![cover](${image})`, (url) => resolveMarkdownAssetUrl(path, url, assets)))
        .toContain('<img src="blob:')
    } finally {
      Object.values(assets).forEach((url) => URL.revokeObjectURL(url))
    }
  })

  it('keeps passive asset reads inside the Markdown directory', () => {
    expect(isLocalMarkdownAssetPath('C:/notes/readme.md', 'C:/notes/assets/cover.png')).toBe(true)
    expect(isLocalMarkdownAssetPath('C:/notes/readme.md', 'C:/private/secret.png')).toBe(false)
    expect(resolveMarkdownAssetUrl('C:/notes/readme.md', '../private/secret.png')).toBe('')
  })

  it('does not expose signed remote image query strings in diagnostics', () => {
    expect(remoteImageLogTarget('https://img-view-c-sz.drive.quark.cn/a/preview?auth_key=secret&token=secret')).toBe('img-view-c-sz.drive.quark.cn')
  })

  it('allows preloaded session assets without allowing arbitrary absolute paths', () => {
    const sessionAsset = 'C:/Users/Laobool/AppData/Roaming/com.moyue.reader/.moyue-assets/download.webp'
    expect(resolveMarkdownAssetUrl('pasted.md', sessionAsset, {
      'c:/users/laobool/appdata/roaming/com.moyue.reader/.moyue-assets/download.webp': 'blob:session-image',
    })).toBe('blob:session-image')
    expect(resolveMarkdownAssetUrl('pasted.md', 'C:/Users/Laobool/private/secret.webp')).toBe('')
  })
})
