import { describe, it, expect } from 'vitest'
import { llmHeadersFor, shouldAttachLLMHeaders } from './llmClientConfig'
import { maskKey } from './llmProviders'

const ORIGIN = 'https://atlas.example'

describe('shouldAttachLLMHeaders', () => {
  it('attaches only to same-origin /api/* requests', () => {
    expect(shouldAttachLLMHeaders('/api/workspace/chat', ORIGIN)).toBe(true)
    expect(shouldAttachLLMHeaders(`${ORIGIN}/api/paper-review`, ORIGIN)).toBe(true)
  })

  it('never sends the key to another origin, a non-API path, or NextAuth', () => {
    expect(shouldAttachLLMHeaders('https://api.semanticscholar.org/graph/v1/paper', ORIGIN)).toBe(false)
    expect(shouldAttachLLMHeaders('https://evil.example/api/x', ORIGIN)).toBe(false)
    expect(shouldAttachLLMHeaders('/workspace', ORIGIN)).toBe(false)
    expect(shouldAttachLLMHeaders('/api/auth/session', ORIGIN)).toBe(false)
  })
})

describe('llmHeadersFor', () => {
  it('sends provider, model and key', () => {
    expect(llmHeadersFor({ provider: 'openai', model: 'gpt-4o', apiKey: 'k' })).toEqual({
      'x-atlas-llm-provider': 'openai',
      'x-atlas-llm-model': 'gpt-4o',
      'x-atlas-llm-key': 'k',
    })
  })
})

describe('maskKey', () => {
  it('shows only the last four characters', () => {
    expect(maskKey('sk-ant-abcdef1234')).toBe('…1234')
    expect(maskKey('abc')).toBe('…')
  })
})
