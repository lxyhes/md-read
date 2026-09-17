import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile } from '@tauri-apps/plugin-fs'

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface OpenedFile { path: string; source: string }
export interface WorkspaceFile { path: string; name: string }

export async function openMarkdownFile(): Promise<OpenedFile[]> {
  if (isTauri()) {
    const selected = await open({ multiple: true, filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] })
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
    return Promise.all(paths.map(async (path) => ({ path, source: await readTextFile(path) })))
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,text/markdown'
    input.multiple = true
    let settled = false
    const finish = async () => {
      if (settled) return
      settled = true
      resolve(await filesToOpened(input.files))
    }
    input.onchange = () => { void finish() }
    input.oncancel = () => { settled = true; resolve([]) }
    input.click()
  })
}

export async function openMarkdownFolder(): Promise<OpenedFile[]> {
  if (isTauri()) {
    const selected = await open({ directory: true, multiple: false })
    if (!selected || Array.isArray(selected)) return []
    return scanDirectory(selected)
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.webkitdirectory = true
    let settled = false
    const finish = async () => {
      if (settled) return
      settled = true
      resolve(await filesToOpened(input.files))
    }
    input.onchange = () => { void finish() }
    input.oncancel = () => { settled = true; resolve([]) }
    input.click()
  })
}

export async function listMarkdownFiles(path: string): Promise<WorkspaceFile[]> {
  if (!isTauri()) return []
  const directory = dirnameOf(path)
  if (!directory) return []
  const entries = await readDir(directory)
  return entries
    .filter((entry) => !entry.isDirectory && /\.(md|markdown)$/i.test(entry.name))
    .map((entry) => ({ name: entry.name, path: `${directory}/${entry.name}` }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

export async function readMarkdownPath(path: string): Promise<string> {
  if (!isTauri()) throw new Error('浏览器预览无法读取未载入文件，请使用桌面端打开')
  return readTextFile(path)
}

async function filesToOpened(files: FileList | null): Promise<OpenedFile[]> {
  if (!files) return []
  return Promise.all(Array.from(files).filter((file) => /\.(md|markdown)$/i.test(file.name)).map(async (file) => ({ path: file.webkitRelativePath || file.name, source: await file.text() })))
}

function dirnameOf(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const separator = normalized.lastIndexOf('/')
  return separator > 0 ? normalized.slice(0, separator) : ''
}

async function scanDirectory(path: string): Promise<OpenedFile[]> {
  const result: OpenedFile[] = []
  async function visit(directory: string) {
    const entries = await readDir(directory)
    for (const entry of entries) {
      const child = `${directory}/${entry.name}`
      if (entry.isDirectory && !['.git', 'node_modules', 'dist', 'build', '.idea', '.vscode'].includes(entry.name)) await visit(child)
      else if (!entry.isDirectory && /\.(md|markdown)$/i.test(entry.name)) result.push({ path: child, source: await readTextFile(child) })
    }
  }
  await visit(path)
  return result
}
