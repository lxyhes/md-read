import { describe, expect, it } from 'vitest'
import { aiEndpoint, aiPayload, aiResponseText, ollamaModelNames, ollamaReasoningLevels, ollamaShowEndpoint, ollamaTagsEndpoint } from './aiProvider'

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

  it('reads installed Ollama models', () => {
    expect(ollamaTagsEndpoint('http://127.0.0.1:11434/api/chat')).toBe('http://127.0.0.1:11434/api/tags')
    expect(ollamaModelNames({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:latest' }, { name: 3 }] })).toEqual(['qwen2.5:7b', 'llama3.2:latest'])
    expect(ollamaModelNames({ error: 'offline' })).toEqual([])
  })

  it('forwards advertised reasoning levels and omits incompatible temperature fields', () => {
    const ollama = { provider: 'ollama', model: 'qwen3.5:9b' } as const
    const openai = { provider: 'openai-compatible', model: 'gpt-6.2-sol' } as const
    expect(ollamaShowEndpoint('http://127.0.0.1:11434/api/chat')).toBe('http://127.0.0.1:11434/api/show')
    expect(ollamaReasoningLevels({ thinking: { values: [false, true, true] } })).toEqual([false, true])
    expect(ollamaReasoningLevels({ thinking: { values: [false] } })).toEqual([])
    expect(ollamaReasoningLevels({ thinking: { values: ['low', 'high', null] } })).toEqual(['low', 'high'])
    expect(aiPayload(ollama, [], false)).toMatchObject({ think: false, options: { temperature: 0.2 } })
    expect(aiPayload(ollama, [])).not.toHaveProperty('think')
    expect(JSON.parse(JSON.stringify(aiPayload(openai, [], 'medium')))).toEqual({ model: 'gpt-6.2-sol', stream: false, messages: [], reasoning_effort: 'medium' })
    expect(JSON.parse(JSON.stringify(aiPayload(openai, [])))).not.toHaveProperty('temperature')
  })
})
