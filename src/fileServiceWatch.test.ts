import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchDirectoryPath } from './fileService'

const watch = vi.hoisted(() => vi.fn())
const readTextFile = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn(), convertFileSrc: (path: string) => path }))
vi.mock('@tauri-apps/plugin-fs', async importOriginal => ({ ...await importOriginal<typeof import('@tauri-apps/plugin-fs')>(), readTextFile, watch }))

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('directory watcher', () => {
  it('forwards native changes and stops forwarding after cleanup', async () => {
    const stopNative = vi.fn()
    let trigger: (() => void) | undefined
    watch.mockImplementationOnce(async (_path: string, callback: () => void) => {
      trigger = callback
      return stopNative
    })
    const onChange = vi.fn()
    const stop = await watchDirectoryPath('C:/notes', onChange)

    trigger?.()
    expect(onChange).toHaveBeenCalledTimes(1)
    stop?.()
    trigger?.()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(stopNative).toHaveBeenCalledTimes(1)
  })

  it('keeps polling when native watching starts', async () => {
    vi.useFakeTimers()
    readTextFile.mockResolvedValueOnce('before').mockResolvedValue('after')
    watch.mockResolvedValueOnce(vi.fn())
    const onChange = vi.fn()
    const stop = await import('./fileService').then(({ watchMarkdownPath }) => watchMarkdownPath('C:/notes/readme.md', onChange))

    await vi.advanceTimersByTimeAsync(1500)

    expect(onChange).toHaveBeenCalledTimes(1)
    stop?.()
  })
})
