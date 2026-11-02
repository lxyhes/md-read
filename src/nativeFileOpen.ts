import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export async function bindNativeFileOpen(open: (path: string) => Promise<void>, reportError: (error: unknown) => void): Promise<() => void> {
  if (!isTauri()) return () => {}
  let stopped = false
  let pending = Promise.resolve()
  const drain = () => {
    pending = pending.then(async () => {
      if (stopped) return
      const paths = await invoke<string[]>('take_open_files')
      for (const path of paths) {
        if (stopped) return
        try { await open(path) } catch (error) { reportError(error) }
      }
    }).catch(reportError)
    return pending
  }
  // Subscribe before draining so opens during startup cannot fall between the two.
  const unlisten = await listen('native-open-files', () => { void drain() })
  await drain()
  return () => { stopped = true; unlisten() }
}
