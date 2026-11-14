import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export async function bindNativeClose(
  hasUnsavedDraft: () => boolean,
  persistDraft: () => Promise<boolean>,
  reportError: (message: string) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const appWindow = getCurrentWindow()
  let closing = false
  return appWindow.onCloseRequested(async event => {
    event.preventDefault()
    if (closing) return
    closing = true
    if (hasUnsavedDraft() && !(await persistDraft())) {
      closing = false
      reportError('草稿备份失败，已取消关闭；请先保存或另存副本')
      return
    }
    await invoke('exit_app')
  })
}
