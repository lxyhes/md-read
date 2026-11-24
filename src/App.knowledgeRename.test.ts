// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { openMarkdownFile } from './fileService'
import { loadKnowledgeConversations } from './persistence'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))
vi.mock('./fileService', async importOriginal => ({
  ...await importOriginal<typeof import('./fileService')>(),
  openMarkdownFile: vi.fn(),
  saveExportFile: vi.fn().mockResolvedValue('saved.md'),
}))

it('preserves the migrated source and cites its new location when a pending answer is saved', async () => {
  const source = '重试次数为三次。'
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: 'draft.md', source }], { persist: false })
  const original = store.documents[0]
  localStorage.setItem('moyue:knowledge-documents', JSON.stringify([original.id]))
  localStorage.setItem('moyue:ai-settings', JSON.stringify({ enabled: true }))
  let resolveResponse!: (response: Response) => void
  const response = new Promise<Response>(resolve => { resolveResponse = resolve })
  const fetch = vi.fn(() => response)
  vi.stubGlobal('fetch', fetch)

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  try {
    await vi.waitFor(() => expect(host.querySelector('.save-pasted-button')).not.toBeNull())
    host.querySelector<HTMLButtonElement>('.workspace-rail button[title="AI 知识库"]')!.click()
    await nextTick()
    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="询问知识库"]')!
    input.value = '重试次数是多少？'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())

    host.querySelector<HTMLButtonElement>('button[aria-label="当前阅读"]')!.click()
    await nextTick()
    host.querySelector<HTMLButtonElement>('.save-pasted-button')!.click()
    await vi.waitFor(async () => {
      const [conversation] = await loadKnowledgeConversations()
      expect(store.documents[0].path).toBe('saved.md')
      expect(conversation.sourceIds).toEqual([store.documents[0].id])
    })

    const content = JSON.stringify({ claims: [{ text: source, citations: [1] }], insufficient: false })
    resolveResponse(Response.json({ message: { content } }))
    await vi.waitFor(async () => {
      const [conversation] = await loadKnowledgeConversations()
      const renamed = store.documents[0]
      expect(conversation.sourceIds).toEqual([renamed.id])
      expect(conversation.messages).toHaveLength(2)
      expect(conversation.messages[1].citations[0]).toMatchObject({
        documentId: renamed.id,
        documentPath: renamed.path,
        regionId: renamed.regions[0].id,
        excerpt: source,
      })
    })
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
    vi.unstubAllGlobals()
  }
})

it('filters sources, preserves the draft and opens cited evidence in local mode', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([
    { path: 'ops/guide.md', source: '重试次数为三次。' },
    { path: 'archive/guide.md', source: '重试次数为十次。' },
  ], { persist: false })
  localStorage.setItem('moyue:ai-settings', JSON.stringify({ enabled: true, provider: 'openai-compatible' }))
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  try {
    await vi.waitFor(() => expect(host.querySelector('.reader-page')).not.toBeNull())
    host.querySelector<HTMLButtonElement>('.workspace-rail button[title="AI 知识库"]')!.click()
    const sourcesTrigger = () => host.querySelector<HTMLButtonElement>('.knowledge-source-trigger')!
    await vi.waitFor(() => expect(sourcesTrigger()?.disabled).toBe(false))

    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="询问知识库"]')!
    input.value = '重试次数是多少？'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const addTrigger = () => host.querySelector<HTMLButtonElement>('button[aria-label="添加内容"]')!
    addTrigger().click()
    await vi.waitFor(() => expect(host.querySelector('.knowledge-add-actions')).not.toBeNull())
    host.querySelector<HTMLButtonElement>('.knowledge-add-actions button:nth-child(2)')!.click()
    const filter = () => host.querySelector<HTMLInputElement>('input[aria-label="筛选资料"]')!
    await vi.waitFor(() => expect(filter()).not.toBeNull())
    filter().value = 'ops guide'
    filter().dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    const checkboxes = host.querySelectorAll<HTMLInputElement>('.knowledge-scope-list input[type="checkbox"]')
    expect(checkboxes).toHaveLength(1)
    checkboxes[0].click()
    await vi.waitFor(() => expect(sourcesTrigger().textContent).toContain('1 篇'))
    expect(input.value).toBe('重试次数是多少？')
    sourcesTrigger().click()

    host.querySelector<HTMLButtonElement>('.knowledge-model-trigger')!.click()
    const reasoning = () => host.querySelector<HTMLInputElement>('#knowledge-reasoning-range')!
    await vi.waitFor(() => expect(reasoning()).not.toBeNull())
    reasoning().value = '2'
    reasoning().dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(reasoning().getAttribute('aria-valuetext')).toBe('中'))
    const high = Array.from(host.querySelectorAll<HTMLButtonElement>('.knowledge-reasoning-ticks button')).find(button => button.textContent === '高')!
    high.click()
    await vi.waitFor(() => expect(reasoning().getAttribute('aria-valuetext')).toBe('高'))
    host.querySelector<HTMLButtonElement>('button[aria-label="恢复自动推理"]')!.click()
    await vi.waitFor(() => expect(reasoning().value).toBe('0'))
    expect(document.activeElement).toBe(reasoning())
    const localMode = () => host.querySelector<HTMLInputElement>('input[name="knowledge-answer-mode"][value="local"]')!
    await vi.waitFor(() => expect(localMode()).not.toBeNull())
    localMode().click()
    await vi.waitFor(() => expect(localStorage.getItem('moyue:knowledge-answer-mode')).toBe('local'))
    input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    const citation = () => host.querySelector<HTMLButtonElement>('.knowledge-inline-citation')!
    await vi.waitFor(() => expect(citation()).not.toBeNull())
    expect(fetch).not.toHaveBeenCalled()
    expect(host.querySelector('.knowledge-message.is-assistant')?.textContent).toContain('重试次数为三次。')
    expect(host.querySelector('.knowledge-message.is-assistant')?.textContent).not.toContain('重试次数为十次。')
    citation().click()
    expect(host.querySelector<HTMLDetailsElement>('.knowledge-citations')?.open).toBe(true)
    expect(host.querySelector<HTMLDetailsElement>('.knowledge-citation')?.open).toBe(true)

    input.value = '待发送的追问'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    vi.mocked(openMarkdownFile).mockResolvedValueOnce([{ path: 'attachment.md', source: '新资料。' }])
    addTrigger().click()
    await vi.waitFor(() => expect(host.querySelector('.knowledge-add-actions')).not.toBeNull())
    host.querySelector<HTMLButtonElement>('.knowledge-add-actions button')!.click()
    await vi.waitFor(async () => {
      const [conversation] = await loadKnowledgeConversations()
      const attachment = store.documents.find(document => document.path === 'attachment.md')
      expect(attachment).toBeDefined()
      expect(conversation.sourceIds).toContain(attachment!.id)
      expect(sourcesTrigger().textContent).toContain('2 篇')
    })
    expect(host.querySelector('.knowledge-ask')).not.toBeNull()
    expect(input.value).toBe('待发送的追问')
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
    vi.unstubAllGlobals()
  }
})

it('runs a plugin from the add menu for one question without changing tool defaults', async () => {
  const excerpt = '备份保留七天。'
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: 'ops.md', source: excerpt }], { persist: false })
  localStorage.setItem('moyue:knowledge-documents', JSON.stringify([store.documents[0].id]))
  localStorage.setItem('moyue:ai-settings', JSON.stringify({ enabled: true, provider: 'openai-compatible' }))
  const answer = JSON.stringify({ claims: [{ text: excerpt, citations: [1] }], insufficient: false })
  const plan = JSON.stringify({ tool_calls: [{ id: 'read', name: 'read_file', arguments: { path: 'ops.md' } }] })
  const fetch = vi.fn(async (_url: string, _options: RequestInit) => Response.json({ choices: [{ message: { content: answer } }] }))
  fetch.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: plan } }] }))
  vi.stubGlobal('fetch', fetch)

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  try {
    await vi.waitFor(() => expect(host.querySelector('.reader-page')).not.toBeNull())
    host.querySelector<HTMLButtonElement>('.workspace-rail button[title="AI 知识库"]')!.click()
    const add = () => host.querySelector<HTMLButtonElement>('button[aria-label="添加内容"]')!
    await vi.waitFor(() => expect(add()?.disabled).toBe(false))
    add().click()
    const plugin = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.knowledge-add-section button')).find(button => button.textContent?.includes('读取资料原文'))!
    await vi.waitFor(() => expect(plugin()).toBeDefined())
    plugin().click()
    await vi.waitFor(() => expect(host.querySelector('button[aria-label="移除读取资料原文"]')).not.toBeNull())
    expect(plugin().getAttribute('aria-pressed')).toBe('true')
    add().click()

    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="询问知识库"]')!
    const submit = (question: string) => {
      input.value = question
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return nextTick(() => input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    }
    await submit('备份保留几天？')
    await vi.waitFor(() => expect(host.querySelector('.knowledge-tools-used')?.textContent).toContain('读取资料原文'))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][1].body).toContain(`工具「读取资料原文」结果：`)
    expect(host.querySelector('.knowledge-turn-tools')).toBeNull()
    expect(localStorage.getItem('moyue:tool-settings')).toBeNull()
    const [conversation] = await loadKnowledgeConversations()
    expect(conversation.messages.at(-1)?.toolsUsed).toEqual(['读取资料原文'])

    await vi.waitFor(() => expect(add().disabled).toBe(false))
    await submit('备份保留几天？')
    await vi.waitFor(() => expect(host.querySelectorAll('article.knowledge-message.is-assistant')).toHaveLength(2))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(host.querySelectorAll('.knowledge-tools-used')).toHaveLength(1)
  } finally {
    app.unmount()
    host.remove()
    localStorage.clear()
    vi.unstubAllGlobals()
  }
})
