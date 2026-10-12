export type AiProvider = 'ollama' | 'openai-compatible'
export type AiRole = 'system' | 'user' | 'assistant'
export type AiMessage = { role: AiRole; content: string }

export type AiSettings = {
  enabled: boolean
  provider: AiProvider
  baseUrl: string
  model: string
  apiKey: string
}

export const defaultAiSettings: AiSettings = {
  enabled: false,
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

export function aiPayload(settings: Pick<AiSettings, 'provider' | 'model'>, messages: AiMessage[]) {
  return settings.provider === 'ollama'
    ? { model: settings.model.trim(), messages, stream: false, options: { temperature: 0.2 } }
    : { model: settings.model.trim(), messages, stream: false, temperature: 0.2 }
}

export function aiResponseText(provider: AiProvider, payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const value = payload as { message?: { content?: unknown }; choices?: Array<{ message?: { content?: unknown } }> }
  const content = provider === 'ollama' ? value.message?.content : value.choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}
