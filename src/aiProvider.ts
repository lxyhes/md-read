export type AiProvider = 'ollama' | 'openai-compatible'
export type AiRole = 'system' | 'user' | 'assistant'
export type AiMessage = { role: AiRole; content: string }
export type AiReasoning = string | boolean
export const openAiReasoningLevels = ['low', 'medium', 'high'] as const

export type AiSettings = {
  enabled: boolean
  semanticSearch: boolean
  provider: AiProvider
  baseUrl: string
  model: string
  apiKey: string
}

export const defaultAiSettings: AiSettings = {
  enabled: false,
  semanticSearch: false,
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:7b',
  apiKey: '',
}

export function aiEndpoint(settings: Pick<AiSettings, 'provider' | 'baseUrl'>) {
  const base = settings.baseUrl.trim().replace(/\/+$/, '')
  if (settings.provider === 'ollama') return /\/api\/chat$/i.test(base) ? base : `${base}/api/chat`
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
}

export function ollamaTagsEndpoint(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, '').replace(/\/api\/(?:chat|tags)$/i, '')
  return `${base}/api/tags`
}

export function ollamaShowEndpoint(baseUrl: string) {
  return ollamaTagsEndpoint(baseUrl).replace(/\/tags$/, '/show')
}

export function ollamaReasoningLevels(payload: unknown): AiReasoning[] {
  const values = (payload as { thinking?: { values?: unknown } } | null)?.thinking?.values
  if (!Array.isArray(values)) return []
  const supported = values.filter((value): value is AiReasoning =>
    typeof value === 'boolean' || (typeof value === 'string' && !!value.trim()))
  return supported.some(value => value !== false) ? [...new Set(supported)] : []
}

// 推理类模型的判断：优先看是否显式传入了推理强度（reasoning），其次按已知的
// 推理模型命名前缀兜底。OpenAI 系列新模型可能使用不同命名，维护时优先补充前缀，
// 或改为依据服务端返回的能力标志（如 /models 返回的 reasoning 能力）判断。
export function isReasoningModel(model: string) {
  return /^(?:gpt-[56](?:[.-]|$)|o[134](?:-|$))/i.test(model.trim())
}

export function aiTemperature(settings: Pick<AiSettings, 'provider' | 'model'>, reasoning?: AiReasoning) {
  if (settings.provider === 'openai-compatible' && (reasoning !== undefined || isReasoningModel(settings.model))) return undefined
  return 0.2
}

export function ollamaModelNames(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { models?: unknown }).models)) return []
  return (payload as { models: Array<{ name?: unknown }> }).models
    .map((model) => typeof model?.name === 'string' ? model.name.trim() : '')
    .filter(Boolean)
}

export function aiPayload(settings: Pick<AiSettings, 'provider' | 'model'>, messages: AiMessage[], reasoning?: AiReasoning) {
  const common = { model: settings.model.trim(), messages, stream: false }
  return settings.provider === 'ollama'
    ? { ...common, options: { temperature: aiTemperature(settings) }, ...(reasoning !== undefined && { think: reasoning }) }
    : { ...common, ...(reasoning !== undefined && { reasoning_effort: reasoning }), temperature: aiTemperature(settings, reasoning) }
}

export function aiResponseText(provider: AiProvider, payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const value = payload as { message?: { content?: unknown }; choices?: Array<{ message?: { content?: unknown } }> }
  const content = provider === 'ollama' ? value.message?.content : value.choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}
