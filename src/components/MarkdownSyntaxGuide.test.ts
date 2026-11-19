// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { insertSyntaxExample, syntaxGuide } from '../markdown/syntaxGuide'
import MarkdownSyntaxGuide from './MarkdownSyntaxGuide.vue'

const examples = syntaxGuide.flatMap(group => group.examples)

it('searches the guide, changes previews, copies raw syntax and emits the chosen example', async () => {
  const copy = vi.fn(async () => {})
  const insert = vi.fn()
  const close = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp({ render: () => h(MarkdownSyntaxGuide, { canInsert: true, copy, onInsert: insert, onClose: close }) })
  const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
  try {
    app.mount(host)
    expect(host.querySelector('dialog')?.open).toBe(true)
    button('粗体')!.click()
    await nextTick()
    expect(host.querySelector('.syntax-guide-preview strong')?.textContent).toBe('重点文字')

    const search = host.querySelector('input')!
    search.value = '待办 task'
    search.dispatchEvent(new Event('input'))
    await nextTick()
    expect(host.querySelectorAll('.syntax-guide-preview [role="checkbox"]')).toHaveLength(2)
    button('复制源码')!.click()
    await vi.waitFor(() => expect(host.querySelector('[role="status"]')?.textContent).toBe('已复制'))
    expect(copy).toHaveBeenCalledWith('- [ ] 待完成\n- [x] 已完成')
    button('插入示例')!.click()
    expect(insert).toHaveBeenCalledWith(examples.find(example => example.name === '任务列表'))

    search.value = 'TOML'
    search.dispatchEvent(new Event('input'))
    await nextTick()
    expect(button('插入示例')).toBeUndefined()
    host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(close).toHaveBeenCalledOnce()
  } finally {
    app.unmount()
    host.remove()
  }
})

it('inserts inline syntax after the selection and block syntax after the complete current block', () => {
  const bold = examples.find(example => example.name === '粗体')!
  expect(insertSyntaxExample('原文。', 2, bold)).toEqual({ value: '原文**重点文字**。', cursor: 10 })

  const table = '| A |\r\n| --- |\r\n| B |'
  const todo = examples.find(example => example.name === '任务列表')!
  const result = insertSyntaxExample(table + '\r\n\r\n原文', 2, todo)
  expect(result.value).toBe(table + '\r\n\r\n- [ ] 待完成\r\n- [x] 已完成\r\n\r\n原文')
  expect(result.value.slice(result.cursor)).toBe('\r\n\r\n原文')
})
