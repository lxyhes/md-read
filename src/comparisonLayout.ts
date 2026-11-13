export type ComparisonLayout = {
  left: { title: string; rows: string[] }
  right: { title: string; rows: string[] }
}

export function parseComparisonLayout(value: string): ComparisonLayout | null {
  const lines = value.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length < 2 || lines.length > 4 || value.length > 240) return null

  const titles = lines[0].split(/\s*[+＋]\s*/)
  if (titles.length !== 2 || !titles[0] || !titles[1]) return null

  const rows = lines.slice(1).map(line => line.match(/^(.+?)\s+(.+)$/)?.slice(1) ?? [])
  if (rows.some(row => row.length !== 2 || !row[0] || !row[1])) return null

  return {
    left: { title: titles[0], rows: rows.map(row => row[0]) },
    right: { title: titles[1], rows: rows.map(row => row[1]) },
  }
}
