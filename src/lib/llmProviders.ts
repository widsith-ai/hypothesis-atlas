// SPDX-License-Identifier: AGPL-3.0-only

/**
 * #88/V4.8.1: bring-your-own model key — the provider registry.
 *
 * Shared by the browser (the Model & API key dialog) and the server
 * (`src/lib/llm.ts`), so it must not import anything server-only.
 *
 * Every provider except Anthropic exposes an OpenAI-compatible Chat
 * Completions API, so one adapter (the `openai` SDK with a `baseURL`) covers
 * them; Anthropic gets a native adapter. The model field in the UI is free
 * text — `models` are only suggestions, so a newly released model works
 * without a code change.
 */

export type LLMProviderId =
  | 'groq'
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'together'

export interface LLMProviderInfo {
  id: LLMProviderId
  label: string
  transport: 'openai-compatible' | 'anthropic'
  /** Fixed endpoint for OpenAI-compatible providers. Users can't supply their own (SSRF). */
  baseURL?: string
  defaultModel: string
  models: string[]
  /** Where a user gets a key — shown as a link in the dialog. */
  keyUrl?: string
  keyPlaceholder: string
}

export const LLM_PROVIDERS: LLMProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    transport: 'anthropic',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-sonnet-4-6'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    transport: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    transport: 'openai-compatible',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
  },
  {
    id: 'groq',
    label: 'Groq',
    transport: 'openai-compatible',
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'],
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    transport: 'openai-compatible',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-oss-120b',
    models: ['openai/gpt-oss-120b', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro'],
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    transport: 'openai-compatible',
    baseURL: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    keyUrl: 'https://console.mistral.ai/api-keys',
    keyPlaceholder: 'Mistral API key',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    transport: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-…',
  },
  {
    id: 'xai',
    label: 'xAI',
    transport: 'openai-compatible',
    baseURL: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    models: ['grok-3', 'grok-3-mini'],
    keyUrl: 'https://console.x.ai',
    keyPlaceholder: 'xai-…',
  },
  {
    id: 'together',
    label: 'Together AI',
    transport: 'openai-compatible',
    baseURL: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3'],
    keyUrl: 'https://api.together.ai/settings/api-keys',
    keyPlaceholder: 'Together API key',
  },
]

export function getProviderInfo(id: string | null | undefined): LLMProviderInfo | null {
  return LLM_PROVIDERS.find((p) => p.id === id) ?? null
}

/** Request headers the browser uses to hand its config to the server (same-origin /api/* only). */
export const LLM_HEADERS = {
  provider: 'x-atlas-llm-provider',
  model: 'x-atlas-llm-model',
  key: 'x-atlas-llm-key',
} as const

export interface UserLLMConfig {
  provider: LLMProviderId
  model: string
  apiKey: string
}

const MODEL_RE = /^[A-Za-z0-9._:/@+-]{1,128}$/
const KEY_RE = /^[\x21-\x7e]{1,512}$/ // printable ASCII, no whitespace — header-safe

export type ValidationResult = { ok: true; config: UserLLMConfig } | { ok: false; error: string }

/**
 * Validates a config from either side. Only the fixed providers above are
 * accepted — the server never calls a URL the user supplied.
 */
export function validateLLMConfig(raw: { provider?: unknown; model?: unknown; apiKey?: unknown }): ValidationResult {
  const info = getProviderInfo(typeof raw.provider === 'string' ? raw.provider : null)
  if (!info) return { ok: false, error: 'Unknown provider.' }

  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  if (!apiKey) return { ok: false, error: 'API key is empty.' }
  if (!KEY_RE.test(apiKey)) return { ok: false, error: 'API key contains spaces or unsupported characters.' }

  const model = (typeof raw.model === 'string' ? raw.model.trim() : '') || info.defaultModel
  if (!MODEL_RE.test(model)) return { ok: false, error: 'Model name is empty or has unsupported characters.' }

  return { ok: true, config: { provider: info.id, model, apiKey } }
}

/** "…a1b2" — the only form of a key ever shown back to the user. */
export function maskKey(key: string): string {
  return key.length <= 4 ? '…' : `…${key.slice(-4)}`
}
