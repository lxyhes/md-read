// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, type App } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import ClipboardManager from './components/ClipboardManager.vue'
import { formatClipboardToMarkdown } from './pasteMarkdown'
import { parseMarkdown } from './parser'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
let app: App | undefined
afterEach(() => {
  app?.unmount()
  vi.useRealTimers()
  app = undefined
  document.body.replaceChildren()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

const times = ['10:53', '15:29', '24:21', '38:02', '42:42', '01:02:58', '01:11:02', '01:10:58']
const seconds = [653, 929, 1461, 2282, 2562, 3778, 4262, 4258]
const intro = '本视频讲述了直播电商选品的核心逻辑与实战方法。'
const chapters = times.map((time, index) => `<h3><strong>课程章节 <a href="https://b.quark.cn/video?debug=0&amp;fid=lesson#?seek_t=${seconds[index]}">${time}</a></strong></h3><ul><li><strong>主力客群定义与层级</strong><ul><li><strong>第一标签客群</strong>：需求最强烈的用户</li></ul></li></ul>`).join('')
const html = `<div class="markdown-content-wrapper" style="background-color: rgb(18, 18, 18); color: white"><p>${intro}</p>${chapters}</div>`
const text = `${intro}\n\n${times.map(time => `课程章节 ${time}\n主力客群定义与层级\n第一标签客群：需求最强烈的用户`).join('\n')}`

it('keeps eight real timestamp links, nesting and emphasis from a dark webpage', () => {
  const pasted = formatClipboardToMarkdown(html, text)
  const rendered = parseMarkdown('dark-course.md', pasted).regions.map(region => region.html).join('')
  expect(rendered.match(/<a href=/g)).toHaveLength(8)
  times.forEach((time, index) => expect(pasted).toContain(`[${time}](https://b.quark.cn/video?debug=0&fid=lesson#?seek_t=${seconds[index]})`))
  expect(rendered).toMatch(/<ul><li>[\s\S]*<ul><li>/)
  expect(rendered).toContain('<strong>第一标签客群</strong>')
})

it('still recognizes actual dark code blocks', () => {
  expect(formatClipboardToMarkdown('<div style="background-color:#111"><span>const x = 1;</span><br><span>const y = 2;</span></div>', '')).toContain('```plain')
})

it('stores HTML in desktop clipboard history and restores it on copy', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === 'read_clipboard_signature') return { kind: 'system', signature: 'copy-1' }
    if (command === 'read_clipboard_snapshot') return { kind: 'text', signature: 'rich-1', text, html }
    return undefined
  })
  const container = document.createElement('div')
  document.body.append(container)
  app = createApp(ClipboardManager)
  app.mount(container)
  await vi.advanceTimersByTimeAsync(200)
  expect(JSON.parse(localStorage.getItem('moyue:clipboard-history') ?? '[]')[0]?.html).toBe(html)
  const button = container.querySelector<HTMLButtonElement>('.clipboard-copy-button')!
  button.click()
  expect(invoke).toHaveBeenCalledWith('write_clipboard_snapshot', { kind: 'text', text, html, bytes: null })
})
