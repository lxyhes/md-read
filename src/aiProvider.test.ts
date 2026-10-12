import { describe, expect, it } from 'vitest'
import { aiEndpoint, aiPayload, aiResponseText } from './aiProvider'

describe('AI provider adapters', () => {
  it('builds Ollama and OpenAI-compatible requests', () => {
    expect(aiEndpoint({ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/' })).toBe('http://127.0.0.1:11434/api/chat')
    expect(aiEndpoint({ provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1' })).toBe('https://api.example.com/v1/chat/completions')
    expect(aiPayload({ provider: 'ollama', model: 'qwen2.5:7b' }, [{ role: 'user', content: '你好' }])).toMatchObject({ model: 'qwen2.5:7b', stream: false })
  })

  it('reads both response shapes', () => {
    expect(aiResponseText('ollama', { message: { content: '本地回答' } })).toBe('本地回答')
    expect(aiResponseText('openai-compatible', { choices: [{ message: { content: '接口回答' } }] })).toBe('接口回答')
  })
})
