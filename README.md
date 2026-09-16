# 墨阅 Moyue Reader

一款面向桌面端的 Markdown 沉浸式阅读器。

墨阅不是 Markdown 编辑器，重点是让长文档更适合阅读、理解和回看：Markdown 会被解析为多个阅读区域，用户可以按章节导航、聚焦内容、查看代码和 Mermaid 图表，并在主题之间切换阅读氛围。

## 当前能力

- Markdown / GFM 渲染：标题、大纲、列表、任务列表、引用、表格、图片和分隔线
- 阅读体验：阅读进度恢复、区域聚焦、专注模式、快捷键、选词工具栏
- 代码阅读：Shiki 语法高亮、行号、语言标识、行数统计、复制代码、横向滚动
- 独立查看器：Mermaid 图表、图片、代码和表格
- 主题系统：月影深蓝、静默苔原、蓝调时刻，以及主题导入、编辑和导出
- 本地数据：Tauri 桌面端使用 SQLite；浏览器预览使用 localStorage 回退
- 文件操作：打开 Markdown 文件、打开文件夹扫描 Markdown、拖拽导入

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
│  ├─ fileService.ts     文件和文件夹导入
│  ├─ themes.ts          内置主题与主题包处理
│  └─ styles.css         全局布局、主题和阅读排版
├─ src-tauri/            Tauri 2 Rust 容器与插件配置
├─ 设计图/               产品设计参考图
└─ package.json
```

## 阅读交互

- `Ctrl / Cmd + K`：打开搜索
- `F`：进入专注模式
- `Enter` / `空格`：聚焦当前阅读区域
- `↑` / `↓`：切换阅读区域
- `Esc`：退出区域聚焦或关闭查看器
- 点击代码块的复制按钮：复制完整代码内容

## V1 暂缓项

- PDF 阅读
- 账号、云同步和社区主题市场
- 插件脚本运行时
- ECharts 数据图表
- 固定的第三方 AI / 翻译服务

## 许可证

项目当前处于开发阶段，许可证与发布方式待后续确定。
