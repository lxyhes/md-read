// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import { readEditorDraft } from './editorDrafts'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))
vi.mock('./components/MarkdownEditor.vue', () => ({
  __esModule: true,
  default: {
    props: ['modelValue'],
    methods: { focus() {} },
    template: '<textarea data-test="editor" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}))

let unmount = () => {}
afterEach(() => {
  unmount()
  document.body.innerHTML = ''
  localStorage.clear()
})

it.each(['Markdown', 'HTML'])('shows the saved content when returning to %s during a save', async mode => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: 'test.md', source: '# Before saving' }], { persist: false })

  const replaceSource = store.replaceDocumentSource
  let finishSave!: () => void
  const pending = new Promise<void>(resolve => { finishSave = resolve })
  const replace = vi.spyOn(store, 'replaceDocumentSource').mockImplementationOnce(async (id, source) => {
    await pending
    return replaceSource(id, source)
  })

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  unmount = () => app.unmount()
  const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
  const html = () => host.querySelector('iframe[title="HTML 网页预览"]')?.getAttribute('srcdoc')

  await vi.waitFor(() => expect(button('编辑')).toBeDefined())
  if (mode === 'HTML') {
    button('HTML')!.click()
    await vi.waitFor(() => expect(html()).toContain('Before saving'))
  }
  button('编辑')!.click()
  const editor = await vi.waitFor(() => {
    const input = host.querySelector<HTMLTextAreaElement>('[data-test="editor"]')
    expect(input).not.toBeNull()
    return input!
  })
  editor.value = '# After saving'
  editor.dispatchEvent(new Event('input'))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
  expect(replace).toHaveBeenCalledWith(store.currentDocumentId, '# After saving')

  button('返回阅读')!.click()
  await readEditorDraft('test.md')
  await nextTick()
  expect(button('返回阅读')).toBeDefined()

  finishSave()
  await vi.waitFor(() => {
    expect(button('返回阅读')).toBeUndefined()
    expect(mode === 'HTML' ? html() : host.querySelector('.reader-markdown')?.textContent).toContain('After saving')
  })
})
