import { convertFileSrc, invoke, isTauri as tauriIsTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { copyFile, mkdir, readDir, readTextFile, rename, watch, writeTextFile } from '@tauri-apps/plugin-fs'

const isTauri = () => tauriIsTauri()

export type BrowserAssetMap = Readonly<Record<string, string>>
export interface OpenedFile { path: string; source: string; assets?: BrowserAssetMap }
export interface WorkspaceFile { path: string; name: string }
export interface FileSystemEntry { path: string; name: string; isDirectory: boolean }

export async function watchMarkdownPath(path: string, onChange: () => void): Promise<(() => void) | null> {
  if (!isTauri()) return null
  const directory = dirnameOf(path)
  let lastSource: string | null = null
  let checking = false
  let stopped = false
  const check = async () => {
    if (stopped || checking) return
    checking = true
    try {
      const source = await readTextFile(path)
      if (lastSource !== null && source !== lastSource) onChange()
      lastSource = source
    } catch {
      // External editors may replace the file briefly; the next check retries.
    } finally {
      checking = false
    }
  }
  await check()
  const timer = window.setInterval(() => { void check() }, 1500)
  let stopNative = () => {}
  try {
    stopNative = await watch(directory || path, () => { void check() }, { delayMs: 700 })
  } catch {
    // Polling remains available when the filesystem watcher is unsupported.
  }
  return () => { stopped = true; window.clearInterval(timer); stopNative() }
}

export function resolveMarkdownAssetUrl(markdownPath: string, url: string, browserAssets?: BrowserAssetMap): string {
  const value = url.trim()
  if (!value || value.startsWith('#')) return url
  const match = value.match(/^([^?#]*)(.*)$/)
  const rawPath = match?.[1] ?? value
  const localPath = localAssetPath(decodeUrlPath(rawPath))
  if (!localPath) return url

  const absolutePath = resolveLocalAssetPath(markdownPath, localPath)
  const loadedUrl = browserAssets?.[assetKey(absolutePath)] ?? browserAssets?.[assetKey(localPath)]
  if (loadedUrl) return `${loadedUrl}${match?.[2] ?? ''}`
  if (!isTauri()) return url
  return `${convertFileSrc(absolutePath)}${match?.[2] ?? ''}`
}

export async function createTauriAssetMap(markdownPath: string, urls: Iterable<string>): Promise<Record<string, string>> {
  const assets: Record<string, string> = {}
  if (!isTauri()) return assets
  for (const url of new Set(urls)) {
    const rawPath = url.trim().match(/^([^?#]*)/)?.[1] ?? ''
    const localPath = localAssetPath(decodeUrlPath(rawPath))
    if (!localPath || !isImagePath(localPath)) continue
    const absolutePath = resolveLocalAssetPath(markdownPath, localPath)
    try {
      const response = await invoke<ArrayBuffer | number[]>('read_local_image', { path: absolutePath })
      const bytes = response instanceof ArrayBuffer ? new Uint8Array(response) : Uint8Array.from(response)
      assets[assetKey(absolutePath)] = URL.createObjectURL(new Blob([bytes], { type: imageMimeType(absolutePath) }))
    } catch (error) { console.error(`无法读取 Markdown 图片：${absolutePath}`, error) }
  }
  return assets
}

export async function authorizeMarkdownAssets(markdownPath: string): Promise<void> {
  if (!isTauri()) return
  const directory = dirnameOf(markdownPath)
  if (!directory) return
  await invoke('allow_asset_directory', { path: directory })
}

export function createBrowserAssetMap(files: File[]): Record<string, string> {
  const assets: Record<string, string> = {}
  for (const file of files) {
    const path = file.webkitRelativePath || file.name
    if (!isImagePath(path)) continue
    assets[assetKey(path)] = URL.createObjectURL(file)
  }
  return assets
}

export async function openMarkdownFile(): Promise<OpenedFile[]> {
  if (isTauri()) {
    const selected = await open({ multiple: true, filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] })
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
    return Promise.all(paths.map(async (path) => ({ path, source: await readTextFile(path) })))
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,text/markdown,image/*'
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

export async function listFileSystemEntries(path: string): Promise<FileSystemEntry[]> {
  if (!isTauri()) throw new Error('浏览器预览无法读取系统文件树，请使用桌面端打开')
  const directory = path.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  const entries = await readDir(directory)
  return entries
    .map((entry) => ({ name: entry.name, path: directory === '/' ? `/${entry.name}` : `${directory}/${entry.name}`, isDirectory: Boolean(entry.isDirectory) }))
    .sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name, 'zh-CN'))
}

export async function readMarkdownPath(path: string): Promise<string> {
  if (!isTauri()) throw new Error('浏览器预览无法读取未载入文件，请使用桌面端打开')
  return readTextFile(path)
}

export async function createMarkdownFile(path: string, source = ''): Promise<void> {
  if (!isTauri()) throw new Error('浏览器预览无法新建文件，请使用桌面端打开')
  if (!/\.(md|markdown)$/i.test(path)) throw new Error('只能创建 Markdown 文件')
  await writeTextFile(path, source)
}

export async function createMarkdownDirectory(path: string): Promise<void> {
  if (!isTauri()) throw new Error('浏览器预览无法新建文件夹，请使用桌面端打开')
  await mkdir(path)
}

export async function renameMarkdownPath(path: string, nextPath: string): Promise<void> {
  if (!isTauri()) throw new Error('浏览器预览无法重命名文件，请使用桌面端打开')
  if (!/\.(md|markdown)$/i.test(path) || !/\.(md|markdown)$/i.test(nextPath)) throw new Error('只能重命名 Markdown 文件')
  await rename(path, nextPath)
}

export async function copyMarkdownPath(path: string, nextPath: string): Promise<void> {
  if (!isTauri()) throw new Error('浏览器预览无法创建文件副本，请使用桌面端打开')
  if (!/\.(md|markdown)$/i.test(path) || !/\.(md|markdown)$/i.test(nextPath)) throw new Error('只能复制 Markdown 文件')
  await copyFile(path, nextPath)
}

export async function openMarkdownDirectory(path: string): Promise<void> {
  if (!isTauri()) throw new Error('浏览器预览无法打开系统目录，请使用桌面端打开')
  const directory = dirnameOf(path)
  if (!directory) throw new Error('当前文件没有可用的目录路径')
  await invoke('open_directory', { path: directory })
}

async function filesToOpened(files: FileList | null): Promise<OpenedFile[]> {
  if (!files) return []
  const selectedFiles = Array.from(files)
  const assets = createBrowserAssetMap(selectedFiles)
  return Promise.all(selectedFiles.filter((file) => /\.(md|markdown)$/i.test(file.name)).map(async (file) => ({ path: file.webkitRelativePath || file.name, source: await file.text(), assets })))
}

function dirnameOf(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const separator = normalized.lastIndexOf('/')
  return separator > 0 ? normalized.slice(0, separator) : ''
}

function normalizeLocalPath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const drive = normalized.match(/^[A-Za-z]:/)?.[0] ?? ''
  const prefix = drive || (normalized.startsWith('/') ? '/' : '')
  const segments = normalized.slice(prefix.length).split('/')
  const result: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') { if (result.length && result[result.length - 1] !== '..') result.pop(); continue }
    result.push(segment)
  }
  return `${prefix}${drive ? '/' : ''}${result.join('/')}`
}

function decodeUrlPath(path: string) {
  try { return decodeURIComponent(path) } catch { return path }
}

function localAssetPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) return normalized
  if (/^file:\/\//i.test(normalized)) {
    const filePath = normalized.replace(/^file:\/\//i, '').replace(/^\/([A-Za-z]:[\\/])/, '$1')
    return filePath || null
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) || normalized.startsWith('//')) return null
  return normalized
}

function resolveLocalAssetPath(markdownPath: string, assetPath: string) {
  if (/^(?:[A-Za-z]:\/|\/)/.test(assetPath)) return normalizeLocalPath(assetPath)
  const directory = dirnameOf(markdownPath)
  return normalizeLocalPath(directory ? `${directory}/${assetPath}` : assetPath)
}

function assetKey(path: string) {
  return normalizeLocalPath(path).replace(/^\.\//, '').toLowerCase()
}

function isImagePath(path: string) {
  return /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path)
}

function imageMimeType(path: string) {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension === 'svg' ? 'image/svg+xml' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension || 'png'}`
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
