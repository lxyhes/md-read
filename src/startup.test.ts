// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'

const startup = vi.hoisted(() => ({
  styles: Promise.resolve() as Promise<unknown>,
  mount: vi.fn(),
  use: vi.fn(),
  createApp: vi.fn(),
}))

vi.mock('./startup', () => ({ get startupStylesReady() { return startup.styles } }))
vi.mock('./App.vue', () => ({ default: {} }))
vi.mock('vue', () => ({ createApp: startup.createApp }))
vi.mock('pinia', () => ({ createPinia: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  startup.use.mockReturnValue({ mount: startup.mount })
  startup.createApp.mockReturnValue({ use: startup.use })
  document.body.innerHTML = '<div id="app"><div id="startup-splash"><small>准备中</small></div></div>'
})

it('keeps the splash until the application stylesheet is ready', async () => {
  let resolveStyles!: () => void
  startup.styles = new Promise<void>(resolve => { resolveStyles = resolve })
  await import('./main')
  await vi.dynamicImportSettled()
  expect(startup.mount).not.toHaveBeenCalled()
  expect(document.querySelector('#startup-splash')).not.toBeNull()

  resolveStyles()
  await vi.waitFor(() => expect(startup.mount).toHaveBeenCalledWith('#app'))
})

it('keeps a visible error instead of mounting an unstyled app when CSS fails', async () => {
  let rejectStyles!: (error: Error) => void
  startup.styles = new Promise((_, reject) => { rejectStyles = reject })
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await import('./main')
    rejectStyles(new Error('stylesheet unavailable'))
    await vi.waitFor(() => expect(document.querySelector('#startup-splash small')?.textContent).toContain('stylesheet unavailable'))
    expect(startup.mount).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})
