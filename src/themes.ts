import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { MoyueTheme, ThemeManifest, ThemeTokens } from './types'

export const defaultTokens: ThemeTokens = {
  color: {
    appBackground: '#0b1230', surface: '#111b3d', surfaceRaised: '#182751', text: '#edf1ff', textMuted: '#a7b2d7', accent: '#8b82ff', accentSoft: '#303b7a', border: 'rgba(183,194,255,.18)', codeBackground: '#080f28'
  },
  reader: { width: 760, fontSize: 18, lineHeight: 1.82, paragraphGap: 22, fontFamily: 'Iowan Old Style, Palatino Linotype, Georgia, serif' }
}

export const builtInThemes: MoyueTheme[] = [
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'ember-paper', name: '月影深蓝', version: '1.0.0', author: 'Moyue', mode: 'dark', description: '蓝紫山景质感的沉浸式长文阅读空间', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: defaultTokens
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'quiet-moss', name: '静默苔原', version: '1.0.0', author: 'Moyue', mode: 'light', description: '适合白天长时间阅读的浅色主题', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#e9e7df', surface: '#f3f1e9', surfaceRaised: '#ffffff', text: '#24312d', textMuted: '#6c7970', accent: '#5d806d', accentSoft: '#d8e5db', border: 'rgba(36,49,45,.13)', codeBackground: '#e5e4dd' }, reader: { width: 760, fontSize: 18, lineHeight: 1.86, paragraphGap: 22, fontFamily: 'Iowan Old Style, Palatino Linotype, Georgia, serif' } }
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'blue-hour', name: '蓝调时刻', version: '1.0.0', author: 'Moyue', mode: 'dark', description: '冷静、清晰的夜间技术阅读主题', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#101a23', surface: '#172631', surfaceRaised: '#213746', text: '#e3eff2', textMuted: '#8ea9b0', accent: '#8dd6d0', accentSoft: '#254e52', border: 'rgba(227,239,242,.13)', codeBackground: '#0d151c' }, reader: { width: 780, fontSize: 18, lineHeight: 1.8, paragraphGap: 20, fontFamily: 'Iowan Old Style, Palatino Linotype, Georgia, serif' } }
  }
]

const blocked = /(<script|<iframe|javascript:|@import|url\s*\(\s*['"]?https?:|expression\s*\(|\.\.|\bwasm\b)/i

export function validateTheme(manifest: ThemeManifest, files: Record<string, string>): void {
  if (manifest.schemaVersion !== 1 || !manifest.id || !manifest.name || !manifest.entry?.tokens) throw new Error('主题 manifest 无效')
  const paths = Object.values(manifest.entry)
  if (paths.some((path) => typeof path !== 'string' || path.startsWith('/') || path.includes('..'))) throw new Error('主题包含不安全路径')
  for (const content of Object.values(files)) if (blocked.test(content)) throw new Error('主题包含被禁止的脚本或远程资源')
}

export async function importTheme(file: File): Promise<MoyueTheme> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const entries = unzipSync(bytes)
  const read = (path: string) => entries[path] ? strFromU8(entries[path]) : ''
  const manifest = JSON.parse(read('manifest.json')) as ThemeManifest
  const files: Record<string, string> = { manifest: read('manifest.json'), tokens: read(manifest.entry.tokens), reader: read(manifest.entry.reader), markdown: read(manifest.entry.markdown), components: read(manifest.entry.components), code: manifest.entry.code ? read(manifest.entry.code) : '', mermaid: manifest.entry.mermaid ? read(manifest.entry.mermaid) : '' }
  validateTheme(manifest, files)
  return { manifest, tokens: JSON.parse(files.tokens) as ThemeTokens, readerCss: files.reader, markdownCss: files.markdown, componentsCss: files.components, codeCss: files.code, mermaidCss: files.mermaid }
}

export function exportTheme(theme: MoyueTheme): Blob {
  validateTheme(theme.manifest, { tokens: JSON.stringify(theme.tokens), reader: theme.readerCss ?? '', markdown: theme.markdownCss ?? '', components: theme.componentsCss ?? '' })
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(theme.manifest, null, 2)),
    'tokens.json': strToU8(JSON.stringify(theme.tokens, null, 2)),
    [theme.manifest.entry.reader]: strToU8(theme.readerCss ?? ''),
    [theme.manifest.entry.markdown]: strToU8(theme.markdownCss ?? ''),
    [theme.manifest.entry.components]: strToU8(theme.componentsCss ?? '')
  }
  return new Blob([zipSync(files) as unknown as BlobPart], { type: 'application/zip' })
}

export function cssVariables(theme: MoyueTheme): Record<string, string> {
  const { color } = theme.tokens
  return {
    '--app-bg': color.appBackground, '--surface': color.surface, '--surface-raised': color.surfaceRaised, '--ink': color.text, '--muted': color.textMuted, '--accent': color.accent, '--accent-soft': color.accentSoft, '--border': color.border, '--code-bg': color.codeBackground, '--reader-width': `${theme.tokens.reader.width}px`, '--reader-size': `${theme.tokens.reader.fontSize}px`, '--reader-leading': String(theme.tokens.reader.lineHeight), '--reader-gap': `${theme.tokens.reader.paragraphGap}px`, '--reader-font': theme.tokens.reader.fontFamily
  }
}
