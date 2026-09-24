import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import githubDark from 'shiki/dist/themes/github-dark.mjs'
import githubLight from 'shiki/dist/themes/github-light.mjs'
import type { ThemeManifest } from './types'

const languageAliases: Record<string, string> = {
  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', sh: 'bash', shell: 'bash', cpp: 'c', 'c++': 'c',
  yml: 'yaml', md: 'markdown', text: 'text', plaintext: 'text', bat: 'bat', batch: 'bat', pgsql: 'sql', postgres: 'sql', postgresql: 'sql', hive: 'sql',
}
const languageLoaders: Record<string, () => Promise<unknown>> = {
  javascript: () => import('shiki/dist/langs/javascript.mjs').then((module) => module.default),
  jsx: () => import('shiki/dist/langs/jsx.mjs').then((module) => module.default),
  typescript: () => import('shiki/dist/langs/typescript.mjs').then((module) => module.default),
  tsx: () => import('shiki/dist/langs/tsx.mjs').then((module) => module.default),
  python: () => import('shiki/dist/langs/python.mjs').then((module) => module.default),
  bash: () => import('shiki/dist/langs/bash.mjs').then((module) => module.default),
  yaml: () => import('shiki/dist/langs/yaml.mjs').then((module) => module.default),
  markdown: () => import('shiki/dist/langs/markdown.mjs').then((module) => module.default),
  json: () => import('shiki/dist/langs/json.mjs').then((module) => module.default),
  html: () => import('shiki/dist/langs/html.mjs').then((module) => module.default),
  css: () => import('shiki/dist/langs/css.mjs').then((module) => module.default),
  sql: () => import('shiki/dist/langs/sql.mjs').then((module) => module.default),
  java: () => import('shiki/dist/langs/java.mjs').then((module) => module.default),
  c: () => import('shiki/dist/langs/c.mjs').then((module) => module.default),
  csharp: () => import('shiki/dist/langs/csharp.mjs').then((module) => module.default),
  go: () => import('shiki/dist/langs/go.mjs').then((module) => module.default),
  rust: () => import('shiki/dist/langs/rust.mjs').then((module) => module.default),
  bat: () => import('shiki/dist/langs/bat.mjs').then((module) => module.default),
  docker: () => import('shiki/dist/langs/docker.mjs').then((module) => module.default),
  gherkin: () => import('shiki/dist/langs/gherkin.mjs').then((module) => module.default),
  pascal: () => import('shiki/dist/langs/pascal.mjs').then((module) => module.default),
  stata: () => import('shiki/dist/langs/stata.mjs').then((module) => module.default),
  svelte: () => import('shiki/dist/langs/svelte.mjs').then((module) => module.default),
}
const cache = new Map<string, Promise<string>>()
const languagePromises = new Map<string, Promise<void>>()
const CACHE_LIMIT = 128
const highlighterPromise = createHighlighterCore({ engine: createJavaScriptRegexEngine(), themes: [githubDark, githubLight] })

function escapeCode(code: string) {
  return `<pre><code>${code.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char)}</code></pre>`
}

async function loadLanguage(language: string) {
  const loader = languageLoaders[language]
  if (!loader) return false
  const highlighter = await highlighterPromise
  let pending = languagePromises.get(language)
  if (!pending) {
    pending = loader().then((registration) => highlighter.loadLanguage(registration as Parameters<typeof highlighter.loadLanguage>[0]))
    languagePromises.set(language, pending)
  }
  await pending
  return true
}

export async function highlightCode(code: string, language = 'text', mode: ThemeManifest['mode'] = 'dark'): Promise<string> {
  const normalizedLanguage = languageAliases[language.toLowerCase()] ?? (language.toLowerCase() || 'text')
  const key = `${mode === 'light' ? 'light' : 'dark'}:${normalizedLanguage}:${code}`
  const cached = cache.get(key)
  if (cached) return cached
  const pending = (async () => {
    try {
      const highlighter = await highlighterPromise
      const supported = await loadLanguage(normalizedLanguage)
      return supported ? highlighter.codeToHtml(code, { lang: normalizedLanguage, theme: mode === 'light' ? 'github-light' : 'github-dark' }) : escapeCode(code)
    } catch {
      return escapeCode(code)
    }
  })()
  cache.set(key, pending)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return pending
}
