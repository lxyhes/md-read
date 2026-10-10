import { invoke, isTauri } from '@tauri-apps/api/core'

export async function readNativeClipboardRichText(expectedText?: string): Promise<{ text: string; html: string } | null> {
  if (!isTauri()) return null
  try {
    const content = await invoke<{ text: string; html: string }>('read_clipboard_rich_text')
    // A paste event may refer to an older clipboard than the asynchronous native read.
    if (expectedText !== undefined && content.text.replace(/\r\n?/g, '\n') !== expectedText.replace(/\r\n?/g, '\n')) return null
    return content.text || content.html ? content : null
  } catch {
    return null
  }
}
