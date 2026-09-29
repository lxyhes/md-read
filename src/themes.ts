import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { MoyueTheme, ThemeManifest, ThemeTokens } from './types'

export const defaultTokens: ThemeTokens = {
  color: {
    appBackground: '#0d1426', surface: '#151f34', surfaceRaised: '#1d2942', text: '#e8eaf2', textMuted: '#9ca5bd', accent: '#a5a2d8', accentSoft: '#2b3558', border: 'rgba(179,185,211,.18)', codeBackground: '#09111f'
  },
  reader: { width: 760, fontSize: 18, lineHeight: 1.82, paragraphGap: 22, fontFamily: 'Iowan Old Style, Palatino Linotype, Georgia, serif' }
}

export const builtInThemes: MoyueTheme[] = [
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'ember-paper', name: '月影深蓝', version: '1.0.0', author: 'Moyue', mode: 'dark', description: '深靛蓝底色与低饱和紫调，适合夜间长文阅读', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: defaultTokens
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'quiet-moss', name: '静默苔原', version: '1.0.0', author: 'Moyue', mode: 'light', description: '暖灰纸色与苔绿标记，适合白天长时间阅读', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#e9e6dc', surface: '#f2efe6', surfaceRaised: '#fbfaf5', text: '#2c332e', textMuted: '#737a72', accent: '#617765', accentSoft: '#dce3d9', border: 'rgba(54,66,57,.16)', codeBackground: '#e4e3dc' }, reader: { width: 760, fontSize: 18, lineHeight: 1.86, paragraphGap: 22, fontFamily: 'Iowan Old Style, Palatino Linotype, Georgia, serif' } }
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'paper-white', name: '纯净白纸', version: '1.0.0', author: 'Moyue', mode: 'light', description: '清晰的黑白对比，适合校对与结构化内容', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#edf0ef', surface: '#f8f9f8', surfaceRaised: '#ffffff', text: '#20272a', textMuted: '#687277', accent: '#2f716b', accentSoft: '#dbe8e5', border: 'rgba(32,43,47,.14)', codeBackground: '#edf1f0' }, reader: { width: 840, fontSize: 18, lineHeight: 1.78, paragraphGap: 18, fontFamily: 'Iowan Old Style, Palatino Linotype, Georgia, serif' } }
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'blue-hour', name: '蓝调时刻', version: '1.0.0', author: 'Moyue', mode: 'dark', description: '深青蓝界面，适合夜间技术文档与代码阅读', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#0c1a21', surface: '#14272f', surfaceRaised: '#1b333c', text: '#dfeaec', textMuted: '#8fa5aa', accent: '#72bcb6', accentSoft: '#21474b', border: 'rgba(171,207,207,.18)', codeBackground: '#08161b' }, reader: { width: 780, fontSize: 18, lineHeight: 1.8, paragraphGap: 20, fontFamily: 'Iowan Old Style, Palatino Linotype, Georgia, serif' } }
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'xuan-paper', name: '松烟水墨', version: '1.0.0', author: 'Moyue', mode: 'light', description: '冷宣纸、松烟墨与飞白笔触，以墨分五色承托长文阅读', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#d9dbd7', surface: '#e8e9e4', surfaceRaised: '#f3f3ee', text: '#20221f', textMuted: '#676b65', accent: '#343936', accentSoft: '#d5d8d2', border: 'rgba(30,34,30,.2)', codeBackground: '#e1e3de' }, reader: { width: 800, fontSize: 18, lineHeight: 1.94, paragraphGap: 24, fontFamily: 'Noto Serif SC, Source Han Serif SC, Songti SC, SimSun, serif' } }
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'inkstone', name: '浓墨砚台', version: '1.0.0', author: 'Moyue', mode: 'dark', description: '墨池般的深黑、低亮砚色与微弱飞白，适合夜间慢读', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#0c0e0d', surface: '#141715', surfaceRaised: '#1b1f1c', text: '#e4e6df', textMuted: '#979c95', accent: '#b9bdb5', accentSoft: '#303530', border: 'rgba(228,230,223,.16)', codeBackground: '#090b0a' }, reader: { width: 790, fontSize: 18, lineHeight: 1.92, paragraphGap: 23, fontFamily: 'Noto Serif SC, Source Han Serif SC, Songti SC, SimSun, serif' } }
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'bamboo-shadow', name: '烟雨竹影', version: '1.0.0', author: 'Moyue', mode: 'light', description: '冷白宣纸、淡墨竹影和湿润的灰青，适合白天阅读与笔记', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#d7dbd7', surface: '#e7ebe7', surfaceRaised: '#f2f4ef', text: '#222824', textMuted: '#626b64', accent: '#465b4d', accentSoft: '#d2dad3', border: 'rgba(34,45,38,.19)', codeBackground: '#dfe5df' }, reader: { width: 790, fontSize: 18, lineHeight: 1.92, paragraphGap: 23, fontFamily: 'FangSong, STFangsong, Noto Serif SC, SimSun, serif' } }
  },
  {
    builtIn: true,
    manifest: { schemaVersion: 1, id: 'cinnabar-scroll', name: '朱砂小笺', version: '1.0.0', author: 'Moyue', mode: 'light', description: '旧纸、墨线与一方克制的朱砂印，适合摘录和个人笔记', entry: { tokens: 'tokens.json', reader: 'reader.css', markdown: 'markdown.css', components: 'components.css' } },
    tokens: { color: { appBackground: '#dcdbd5', surface: '#ebeae4', surfaceRaised: '#f5f3ec', text: '#252522', textMuted: '#6a6861', accent: '#913b32', accentSoft: '#e5d4cf', border: 'rgba(42,39,35,.19)', codeBackground: '#e5e3dc' }, reader: { width: 800, fontSize: 18, lineHeight: 1.9, paragraphGap: 23, fontFamily: 'Noto Serif SC, Source Han Serif SC, Songti SC, SimSun, serif' } }
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
  validateTheme(theme.manifest, { tokens: JSON.stringify(theme.tokens), reader: theme.readerCss ?? '', markdown: theme.markdownCss ?? '', components: theme.componentsCss ?? '', code: theme.codeCss ?? '', mermaid: theme.mermaidCss ?? '' })
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(theme.manifest, null, 2)),
    'tokens.json': strToU8(JSON.stringify(theme.tokens, null, 2)),
    [theme.manifest.entry.reader]: strToU8(theme.readerCss ?? ''),
    [theme.manifest.entry.markdown]: strToU8(theme.markdownCss ?? ''),
    [theme.manifest.entry.components]: strToU8(theme.componentsCss ?? '')
  }
  if (theme.manifest.entry.code) files[theme.manifest.entry.code] = strToU8(theme.codeCss ?? '')
  if (theme.manifest.entry.mermaid) files[theme.manifest.entry.mermaid] = strToU8(theme.mermaidCss ?? '')
  return new Blob([zipSync(files) as unknown as BlobPart], { type: 'application/zip' })
}

export function themeCss(theme: MoyueTheme): string {
  return [theme.readerCss, theme.markdownCss, theme.componentsCss, theme.codeCss, theme.mermaidCss].filter(Boolean).join('\n')
}

export function cssVariables(theme: MoyueTheme): Record<string, string> {
  const { color } = theme.tokens
  return {
    '--app-bg': color.appBackground, '--surface': color.surface, '--surface-raised': color.surfaceRaised, '--ink': color.text, '--muted': color.textMuted, '--accent': color.accent, '--accent-soft': color.accentSoft, '--border': color.border, '--code-bg': color.codeBackground, '--reader-width': `${theme.tokens.reader.width}px`, '--reader-size': `${theme.tokens.reader.fontSize}px`, '--reader-leading': String(theme.tokens.reader.lineHeight), '--reader-gap': `${theme.tokens.reader.paragraphGap}px`, '--reader-font': theme.tokens.reader.fontFamily
  }
}
