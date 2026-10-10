import { beforeEach, expect, it, vi } from 'vitest'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { readNativeClipboardRichText } from './nativeClipboard'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }))
beforeEach(() => { vi.resetAllMocks(); vi.mocked(isTauri).mockReturnValue(true) })

it('keeps original HTML links alongside the same plain-text paste', async () => {
  const content = { text: '课程导引与基础认知 10:53', html: '<h3>课程导引与基础认知 <a href="https://example.com/#?seek_t=653">10:53</a></h3>' }
  vi.mocked(invoke).mockResolvedValue(content)
  expect(await readNativeClipboardRichText(content.text)).toEqual(content)
  expect(invoke).toHaveBeenCalledWith('read_clipboard_rich_text')
})

it('rejects HTML from a different clipboard after a copy race', async () => {
  vi.mocked(invoke).mockResolvedValue({ text: '另一段内容', html: '<a href="https://example.com/other">另一段内容</a>' })
  expect(await readNativeClipboardRichText('课程导引与基础认知 10:53')).toBeNull()
})

it('accepts Windows line endings and supports native button reads', async () => {
  const content = { text: '标题\r\n正文', html: '<p>标题</p><p>正文</p>' }
  vi.mocked(invoke).mockResolvedValue(content)
  expect(await readNativeClipboardRichText('标题\n正文')).toEqual(content)
  expect(await readNativeClipboardRichText()).toEqual(content)
})

it('falls back safely when native clipboard access fails', async () => {
  vi.mocked(invoke).mockRejectedValue(new Error('clipboard busy'))
  expect(await readNativeClipboardRichText('正文')).toBeNull()
})

it('does not call native clipboard commands in the browser', async () => {
  vi.mocked(isTauri).mockReturnValue(false)
  expect(await readNativeClipboardRichText()).toBeNull()
  expect(invoke).not.toHaveBeenCalled()
})
