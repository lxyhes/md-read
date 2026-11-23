import { expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { readTextFile, stat } from '@tauri-apps/plugin-fs'
import { moveFilePath } from './fileService'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: vi.fn(), stat: vi.fn() }))

it('keeps moved Markdown images readable while retaining the original files and Markdown formatting', async () => {
  const original = 'E:/notes/draft.md'
  const destination = 'E:/notes/archive/draft.md'
  const lines = [
    '![封面](<images/封 面.png> "标题")',
    '![重复][cover]',
    '',
    '[cover]: ./images/封%20面.png#detail',
    '',
    '<img alt="保留 src=other.png" src="images/封%20面.png?size=2" width="60">',
    '',
    '![已在目标目录](archive/charts/chart.svg)',
    '![绝对本地路径](E:/notes/images/absolute.png)',
    '![网络图片](https://example.org/image.png)',
    '`![代码](images/absolute.png)`',
    '```md',
    '![示例](images/absolute.png)',
    '```',
  ]
  const source = lines.join('\r\n')
  vi.mocked(readTextFile).mockResolvedValueOnce(source)
  vi.mocked(stat).mockResolvedValue({ isFile: true } as Awaited<ReturnType<typeof stat>>)
  const moved = await moveFilePath(original, destination)

  const [, args] = vi.mocked(invoke).mock.calls[0]
  const assetFolder = args && 'assetFolder' in args ? args.assetFolder : undefined
  expect(assetFolder).toMatch(/^moved-/)
  const image = `.moyue-assets/${assetFolder}/1-%E5%B0%81%20%E9%9D%A2.png`
  expect(moved).toBe([
    `![封面](<${image}> "标题")`,
    ...lines.slice(1, 3),
    `[cover]: ./${image}#detail`,
    '',
    `<img alt="保留 src=other.png" src="${image}?size=2" width="60">`,
    '',
    '![已在目标目录](charts/chart.svg)',
    `![绝对本地路径](.moyue-assets/${assetFolder}/2-absolute.png)`,
    ...lines.slice(9),
  ].join('\r\n'))
  expect(invoke).toHaveBeenCalledExactlyOnceWith('move_markdown_with_assets', {
    path: original,
    nextPath: destination,
    expectedSource: source,
    nextSource: moved,
    assetFolder,
    assets: ['E:/notes/images/封 面.png', 'E:/notes/images/absolute.png'],
  })
})
