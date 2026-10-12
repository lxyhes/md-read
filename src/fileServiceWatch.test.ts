import { describe, expect, it, vi } from 'vitest'
import { watchDirectoryPath } from './fileService'

const watch = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn(), convertFileSrc: (path: string) => path }))
vi.mock('@tauri-apps/plugin-fs', async importOriginal => ({ ...await importOriginal<typeof import('@tauri-apps/plugin-fs')>(), watch }))

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
})
