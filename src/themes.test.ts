import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { builtInThemes, exportTheme, themeCss } from './themes'
import type { MoyueTheme } from './types'

function customTheme(): MoyueTheme {
  return {
    ...builtInThemes[0],
    manifest: {
      ...builtInThemes[0].manifest,
      id: 'custom-test',
      entry: { ...builtInThemes[0].manifest.entry, code: 'code.css', mermaid: 'mermaid.css' },
    },
    readerCss: '.reader { color: red; }',
    markdownCss: '.markdown { color: blue; }',
    componentsCss: '.button { color: green; }',
    codeCss: '.code { color: orange; }',
    mermaidCss: '.mermaid { color: purple; }',
  }
}

describe('theme assets', () => {
  it('collects every theme stylesheet in entry order', () => {
    expect(themeCss(customTheme())).toBe([
      '.reader { color: red; }',
      '.markdown { color: blue; }',
      '.button { color: green; }',
      '.code { color: orange; }',
      '.mermaid { color: purple; }',
    ].join('\n'))
  })

  it('exports optional code and Mermaid stylesheets', async () => {
    const files = unzipSync(new Uint8Array(await exportTheme(customTheme()).arrayBuffer()))
    expect(strFromU8(files['code.css'])).toContain('.code')
    expect(strFromU8(files['mermaid.css'])).toContain('.mermaid')
  })
})
