import { bundledLanguagesBase, bundledLanguagesInfo } from 'shiki/langs'

const extraAliases = {
  'gnu-as': 'asm', assembly: 'asm', gas: 'asm', hive: 'sql', jinja2: 'jinja',
  pgsql: 'sql', postgres: 'sql', postgresql: 'sql', url: 'hurl', plain: 'text', plaintext: 'text', txt: 'text',
}

const languages = new Map(bundledLanguagesInfo.map(({ id, name }) => [id, name]))
languages.set('text', '纯文本')
const aliases = new Map<string, string>()
for (const { id, aliases: names } of bundledLanguagesInfo) {
  for (const name of names ?? []) aliases.set(name, id)
}
for (const [name, id] of Object.entries(extraAliases)) {
  if (!languages.has(name)) aliases.set(name, id)
}

export function normalizeCodeLanguage(language = 'text') {
  const id = language.trim().toLowerCase()
  return aliases.get(id) ?? (id || 'text')
}

export function codeLanguageLoader(language: string) {
  return Object.hasOwn(bundledLanguagesBase, language) ? bundledLanguagesBase[language] : undefined
}

const options = [...new Set([...languages.keys(), ...aliases.keys()])].sort().map(id => ({
  id,
  name: languages.get(normalizeCodeLanguage(id)) ?? id,
}))
const common = ['text', 'javascript', 'typescript', 'python', 'yaml', 'json', 'bash', 'html', 'css', 'sql', 'mermaid']

export function searchCodeLanguages(query: string) {
  const value = query.trim().toLowerCase()
  if (!value) return common.map(id => ({ id, name: languages.get(id) ?? id }))
  const prefix = options.filter(({ id }) => id.startsWith(value))
  return [...prefix, ...options.filter(({ id, name }) => !id.startsWith(value)
    && (id.includes(value) || name.toLowerCase().includes(value)))]
}
