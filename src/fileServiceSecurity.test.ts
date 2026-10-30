import { describe, expect, it, vi } from 'vitest'
import { isLocalMarkdownAssetPath, remoteImageLogTarget, resolveMarkdownAssetUrl } from './fileService'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn(), convertFileSrc: (path: string) => `asset:${path}` }))
vi.mock('@tauri-apps/plugin-fs', async importOriginal => ({ ...await importOriginal<typeof import('@tauri-apps/plugin-fs')>() }))

describe('local Markdown asset boundaries', () => {
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
