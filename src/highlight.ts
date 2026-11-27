import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import githubDark from 'shiki/dist/themes/github-dark.mjs'
import githubLight from 'shiki/dist/themes/github-light.mjs'
import { codeLanguageLoader, normalizeCodeLanguage } from './codeLanguages'
import type { ThemeManifest } from './types'

export { normalizeCodeLanguage } from './codeLanguages'

const themes = { light: 'github-light', dark: 'github-dark' } as const
const highlighterPromise = createHighlighterCore({
  engine: createJavaScriptRegexEngine({ forgiving: true }),
  themes: [githubDark, githubLight],
})
const languagePromises = new Map<string, Promise<void>>()
const htmlCache = new Map<string, Promise<string>>()
const tokenCache = new Map<string, ReturnType<typeof tokenize>>()

function remember<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value)
  if (cache.size > 128) cache.delete(cache.keys().next().value!)
  return value
}

async function highlighterFor(language: string) {
  const loader = codeLanguageLoader(language)
  if (!loader) return
  const highlighter = await highlighterPromise
  let pending = languagePromises.get(language)
  if (!pending) {
    pending = loader().then(({ default: grammar }) => highlighter.loadLanguage(grammar))
    languagePromises.set(language, pending)
  }
  await pending
  return highlighter
}

async function tokenize(code: string, lang: string) {
  try {
    const highlighter = await highlighterFor(lang)
    return highlighter?.codeToTokensWithThemes(code, { lang, themes }) ?? []
  } catch {
    return []
  }
}

export function codeTokens(code: string, language: string) {
  const lang = normalizeCodeLanguage(language)
  const key = `${lang}:${code}`
  return tokenCache.get(key) ?? remember(tokenCache, key, tokenize(code, lang))
}

function escapeCode(code: string) {
  return `<pre><code>${code.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char)}</code></pre>`
}

export function highlightCode(code: string, language = 'text', mode: ThemeManifest['mode'] = 'dark'): Promise<string> {
  const lang = normalizeCodeLanguage(language)
  const theme = themes[mode === 'light' ? 'light' : 'dark']
  const key = `${theme}:${lang}:${code}`
  const cached = htmlCache.get(key)
  if (cached) return cached
  return remember(htmlCache, key, (async () => {
    try {
      const highlighter = await highlighterFor(lang)
      return highlighter?.codeToHtml(code, { lang, theme }) ?? escapeCode(code)
    } catch {
      return escapeCode(code)
    }
  })())
}
