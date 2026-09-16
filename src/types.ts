export type ReaderRegionType =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'list'
  | 'code'
  | 'mermaid'
  | 'image'
  | 'table'
  | 'thematic-break'

export interface HeadingItem {
  id: string
  text: string
  depth: number
  regionId: string
}

export interface ReaderRegion {
  id: string
  documentId: string
  type: ReaderRegionType
  index: number
  textContent: string
  sourceStart: number
  sourceEnd: number
  html: string
  metadata?: Record<string, unknown>
}

export interface ReaderDocument {
  id: string
  path: string
  title: string
  headings: HeadingItem[]
  regions: ReaderRegion[]
  wordCount: number
  estimatedReadMinutes: number
  sourceHash: string
  source: string
  updatedAt: number
}

export interface DocumentRecord {
  id: string
  path: string
  title: string
  sourceHash: string
  updatedAt: number
  source?: string
}

export interface ReadingProgress {
  documentId: string
  regionId: string | null
  headingId: string | null
  scrollPercent: number
  readingTime: number
  updatedAt: number
}

export interface Annotation {
  id: string
  documentId: string
  regionId: string
  selectedText: string
  color: string
  note: string
  createdAt: number
}

export interface ReaderSelection {
  text: string
  regionId: string
  rect: { top: number; left: number; width: number; height: number }
}

export type ReaderMode = 'normal' | 'clean' | 'focus' | 'region-focus'
export type FocusAmbienceId = 'moonlit' | 'forest' | 'fire'
export type ViewerType = 'code' | 'mermaid' | 'image' | 'table'

export interface ViewerState {
  type: ViewerType | null
  regionId: string | null
  fullscreen: boolean
  zoom: number
}

export interface ThemeManifest {
  schemaVersion: number
  id: string
  name: string
  version: string
  author: string
  description?: string
  mode: 'light' | 'dark' | 'system'
  entry: {
    tokens: string
    reader: string
    markdown: string
    components: string
    code?: string
    mermaid?: string
  }
}

export interface ThemeTokens {
  color: {
    appBackground: string
    surface: string
    surfaceRaised: string
    text: string
    textMuted: string
    accent: string
    accentSoft: string
    border: string
    codeBackground: string
  }
  reader: {
    width: number
    fontSize: number
    lineHeight: number
    paragraphGap: number
    fontFamily: string
  }
}

export interface MoyueTheme {
  manifest: ThemeManifest
  tokens: ThemeTokens
  readerCss?: string
  markdownCss?: string
  componentsCss?: string
  codeCss?: string
  mermaidCss?: string
  preview?: string
  builtIn?: boolean
}

export interface TranslationResult {
  text: string
  detectedLanguage?: string
  provider: string
}

export interface ExplanationResult {
  text: string
  provider: string
}
