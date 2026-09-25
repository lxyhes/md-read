import { convertFileSrc, invoke, isTauri as tauriIsTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { copyFile, mkdir, readDir, readTextFile, rename, watch, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'

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
  let timer: number | null = null
  let stopNative = () => {}
  try {
    stopNative = await watch(directory || path, () => { void check() }, { delayMs: 700 })
  } catch {
    timer = window.setInterval(() => { void check() }, 1500)
  }
  return () => { stopped = true; if (timer !== null) window.clearInterval(timer); stopNative() }
}

export function resolveMarkdownAssetUrl(markdownPath: string, url: string, browserAssets?: BrowserAssetMap): string {
  const value = url.trim()
  if (!value || value.startsWith('#')) return url
  const remoteAsset = browserAssets?.[value]
  if (remoteAsset) return remoteAsset
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

export async function createRemoteAssetMap(urls: Iterable<string>): Promise<Record<string, string>> {
  if (!isTauri()) return {}
  const candidates = [...new Set(urls)].filter(isSupportedRemoteImage)
  const entries = await Promise.all(candidates.map(async (url) => {
    try {
      const result = await invoke<{ bytes: number[]; mime: string }>('read_remote_image', { url })
      const bytes = Uint8Array.from(result.bytes)
      return [url, URL.createObjectURL(new Blob([bytes], { type: result.mime || 'image/jpeg' }))] as const
    } catch (error) {
      console.warn(`无法缓存远程图片：${url}`, error)
      return null
    }
  }))
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)))
}

export async function authorizeMarkdownAssets(markdownPath: string): Promise<void> {
  if (!isTauri()) return
  const directory = dirnameOf(markdownPath)
  if (!directory) return
  await invoke('allow_asset_directory', { path: directory })
}

/**
 * Persist an image pasted into a real Markdown file next to that file.
 * Keeping the image out of the Markdown source avoids enormous base64 strings
 * making the editor difficult to navigate and keeps the document portable.
 */
export async function saveClipboardImage(markdownPath: string, image: Blob): Promise<string | null> {
  if (!isTauri()) return null
  const directory = dirnameOf(markdownPath)
  if (!directory) return null

  const assetDirectory = `${directory}/.moyue-assets`
  await mkdir(assetDirectory, { recursive: true })
  const extension = clipboardImageExtension(image.type)
  const fileName = `pasted-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const absolutePath = `${assetDirectory}/${fileName}`
  await writeFile(absolutePath, new Uint8Array(await image.arrayBuffer()), { createNew: true })
  await authorizeMarkdownAssets(markdownPath)
  return `.moyue-assets/${fileName}`
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

export async function listDirectoryFiles(path: string): Promise<WorkspaceFile[]> {
  if (!isTauri()) return []
  const directory = dirnameOf(path)
  if (!directory) return []
  const entries = await readDir(directory)
  return entries
    .filter((entry) => !entry.isDirectory)
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

export async function saveMarkdownFile(source: string, defaultName = '剪贴板'): Promise<string | null> {
  if (!isTauri()) throw new Error('浏览器预览无法保存文件，请使用桌面端打开')
  const selected = await save({
    defaultPath: `${defaultName}.md`,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  })
  if (!selected) return null
  const path = /\.(md|markdown)$/i.test(selected) ? selected : `${selected}.md`
  await createMarkdownFile(path, source)
  return path
}

export async function writeMarkdownFile(path: string, source: string): Promise<void> {
  if (!isTauri()) throw new Error('浏览器预览无法写入文件，请使用桌面端打开')
  if (!/\.(md|markdown)$/i.test(path)) throw new Error('只能写入 Markdown 文件')
  await writeTextFile(path, source)
}

export async function saveExportFile(source: string, defaultName: string, extension: string, filterName: string): Promise<string | null> {
  if (!isTauri()) {
    const blob = new Blob([source], { type: filterName === 'HTML' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${defaultName}.${extension}`
    anchor.click()
    URL.revokeObjectURL(url)
    return anchor.download
  }
  const selected = await save({ defaultPath: `${defaultName}.${extension}`, filters: [{ name: filterName, extensions: [extension] }] })
  if (!selected) return null
  const path = selected.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? selected : `${selected}.${extension}`
  await writeTextFile(path, source)
  return path
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

export async function openFileSystemDirectory(path: string): Promise<void> {
  if (!isTauri()) throw new Error('浏览器预览无法打开系统目录，请使用桌面端打开')
  const normalized = path.replace(/\\/g, '/')
  const directory = /^[A-Za-z]:\/$/.test(normalized) ? normalized : normalized.replace(/\/+$/, '') || '/'
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
  if (separator < 0) return ''
  const parent = normalized.slice(0, separator)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent || '/'
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

function clipboardImageExtension(mime: string) {
  switch (mime.split(';', 1)[0].toLowerCase()) {
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    case 'image/avif': return 'avif'
    case 'image/bmp': return 'bmp'
    case 'image/svg+xml': return 'svg'
    default: return 'png'
  }
}

function isSupportedRemoteImage(url: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && (host === 'mmbiz.qpic.cn' || host.endsWith('.xhscdn.com') || host === 'ci.xiaohongshu.com')
  } catch {
    return false
  }
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
