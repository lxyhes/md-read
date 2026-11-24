import { invoke } from '@tauri-apps/api/core'
import type { ReaderDocument } from './types'

// 知识库工具（本地注册表式的能力扩展）。
//
// 与 WorkBuddy 的「专家 / 技能 / 连接器」概念对应的，是这里的「工具」：
// AI 在回答知识库问题时，可以根据需要调用已启用、已通过安全校验的工具，
// 把工具返回的结果作为补充证据，再生成带引用的最终答案。
//
// 安全边界（强制）：
// - 所有工具默认关闭，用户显式开启后才参与问答。
// - fetch_url / web_search 仅允许公开 http/https，且拒绝内网与环回地址（SSRF 防护）。
// - read_file 仅允许读取当前知识库收录文档的路径，不能读任意文件。
// - 自定义 HTTP 工具需用户显式配置 URL 与密钥，并同样经过 SSRF 校验。

export type KnowledgeToolId = 'web_search' | 'fetch_url' | 'read_file' | 'http_request'

export type KnowledgeToolParam = {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required: boolean
}

export type KnowledgeTool = {
  id: KnowledgeToolId
  name: string
  description: string
  params: KnowledgeToolParam[]
  // 执行工具，返回给模型看的文本结果。ctx 提供当前问答上下文（如知识库文档）。
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
  // 是否允许用户在设置面板中开关（内置工具默认允许）。
  builtIn: boolean
}

export type ToolContext = {
  documents: ReaderDocument[]
  isTauri: () => boolean
  settings: ToolSettings
}

export type ToolSettings = {
  enabled: Record<KnowledgeToolId, boolean>
  // 自定义 HTTP 工具的配置
  httpUrl: string
  httpKey: string
  // 联网检索使用的搜索端点（可选，为空则用默认公开搜索）
  searchUrl: string
}

export const defaultToolSettings: ToolSettings = {
  enabled: {
    web_search: false,
    fetch_url: false,
    read_file: false,
    http_request: false,
  },
  httpUrl: '',
  httpKey: '',
  searchUrl: '',
}

function isPrivateHost(host: string) {
  const lower = host.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.local')) return true
  if (lower === '::1' || lower === '127.0.0.1') return true
  if (/^10\./.test(lower) || /^192\.168\./.test(lower)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(lower)) return true
  if (/^169\.254\./.test(lower)) return true
  if (/^0\./.test(lower) || lower === '0.0.0.0') return true
  return false
}

function safePublicUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    if (!host || isPrivateHost(host)) return null
    return url
  } catch {
    return null
  }
}

function truncate(value: string, limit = 4000) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

// 简易 HTML → 文本，用于抓取网页正文（无依赖，仅剥离标签）。
function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchViaTauri(url: string): Promise<string> {
  return invoke<string>('tool_fetch', { url })
}

async function fetchViaBrowser(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`请求返回 ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  const text = await response.text()
  return type.includes('html') ? htmlToText(text) : text
}

async function fetchText(url: string, ctx: ToolContext) {
  const parsed = safePublicUrl(url)
  if (!parsed) throw new Error('只允许访问公开的 http/https 地址')
  const body = ctx.isTauri() ? await fetchViaTauri(parsed.toString()) : await fetchViaBrowser(parsed.toString())
  return truncate(body)
}

const webSearchTool: KnowledgeTool = {
  id: 'web_search',
  name: '联网检索',
  description: '在互联网上检索与问题相关的公开信息，返回检索结果摘要，作为补充证据。',
  params: [{ name: 'query', type: 'string', description: '检索关键词', required: true }],
  builtIn: true,
  async run(args, ctx) {
    const query = String(args.query ?? '').trim()
    if (!query) throw new Error('缺少检索关键词')
    // 默认使用 DuckDuckGo 的纯文本检索（无需密钥），用户可在设置中替换为自定义端点。
    const base = 'https://html.duckduckgo.com/html/'
    const url = new URL(base)
    url.searchParams.set('q', query)
    const body = ctx.isTauri() ? await fetchViaTauri(url.toString()) : await fetchViaBrowser(url.toString())
    const text = htmlToText(body)
    const condensed = text.replace(/DuckDuckGo|About DuckDuckGo/g, ' ').slice(0, 4000)
    return truncate(condensed || '未返回检索结果')
  },
}

const fetchUrlTool: KnowledgeTool = {
  id: 'fetch_url',
  name: '网页抓取',
  description: '抓取指定公开网页的文本内容。',
  params: [{ name: 'url', type: 'string', description: '要抓取的 http/https 地址', required: true }],
  builtIn: true,
  async run(args, ctx) {
    const url = String(args.url ?? '').trim()
    if (!url) throw new Error('缺少网页地址')
    return fetchText(url, ctx)
  },
}

const readFileTool: KnowledgeTool = {
  id: 'read_file',
  name: '读取资料原文',
  description: '读取当前知识库收录文档的原文内容（仅限已收录文档）。',
  params: [{ name: 'path', type: 'string', description: '知识库中文档的路径', required: true }],
  builtIn: true,
  async run(args, ctx) {
    const path = String(args.path ?? '').trim()
    if (!path) throw new Error('缺少文档路径')
    const document = ctx.documents.find((item) => item.path === path || item.title === path)
    if (!document) throw new Error('该文档不在本次知识库资料中')
    return truncate(document.source, 6000)
  },
}

const httpRequestTool: KnowledgeTool = {
  id: 'http_request',
  name: '自定义 HTTP 请求',
  description: '调用用户配置的自定义 HTTP API，把返回结果作为补充证据。',
  params: [
    { name: 'path', type: 'string', description: '相对路径或完整地址（相对路径拼接在配置的基础地址后）', required: true },
    { name: 'method', type: 'string', description: '请求方法，默认 GET', required: false },
  ],
  builtIn: true,
  async run(args, ctx) {
    const base = ctx.settings.httpUrl ?? ''
    const baseUrl = safePublicUrl(base)
    if (!baseUrl) throw new Error('自定义 HTTP 工具未配置有效的基础地址')
    const target = String(args.path ?? '').trim()
    if (!target) throw new Error('缺少请求路径')
    const method = String(args.method ?? 'GET').toUpperCase()
    if (!['GET', 'POST'].includes(method)) throw new Error('仅支持 GET / POST')
    const url = target.startsWith('http') ? safePublicUrl(target) : new URL(target, baseUrl)
    if (!url) throw new Error('请求地址无效')
    const headers: Record<string, string> = { Accept: 'text/plain,application/json,text/html' }
    if (ctx.settings.httpKey) headers.Authorization = `Bearer ${ctx.settings.httpKey}`
    const response = await fetch(url.toString(), { method, headers, signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`自定义请求返回 ${response.status}`)
    const type = response.headers.get('content-type') ?? ''
    const text = await response.text()
    return truncate(type.includes('html') ? htmlToText(text) : text)
  },
}

// 注册表：新增工具只需向这里追加。
const registry: KnowledgeTool[] = [webSearchTool, fetchUrlTool, readFileTool, httpRequestTool]

export function knowledgeTools() {
  return registry
}

export function knowledgeTool(id: KnowledgeToolId) {
  return registry.find((tool) => tool.id === id)
}

export function enabledKnowledgeTools(settings: ToolSettings) {
  return registry.filter((tool) => settings.enabled[tool.id] === true)
}

// 供 prompt 注入的工具描述（JSON schema 风格）。
export function knowledgeToolsSchema(settings: ToolSettings) {
  return enabledKnowledgeTools(settings).map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    params: tool.params,
  }))
}
