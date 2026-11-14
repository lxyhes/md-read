import { beforeEach, expect, it, vi } from 'vitest'
import { bindNativeClose } from './nativeClose'

const native = vi.hoisted(() => ({
  tauri: true,
  handler: null as null | ((event: { preventDefault: () => void }) => Promise<void>),
  invoke: vi.fn(async () => {}),
  unlisten: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.tauri, invoke: native.invoke }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async (handler) => { native.handler = handler; return native.unlisten }),
  }),
}))

beforeEach(() => {
  native.tauri = true
  native.handler = null
  vi.clearAllMocks()
})

it('persists a dirty draft before exiting the native app', async () => {
  const preventDefault = vi.fn()
  const persist = vi.fn(async () => true)
  await bindNativeClose(() => true, persist, vi.fn())
  await native.handler?.({ preventDefault })
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(persist).toHaveBeenCalledOnce()
  expect(native.invoke).toHaveBeenCalledWith('exit_app')
})

it('keeps the window open when the draft cannot be persisted', async () => {
  const report = vi.fn()
  await bindNativeClose(() => true, async () => false, report)
  await native.handler?.({ preventDefault: vi.fn() })
  expect(native.invoke).not.toHaveBeenCalled()
  expect(report).toHaveBeenCalledWith(expect.stringContaining('已取消关闭'))
})

it('exits a clean native window without writing a draft', async () => {
  const preventDefault = vi.fn()
  const persist = vi.fn(async () => true)
  await bindNativeClose(() => false, persist, vi.fn())
  await native.handler?.({ preventDefault })
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(persist).not.toHaveBeenCalled()
  expect(native.invoke).toHaveBeenCalledWith('exit_app')
})
