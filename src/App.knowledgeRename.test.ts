// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { loadKnowledgeConversations } from './persistence'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))
vi.mock('./fileService', async importOriginal => ({
  ...await importOriginal<typeof import('./fileService')>(),
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
    host.querySelector<HTMLButtonElement>('button[aria-label="更多工具"]')!.click()
    const tool = await vi.waitFor(() => {
      const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('AI 知识库'))
      expect(item).toBeDefined()
      return item!
    })
    tool.click()
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
