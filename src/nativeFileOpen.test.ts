import { beforeEach, expect, it, vi } from 'vitest'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { bindNativeFileOpen } from './nativeFileOpen'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))

let wake: () => void
const unlisten = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isTauri).mockReturnValue(true)
  vi.mocked(listen).mockImplementation(async (_event, handler) => {
    wake = () => handler({ event: 'native-open-files', id: 1, payload: null })
    return unlisten
  })
  vi.mocked(invoke).mockResolvedValue([])
})

it('subscribes before opening files buffered during cold startup', async () => {
  vi.mocked(invoke).mockResolvedValueOnce(['C:/中文 目录/文档.MD', 'C:/notes/book.qmd'])
  const open = vi.fn().mockResolvedValue(undefined)
  const stop = await bindNativeFileOpen(open, vi.fn())
  expect(vi.mocked(listen).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(invoke).mock.invocationCallOrder[0]!)
  expect(open.mock.calls.map(([path]) => path)).toEqual(['C:/中文 目录/文档.MD', 'C:/notes/book.qmd'])
  stop()
  expect(unlisten).toHaveBeenCalledOnce()
})

it('serializes new opens arriving while a document is still loading', async () => {
  let finishFirst!: () => void
  const first = new Promise<void>(resolve => { finishFirst = resolve })
  const open = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined)
  vi.mocked(invoke).mockResolvedValueOnce(['first.md']).mockResolvedValueOnce(['second.md'])
  const binding = bindNativeFileOpen(open, vi.fn())
  await vi.waitFor(() => expect(open).toHaveBeenCalledWith('first.md'))
  wake()
  expect(invoke).toHaveBeenCalledTimes(1)
  finishFirst()
  const stop = await binding
  await vi.waitFor(() => expect(open).toHaveBeenCalledWith('second.md'))
  stop()
})

it('reports a missing file and continues with the next file', async () => {
  const error = new Error('文件不存在')
  const report = vi.fn()
  const open = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined)
  vi.mocked(invoke).mockResolvedValueOnce(['missing.md', 'readable.md'])
  const stop = await bindNativeFileOpen(open, report)
  expect(report).toHaveBeenCalledWith(error)
  expect(open).toHaveBeenLastCalledWith('readable.md')
  stop()
})

it('does not register native handlers in browser preview', async () => {
  vi.mocked(isTauri).mockReturnValue(false)
  const stop = await bindNativeFileOpen(vi.fn(), vi.fn())
  stop()
  expect(listen).not.toHaveBeenCalled()
  expect(invoke).not.toHaveBeenCalled()
})
