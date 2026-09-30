import { describe, expect, it } from 'vitest'
import { embedExportImages } from './exportImages'

const assets = [{ url: '图 片.png', name: '图.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }]

describe('source-safe image export', () => {
  it('embeds titled and reference images while retaining unrelated bytes and CRLF', () => {
    const source = '# 标题\r\n\r\n![图](<图 片.png> "标题")\r\n\r\n![引用][cover]\r\n\r\n[cover]: <图 片.png>\r\n\r\n`![字面](<图 片.png>)`\r\n'
    const result = embedExportImages(source, assets)
    expect(result).toBe(source.replace('![图](<图 片.png> "标题")', '![图](data:image/png;base64,AQID "标题")').replace('![引用][cover]', '![引用](data:image/png;base64,AQID)'))
  })

  it('does not convert unknown remote images or image-like code', () => {
    const source = '![远程](https://example.com/a.png)\n\n```md\n![字面](<图 片.png>)\n```'
    expect(embedExportImages(source, assets)).toBe(source)
  })
})
