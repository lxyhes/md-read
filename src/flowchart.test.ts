import { describe, expect, it } from 'vitest'
import { renderSimpleFlowchart } from './flowchart'

describe('renderSimpleFlowchart', () => {
  it('renders the common flowchart subset without Mermaid', () => {
    const svg = renderSimpleFlowchart('flowchart LR\nA[打开文档] -->|下一步| B[阅读内容]')

    expect(svg).toContain('<svg')
    expect(svg).toContain('打开文档')
    expect(svg).toContain('下一步')
  })

  it('falls back for advanced Mermaid syntax', () => {
    expect(renderSimpleFlowchart('sequenceDiagram\nAlice->>Bob: Hello')).toBeNull()
  })
})
