import type { ReaderDocument, ReaderRegion } from './types'

type StatisticsDocument = Pick<ReaderDocument, 'source'> & {
  headings: readonly unknown[]
  regions: ReadonlyArray<Pick<ReaderRegion, 'type' | 'textContent'>>
}

const readableRegionTypes = new Set<ReaderRegion['type']>(['heading', 'paragraph', 'blockquote', 'list'])
const proseBlockTypes = new Set<ReaderRegion['type']>(['paragraph', 'blockquote', 'list'])

export function getDocumentStatistics(document: StatisticsDocument | null) {
  const readableRegions = document?.regions.filter((region) => readableRegionTypes.has(region.type)) ?? []
  const text = readableRegions.map((region) => region.textContent).join('\n')
  return {
    characters: Array.from(text).filter((character) => !/\s/.test(character)).length,
    words: (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[\u2E80-\u9FFF\uF900-\uFAFF]/g) ?? []).length,
    lines: document?.source ? document.source.split(/\r?\n/).length : 0,
    blocks: readableRegions.filter((region) => proseBlockTypes.has(region.type)).length,
    headings: document?.headings.length ?? 0,
  }
}
