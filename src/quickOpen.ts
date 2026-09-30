export type QuickOpenEntry = {
  name: string
  path: string
}

function normalizedQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, '')
}

function fuzzyScore(query: string, value: string) {
  let score = 0
  let cursor = 0
  let previousIndex = -2
  const normalizedValue = value.toLowerCase().replace(/\\/g, '/')

  for (const character of query) {
    const index = normalizedValue.indexOf(character, cursor)
    if (index === -1) return Number.NEGATIVE_INFINITY
    if (index === 0 || /[/.\-_\s]/.test(normalizedValue[index - 1])) score += 12
    if (index === previousIndex + 1) score += 10
    score -= Math.min(5, index - cursor)
    cursor = index + 1
    previousIndex = index
  }

  return score - (normalizedValue.length - query.length) * .02
}

export function matchQuickOpen<T extends QuickOpenEntry>(query: string, entries: readonly T[], limit = 24): T[] {
  const needle = normalizedQuery(query)
  const matches = entries.map((entry) => {
    if (!needle) return { entry, score: 0 }
    const filenameScore = fuzzyScore(needle, entry.name)
    const pathScore = fuzzyScore(needle, entry.path)
    return { entry, score: Math.max(pathScore, filenameScore + 30) }
  }).filter(({ score }) => Number.isFinite(score))

  return matches.sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name, 'zh-CN') || left.entry.path.localeCompare(right.entry.path, 'zh-CN')).slice(0, limit).map(({ entry }) => entry)
}
