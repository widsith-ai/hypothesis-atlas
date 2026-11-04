// SPDX-License-Identifier: AGPL-3.0-only
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { headers as nextHeaders } from 'next/headers'
import { groq as serverGroq, GROQ_MODEL } from './groq'
import { anthropic as serverAnthropic, ANTHROPIC_MODEL } from './anthropic'
import {
  LLM_HEADERS,
  getProviderInfo,
  validateLLMConfig,
  type LLMProviderId,
  type UserLLMConfig,
} from './llmProviders'

/**
 * #88/V4.8.1: one per-request model client.
 *
 * `getLLM()` resolves, in order:
 *   1. the user's own provider/model/key, sent by the browser in
 *      `x-atlas-llm-*` headers (see `src/lib/llmClientConfig.ts`);
 *   2. the existing server Groq client from `src/lib/groq.ts` — unchanged,
 *      so a user who brings no key gets exactly today's behaviour;
 *   3. `null` — the existing "not configured" path.
 *
 * The headers are read through `next/headers`, which Next scopes to the
 * current request with AsyncLocalStorage — so the user's key reaches deeply
 * nested library calls (review-grounding, atlasPlan, boldIdea…) without a
 * parameter threaded through every function. Outside a request (the BullMQ
 * worker, tests) there are no headers and it falls back to the server key.
 *
 * The key is used for the outgoing provider call only. It is never stored,
 * logged, put in the run log, or echoed back: errors from a user-key client
 * are rethrown with the key scrubbed out (see `redactSecrets`).
 */

export type ChatRole = 'system' | 'user' | 'assistant'

export interface LLMChatParams {
  messages: { role: ChatRole; content: string }[]
  /** Ignored on the user-key path: the user's chosen model always wins. */
  model?: string
  temperature?: number
  max_tokens?: number
  seed?: number
}

export interface LLMCompletion {
  choices: { message: { content: string | null } }[]
}

export interface LLMChunk {
  choices: { delta: { content?: string | null } }[]
}

export interface LLMClient {
  chat: {
    completions: {
      create(params: LLMChatParams & { stream: true }): Promise<AsyncIterable<LLMChunk>>
      create(params: LLMChatParams & { stream?: false }): Promise<LLMCompletion>
    }
  }
}

export interface ResolvedLLM {
  client: LLMClient
  provider: LLMProviderId
  model: string
  keySource: 'user' | 'server'
}

export function allowCustomBaseUrl(): boolean {
  return process.env.ALLOW_CUSTOM_LLM_BASE_URL === 'true'
}

type HeaderSource = { get(name: string): string | null }

/** Parses the `x-atlas-llm-*` headers. Invalid or partial config → null (server path). */
export function readUserLLMConfig(h: HeaderSource | null | undefined): UserLLMConfig | null {
  if (!h) return null
  const provider = h.get(LLM_HEADERS.provider)
  const apiKey = h.get(LLM_HEADERS.key)
  if (!provider || !apiKey) return null
  const result = validateLLMConfig(
    {
      provider,
      apiKey,
      model: h.get(LLM_HEADERS.model) ?? undefined,
      baseUrl: h.get(LLM_HEADERS.baseUrl) ?? undefined,
    },
    allowCustomBaseUrl()
  )
  return result.ok ? result.config : null
}

function currentRequestHeaders(): HeaderSource | null {
  try {
    return nextHeaders()
  } catch (err) {
    // During `next build`, Next signals "this route is dynamic" by throwing
    // from headers(). Swallowing it would let the route be prerendered as
    // static, so let that one through.
    if ((err as { digest?: string } | null)?.digest === 'DYNAMIC_SERVER_USAGE') throw err
    // Outside a request scope (worker, tests): no user config.
    return null
  }
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{6,}/g,
  /sk-or-[A-Za-z0-9_-]{6,}/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /gsk_[A-Za-z0-9]{8,}/g,
  /xai-[A-Za-z0-9]{8,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
]

/** Removes `key` (and anything key-shaped) from text before it is logged or returned. */
export function redactSecrets(text: string, key?: string): string {
  let out = text
  if (key && key.length >= 4) out = out.split(key).join('[redacted]')
  for (const re of KEY_PATTERNS) out = out.replace(re, '[redacted]')
  return out
}

export class LLMProviderError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LLMProviderError'
    this.status = status
  }
}

/**
 * Rethrows a provider error as a plain error with only a redacted message
 * and status — the SDK error objects carry request/response details we don't
 * want reaching a log line.
 */
function sanitizeError(err: unknown, key: string): LLMProviderError {
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : undefined
  const raw = err instanceof Error ? err.message : String(err)
  return new LLMProviderError(redactSecrets(raw, key).slice(0, 500), status)
}

async function* sanitizeStream<T>(stream: AsyncIterable<T>, key: string): AsyncIterable<T> {
  try {
    for await (const chunk of stream) yield chunk
  } catch (err) {
    throw sanitizeError(err, key)
  }
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** OpenAI's reasoning models take max_completion_tokens and reject a custom temperature. */
export function isOpenAIReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model)
}

export function buildOpenAICompatibleBody(config: UserLLMConfig, params: LLMChatParams & { stream?: boolean }) {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: params.messages,
  }
  if (params.stream) body.stream = true
  const reasoning = config.provider === 'openai' && isOpenAIReasoningModel(config.model)
  if (params.temperature !== undefined && !reasoning) body.temperature = params.temperature
  if (params.max_tokens !== undefined) {
    if (config.provider === 'openai') body.max_completion_tokens = params.max_tokens
    else body.max_tokens = params.max_tokens
  }
  // seed is only meaningful (and only reliably accepted) on these two.
  if (params.seed !== undefined && (config.provider === 'openai' || config.provider === 'groq')) body.seed = params.seed
  return body
}

function openAICompatibleClient(config: UserLLMConfig): LLMClient {
  const info = getProviderInfo(config.provider)
  const sdk = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? info?.baseURL,
    maxRetries: 1,
    timeout: 55_000,
  })
  const create = async (params: LLMChatParams & { stream?: boolean }) => {
    try {
      const body = buildOpenAICompatibleBody(config, params)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sdk.chat.completions.create(body as any)
      return params.stream ? sanitizeStream(result as unknown as AsyncIterable<LLMChunk>, config.apiKey) : result
    } catch (err) {
      throw sanitizeError(err, config.apiKey)
    }
  }
  return { chat: { completions: { create } } } as unknown as LLMClient
}

/**
 * Anthropic's Messages API wants `system` split out, `max_tokens` always
 * set, the first turn to be the user's, and roles to alternate. Chat
 * histories from the UI can start with an assistant greeting, so normalize.
 */
export function buildAnthropicBody(model: string, params: LLMChatParams) {
  const system = params.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const turns: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of params.messages) {
    if (m.role === 'system') continue
    const last = turns[turns.length - 1]
    if (last && last.role === m.role) last.content += `\n\n${m.content}`
    else turns.push({ role: m.role, content: m.content })
  }
  if (turns.length === 0 || turns[0].role !== 'user') turns.unshift({ role: 'user', content: '(conversation start)' })
  return {
    model,
    max_tokens: params.max_tokens ?? 2048,
    ...(system ? { system } : {}),
    ...(params.temperature !== undefined ? { temperature: Math.min(Math.max(params.temperature, 0), 1) } : {}),
    messages: turns,
  }
}

type AnthropicMessage = { content: { type: string; text?: string }[] }
type AnthropicEvent = { type: string; delta?: { type?: string; text?: string } }

export function anthropicMessageToCompletion(msg: AnthropicMessage): LLMCompletion {
  const text = msg.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
  return { choices: [{ message: { content: text } }] }
}

export async function* anthropicEventsToChunks(events: AsyncIterable<AnthropicEvent>): AsyncIterable<LLMChunk> {
  for await (const ev of events) {
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
      yield { choices: [{ delta: { content: ev.delta.text } }] }
    }
  }
}

function anthropicClient(config: UserLLMConfig): LLMClient {
  const sdk = new Anthropic({ apiKey: config.apiKey, maxRetries: 1, timeout: 55_000 })
  const create = async (params: LLMChatParams & { stream?: boolean }) => {
    try {
      const body = buildAnthropicBody(config.model, params)
      if (params.stream) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const events = await sdk.messages.create({ ...body, stream: true } as any)
        return sanitizeStream(anthropicEventsToChunks(events as unknown as AsyncIterable<AnthropicEvent>), config.apiKey)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = await sdk.messages.create(body as any)
      return anthropicMessageToCompletion(msg as unknown as AnthropicMessage)
    } catch (err) {
      throw sanitizeError(err, config.apiKey)
    }
  }
  return { chat: { completions: { create } } } as unknown as LLMClient
}

export function createUserLLMClient(config: UserLLMConfig): LLMClient {
  return config.provider === 'anthropic' ? anthropicClient(config) : openAICompatibleClient(config)
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export function resolveLLM(userConfig: UserLLMConfig | null): ResolvedLLM | null {
  if (userConfig) {
    return {
      client: createUserLLMClient(userConfig),
      provider: userConfig.provider,
      model: userConfig.model,
      keySource: 'user',
    }
  }
  if (serverGroq) {
    return {
      client: serverGroq as unknown as LLMClient,
      provider: 'groq',
      model: GROQ_MODEL,
      keySource: 'server',
    }
  }
  return null
}

/** The model client for the current request: the user's key if sent, else the server's, else null. */
export function getLLM(): ResolvedLLM | null {
  return resolveLLM(readUserLLMConfig(currentRequestHeaders()))
}

export function hasLLM(): boolean {
  return getLLM() !== null
}

/**
 * Paper Compare has always run on the server's Anthropic key, falling back
 * to a non-LLM overlap summary without it. Keep both, but let a user's own
 * key (any provider) win.
 */
export function getLLMPreferringServerAnthropic(): ResolvedLLM | null {
  const user = readUserLLMConfig(currentRequestHeaders())
  if (user) return resolveLLM(user)
  if (serverAnthropic) {
    return {
      client: anthropicClientFromSdk(serverAnthropic),
      provider: 'anthropic',
      model: ANTHROPIC_MODEL,
      keySource: 'server',
    }
  }
  return null
}

function anthropicClientFromSdk(sdk: Anthropic): LLMClient {
  const create = async (params: LLMChatParams & { stream?: boolean }) => {
    const body = buildAnthropicBody(ANTHROPIC_MODEL, params)
    if (params.stream) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = await sdk.messages.create({ ...body, stream: true } as any)
      return anthropicEventsToChunks(events as unknown as AsyncIterable<AnthropicEvent>)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await sdk.messages.create(body as any)
    return anthropicMessageToCompletion(msg as unknown as AnthropicMessage)
  }
  return { chat: { completions: { create } } } as unknown as LLMClient
}

export const LLM_NOT_CONFIGURED_MESSAGE =
  'No model key configured. Add your own key under "Model & API key" (top-right), or set GROQ_API_KEY on the server.'
