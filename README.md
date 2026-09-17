# 墨阅 Moyue Reader

一款面向桌面端的 Markdown 沉浸式阅读器。

墨阅不是 Markdown 编辑器，重点是让长文档更适合阅读、理解和回看：Markdown 会被解析为多个阅读区域，用户可以按章节导航、聚焦内容、查看代码和 Mermaid 图表，并在主题之间切换阅读氛围。

当前版本定位为桌面端 V1 阅读器，优先保证本地、离线、连续阅读体验。正式验证平台为 Windows，前端结构保持 Tauri 跨平台兼容。

## 当前能力

- Markdown / GFM 渲染：标题、大纲、列表、任务列表、引用、表格、图片和分隔线
- 阅读体验：阅读进度恢复、区域聚焦、专注模式、快捷键、选词工具栏
- 代码阅读：Shiki 语法高亮、行号、语言标识、行数统计、复制代码、横向滚动
- 独立查看器：Mermaid 图表、图片、代码和表格；Mermaid 支持适应窗口、缩放拖动、源码复制、SVG / PNG 导出
- 主题系统：月影深蓝、静默苔原、蓝调时刻，以及主题导入、编辑和导出
- 本地数据：Tauri 桌面端使用 SQLite；浏览器预览使用 localStorage 回退
- 文件操作：打开 Markdown 文件、打开文件夹扫描 Markdown、拖拽导入
- 连续阅读：恢复上次打开的文档标签、当前文档和滚动位置；桌面端监听 Markdown 外部修改并自动重新解析
- 桌面交互：多文档标签、文件树、全屏、相对图片资源、外部文件变化提示
- 性能与可用性：搜索防抖、长文档区域懒布局、键盘焦点样式、初始化和保存失败反馈

## 支持的 Markdown 内容

解析链路为：

~~~text
Markdown
  → remark-parse
  → remark-gfm / frontmatter
  → ReaderRegion
  → Vue 阅读区域渲染
~~~

支持的主要内容包括：

- 标题与大纲、段落、软换行、引用、列表和任务列表
- fenced code、Shiki 高亮、Mermaid 代码块
- GFM 表格、图片、链接和分隔线
- 危险 HTML、脚本、事件属性和危险 URL 会被隐藏或清理
- 桌面端 Markdown 相对图片会按文档目录解析

## 技术栈

- Tauri 2
- Vue 3 + TypeScript + Vite
- Pinia
- remark-parse + remark-gfm + unified
- Shiki
- Mermaid
- SQLite（Tauri SQL 插件）

## 开发环境

建议使用：

- Node.js 18+
- Rust stable
- Windows 10 / 11（当前主要验证平台）

安装前端依赖：

```bash
npm install
```

启动浏览器预览：

```bash
npm run dev
```

启动 Tauri 桌面开发模式：

```bash
npm run tauri dev
```

浏览器预览适合查看 UI 和基础 Markdown 渲染；完整的本地文件读取、文件夹扫描、SQLite、外部文件监听和相对图片资源体验请使用 Tauri 桌面模式。

## 常用命令

```bash
# 类型检查并构建前端
npm run build

# 运行单元测试
npm run test

# 预览生产构建
npm run preview
```

## 项目结构

```text
.
├─ src/
│  ├─ components/       Vue 阅读组件、主题组件和图标组件
│  ├─ stores/            Pinia 阅读状态
│  ├─ parser.ts          Markdown AST 与 ReaderRegion 转换
│  ├─ highlight.ts       Shiki 代码高亮
│  ├─ persistence.ts     SQLite / localStorage 持久化
│  ├─ fileService.ts     文件导入、文件树和外部文件监听
│  ├─ themes.ts          内置主题与主题包处理
│  └─ styles.css         全局布局、主题和阅读排版
├─ src-tauri/            Tauri 2 Rust 容器与插件配置
├─ 设计图/               产品设计参考图
└─ package.json
```

## 阅读交互

- `Ctrl / Cmd + K`：打开搜索
- Ctrl / Cmd + O：打开 Markdown 文件
- Ctrl / Cmd + Tab：切换下一个已打开文档
- Ctrl / Cmd + Shift + Tab：切换上一个已打开文档
- Ctrl / Cmd + W：关闭当前文档标签
- `F`：进入专注模式
- `Enter` / `空格`：聚焦当前阅读区域
- `↑` / `↓`：切换阅读区域
- `Esc`：退出区域聚焦或关闭查看器
- 点击代码块的复制按钮：复制完整代码内容

## 主题与本地数据

- 内置主题：ember-paper、quiet-moss、blue-hour
- 主题切换不会重新解析 Markdown。
- 自定义主题可导入、实时预览、应用和导出为 .moyue-theme。
- 阅读偏好保存在本地，切换主题或重启后保留正文宽度、字号、行距和字体。
- 文档快照、阅读进度和批注保存在本地；Tauri 桌面端额外使用 SQLite。
- 不提交本地 .env、数据库、构建产物和用户文档，相关规则见 .gitignore。

## 当前验证

~~~bash
npm run test
npm run build
~~~

当前单元测试覆盖 Markdown Region 解析、标题、大纲、危险 HTML、软换行和相对资源解析。

## V1 暂缓项

- PDF 阅读
- 账号、云同步和社区主题市场
- 插件脚本运行时
- ECharts 数据图表
- 固定的第三方 AI / 翻译服务
- 原生安装包发布和自动更新

## 许可证

项目当前处于开发阶段，许可证与发布方式待后续确定。
