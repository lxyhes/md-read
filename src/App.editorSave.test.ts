// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import App from './App.vue'
import * as drafts from './editorDrafts'
import * as parser from './parser'
import { useReaderStore } from './stores/reader'

vi.mock('./startup', () => ({ startupStylesReady: Promise.resolve() }))
let editorModuleReady: Promise<void> | undefined
vi.mock('./components/MarkdownEditor.vue', async () => {
  await editorModuleReady
  return {
    __esModule: true,
    default: {
      props: ['modelValue'],
      methods: {
        focus() {},
        setSelectionRange(this: { $el: HTMLTextAreaElement }, start: number, end: number) {
          this.$el.setSelectionRange(start, end)
        },
      },
      template: '<textarea data-test="editor" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
  }
})

let unmount = () => {}
afterEach(async () => {
  unmount()
  await drafts.removeEditorDraft('switch-origin.md')
  document.body.innerHTML = ''
  localStorage.clear()
})

it('replays an outline click once the editor has loaded', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  const source = '# First\n\nText\n\n## Target'
  await store.addOpenedFiles([{ path: 'outline-loading.md', source }], { persist: false })
  let finishLoading!: () => void
  editorModuleReady = new Promise<void>(resolve => { finishLoading = resolve })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  unmount = () => app.unmount()
  const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
  try {
    await vi.waitFor(() => expect(button('编辑')).toBeDefined())
    button('编辑')!.click()
    const target = await vi.waitFor(() => {
      const entry = [...host.querySelectorAll<HTMLButtonElement>('#editor-draft-outline button')].find(item => item.textContent === 'Target')
      expect(entry).toBeDefined()
      return entry!
    })
    expect(host.querySelector('[data-test="editor"]')).toBeNull()
    target.click()
    finishLoading()
    await vi.waitFor(() => {
      expect(host.querySelector<HTMLTextAreaElement>('[data-test="editor"]')?.selectionStart).toBe(source.indexOf('## Target'))
    })
  } finally {
    finishLoading()
    editorModuleReady = undefined
  }
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
  await drafts.readEditorDraft('test.md')
  await nextTick()
  expect(button('返回阅读')).toBeDefined()

  finishSave()
  await vi.waitFor(() => {
    expect(button('返回阅读')).toBeUndefined()
    expect(mode === 'HTML' ? html() : host.querySelector('.reader-markdown')?.textContent).toContain('After saving')
  })
})

async function openDraftForSwitch() {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([
    { path: 'switch-target.md', source: '# Target' },
    { path: 'switch-origin.md', source: '# Original' },
  ], { persist: false })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  unmount = () => app.unmount()
  const tab = (path: string) => host.querySelector<HTMLElement>(`[role="tab"][title$="${path}"]`)!
  const editor = () => host.querySelector<HTMLTextAreaElement>('[data-test="editor"]')!
  const type = (source: string) => {
    editor().value = source
    editor().dispatchEvent(new Event('input'))
  }
  const edit = await vi.waitFor(() => {
    const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === '编辑')
    expect(button).toBeDefined()
    return button!
  })
  edit.click()
  await vi.waitFor(() => expect(editor()?.value).toBe('# Original'))
  return { store, host, tab, editor, type }
}

it('backs up edits typed while a tab switch is waiting for draft storage', async () => {
  const { store, tab, editor, type } = await openDraftForSwitch()
  const save = drafts.saveEditorDraft
  let finishBackup!: () => void
  const pending = new Promise<void>(resolve => { finishBackup = resolve })
  const saveDraft = vi.spyOn(drafts, 'saveEditorDraft')
  saveDraft.mockImplementationOnce(async draft => {
    await pending
    await save(draft)
  })
  try {
    type('# First edit')
    tab('switch-target.md').click()
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ source: '# First edit' }))
    type('# Latest edit')
    finishBackup()

    await vi.waitFor(() => {
      expect(store.currentDocument?.path).toBe('switch-target.md')
      expect(editor()?.value).toBe('# Target')
    })
    tab('switch-origin.md').click()
    await vi.waitFor(() => expect(editor()?.value).toBe('# Latest edit'))
    expect((await drafts.readEditorDraft('switch-origin.md'))?.source).toBe('# Latest edit')
  } finally {
    finishBackup()
    saveDraft.mockRestore()
  }
})

it.each([false, true])('keeps the active document aligned when dropping Markdown (backup failure: %s)', async backupFails => {
  const { store, host, tab, editor, type } = await openDraftForSwitch()
  const saveDraft = vi.spyOn(drafts, 'saveEditorDraft')
  if (backupFails) saveDraft.mockImplementation(() => Promise.reject(new Error('Storage unavailable')))
  try {
    type('# Draft to keep')
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [{ name: 'dropped.md', text: async () => '# Dropped file' }] },
    })
    host.querySelector('.app-shell')!.dispatchEvent(drop)

    if (backupFails) {
      await vi.waitFor(() => {
        expect(host.querySelector('.editor-operation-alert')?.textContent).toContain('草稿备份失败')
        expect(tab('dropped.md')?.getAttribute('aria-selected')).toBe('false')
      })
      expect(tab('switch-origin.md').getAttribute('aria-selected')).toBe('true')
      expect(editor().value).toBe('# Draft to keep')
      return
    }

    await vi.waitFor(() => {
      expect(tab('dropped.md').getAttribute('aria-selected')).toBe('true')
      expect(editor()?.value).toBe('# Dropped file')
    })
    type('# Saved dropped file')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await vi.waitFor(() => expect(store.currentDocument?.source).toBe('# Saved dropped file'))
    tab('switch-origin.md').click()
    await vi.waitFor(() => expect(editor()?.value).toBe('# Draft to keep'))
    expect(store.currentDocument?.source).toBe('# Original')
  } finally {
    saveDraft.mockRestore()
  }
})

it('updates typed text immediately and parses the outline once after a typing burst', async () => {
  const { host, editor, type } = await openDraftForSwitch()
  const parse = vi.spyOn(parser, 'parseMarkdown')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const outline = () => host.querySelector('[aria-label="编辑中的文档大纲"]')
  try {
    for (const heading of ['新', '新标', '新标题']) {
      type(`# ${heading}`)
      await nextTick()
      vi.advanceTimersByTime(40)
      expect(editor().value).toBe(`# ${heading}`)
    }
    expect(outline()?.textContent).toBe('Original')
    expect(parse).not.toHaveBeenCalled()

    vi.advanceTimersByTime(160)
    await nextTick()
    expect(outline()?.textContent).toBe('新标题')
    expect(parse).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
    parse.mockRestore()
  }
})

it('jumps to the current position when typing has moved an outline heading', async () => {
  const { host, editor, type } = await openDraftForSwitch()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const updated = 'An inserted paragraph\n\n# Original'
    type(updated)
    await nextTick()
    host.querySelector<HTMLButtonElement>('[aria-label="编辑中的文档大纲"] button')!.click()
    expect(editor().selectionStart).toBe(updated.indexOf('#'))
  } finally {
    vi.useRealTimers()
  }
})

it('keeps a failed save visible and retries without losing the draft', async () => {
  const pinia = createPinia()
  const store = useReaderStore(pinia)
  vi.spyOn(store, 'bootstrap').mockResolvedValue()
  await store.addOpenedFiles([{ path: 'retry-save.md', source: '# Original' }], { persist: false })
  const replace = vi.spyOn(store, 'replaceDocumentSource').mockRejectedValueOnce(new Error('存储暂不可写'))

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  unmount = () => app.unmount()

  const edit = await vi.waitFor(() => {
    const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === '编辑')
    expect(button).toBeDefined()
    return button!
  })
  edit.click()
  const editor = await vi.waitFor(() => {
    const input = host.querySelector<HTMLTextAreaElement>('[data-test="editor"]')
    expect(input).not.toBeNull()
    return input!
  })
  editor.value = '# Draft to keep'
  editor.dispatchEvent(new Event('input'))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))

  const retry = await vi.waitFor(() => {
    const alert = host.querySelector('.reader-operation-alert')
    expect(alert?.textContent).toContain('存储暂不可写')
    return [...alert!.querySelectorAll('button')].find(button => button.textContent?.trim() === '重试保存')!
  })
  expect(editor.value).toBe('# Draft to keep')
  retry.click()
  await vi.waitFor(() => {
    expect(replace).toHaveBeenCalledTimes(2)
    expect(store.currentDocument?.source).toBe('# Draft to keep')
    expect(host.querySelector('.reader-operation-alert')).toBeNull()
  })
})
