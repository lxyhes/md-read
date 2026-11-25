import { expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { deleteSystemEntry } from './fileService'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readDir: vi.fn(), readTextFile: vi.fn() }))

it('requests deletion only for downloaded images referenced by the selected document and not shared by known documents', async () => {
  const path = 'E:/notes/note.md'
  const image = (index: number) => `download-01234567-89ab-cdef-0123-456789abcdef-${index}.png`
  const reference = (index: number) => `![](./.moyue-assets/${image(index)})`
  const source = `${[1, 2, 3].map(reference).join('\n\n')}\n\n![](.moyue-assets/manual.png)\n\n![](../.moyue-assets/${image(4)})`
  vi.mocked(readDir).mockResolvedValue(['note.md', 'sibling.qmd'].map(name => ({ name, isDirectory: false, isFile: true, isSymlink: false })))
  vi.mocked(readTextFile).mockImplementation(async entry => entry === path ? source : reference(2))
  vi.mocked(invoke).mockResolvedValue({ removedImages: 1, failedImages: 0 })

  await expect(deleteSystemEntry(path, false, true, [{ path: 'E:/elsewhere.md', source: `![](notes/.moyue-assets/${image(3)})` }])).resolves.toEqual({
    removedImages: 1, failedImages: 0, imageCheckFailed: false,
  })
  expect(invoke).toHaveBeenLastCalledWith('delete_system_entry', { path, isDirectory: false, expectedSource: source, images: [image(1)] })

  vi.mocked(readTextFile).mockRejectedValue(new Error('unreadable'))
  vi.mocked(invoke).mockResolvedValue({ removedImages: 0, failedImages: 0 })
  await expect(deleteSystemEntry(path, false, true, [])).resolves.toMatchObject({ imageCheckFailed: true })
  expect(invoke).toHaveBeenLastCalledWith('delete_system_entry', { path, isDirectory: false, expectedSource: null, images: [] })
})
