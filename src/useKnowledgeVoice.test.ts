// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useKnowledgeVoice } from './useKnowledgeVoice'
import type { KnowledgeCitation } from './knowledgeConversations'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

it('retrieves the latest spoken turn, sends selected evidence and releases the microphone', async () => {
  const channel = { readyState: 'open', onopen: () => {}, onmessage: (_event: { data: string }) => {}, close: vi.fn(), send: vi.fn() }
  const connection = {
    createDataChannel: () => channel, close: vi.fn(), addTrack: vi.fn(),
    createOffer: async () => ({ type: 'offer', sdp: 'v=0 offer' }),
    setLocalDescription: vi.fn(), setRemoteDescription: vi.fn(),
  }
  const audio = { pause: vi.fn(), srcObject: null }
  const track = { enabled: true, stop: vi.fn() }
  vi.stubGlobal('RTCPeerConnection', function () { return connection })
  vi.stubGlobal('Audio', function () { return audio })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } })
  vi.mocked(invoke).mockResolvedValue('v=0 answer')
  const citation: KnowledgeCitation = { index: 1, documentId: '1', documentTitle: '运维手册', documentPath: 'guide.md', regionId: '1', excerpt: '重试次数为三次。', sourceHash: 'h' }
  let resolveOld!: (matches: KnowledgeCitation[]) => void
  const pending = new Promise<KnowledgeCitation[]>(resolve => { resolveOld = resolve })
  const find = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce([citation])
  const scope = effectScope()
  const voice = scope.run(() => useKnowledgeVoice(find))!
  const dispatch = (type: string, props: Record<string, unknown> = {}) => channel.onmessage({ data: JSON.stringify({ type, ...props }) })

  try {
    await voice.start('mock-key')
    expect(connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'v=0 answer' })
    channel.onopen()
    dispatch('input_audio_buffer.speech_started', { item_id: 'old' })
    dispatch('conversation.item.input_audio_transcription.completed', { item_id: 'old', transcript: '旧问题' })
    dispatch('input_audio_buffer.speech_started', { item_id: 'new' })
    dispatch('conversation.item.input_audio_transcription.completed', { item_id: 'new', transcript: '重试几次' })
    resolveOld([])
    await Promise.resolve()

    expect(channel.send).toHaveBeenCalledOnce()
    expect(channel.send.mock.calls[0][0]).toContain('重试次数为三次。')
    expect(voice.question.value).toBe('重试几次')
    expect(voice.evidence.value).toEqual([citation])
    dispatch('response.created', { response: { id: 'reply2', metadata: { moyue_turn: '2' } } })
    dispatch('response.output_audio_transcript.delta', { response_id: 'reply1', delta: '旧回答' })
    dispatch('response.output_audio_transcript.delta', { response_id: 'reply2', delta: '重试次数为三次。' })
    expect(voice.answer.value).toBe('重试次数为三次。')
    voice.toggleMute()
    expect(track.enabled).toBe(false)
  } finally {
    scope.stop()
  }
  expect(track.stop).toHaveBeenCalledOnce()
  expect(connection.close).toHaveBeenCalledOnce()
  expect(voice.state.value).toBe('idle')
})
