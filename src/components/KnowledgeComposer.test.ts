// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import KnowledgeComposer from './KnowledgeComposer.vue'

let unmount = () => {}
afterEach(() => { unmount(); document.body.innerHTML = '' })

function mount(overrides = {}) {
  const submit = vi.fn()
  const update = vi.fn()
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(KnowledgeComposer, {
    modelValue: '问题', disabled: false, busy: false, hasSources: true,
    onSubmit: submit, 'onUpdate:modelValue': update, ...overrides,
  }) })
  app.mount(host)
  unmount = () => app.unmount()
  return { host, submit, update, textarea: host.querySelector('textarea')!, form: host.querySelector('form')! }
}

describe('knowledge composer', () => {
  it('sends on Enter but keeps Shift+Enter and Chinese composition in the input', () => {
    const { textarea, form } = mount()
    const request = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {})
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
    expect(request).not.toHaveBeenCalled()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(request).toHaveBeenCalledOnce()
  })

  it.each([{ modelValue: '  ' }, { busy: true }, { disabled: true }, { hasSources: false }])('blocks invalid submission: %j', (overrides) => {
    const { host, form, submit } = mount(overrides)
    expect(host.querySelector('button')!.disabled).toBe(true)
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(submit).not.toHaveBeenCalled()
  })

  it('preserves multiline input and emits valid submissions', () => {
    const { textarea, form, submit, update } = mount()
    textarea.value = '问题一\n问题二'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    expect(update).toHaveBeenCalledWith('问题一\n问题二')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(submit).toHaveBeenCalledOnce()
  })
})
