import { codeToHtml, type BundledLanguage } from 'shiki'
import type { ThemeManifest } from './types'

const languageAliases: Record<string, string> = { js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', sh: 'bash', yml: 'yaml', md: 'markdown', text: 'text' }

export async function highlightCode(code: string, language = 'text', mode: ThemeManifest['mode'] = 'dark'): Promise<string> {
  const lang = languageAliases[language.toLowerCase()] ?? (language || 'text')
  try { return await codeToHtml(code, { lang: lang as BundledLanguage, theme: mode === 'light' ? 'github-light' : 'github-dark' }) } catch { return `<pre><code>${code.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char)}</code></pre>` }
}
