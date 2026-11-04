import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { headersMock, openaiCreate, anthropicCreate, groqCreate, openaiCtor } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  openaiCreate: vi.fn(),
  anthropicCreate: vi.fn(),
  groqCreate: vi.fn(),
  openaiCtor: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: headersMock }))
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation((opts: unknown) => {
    openaiCtor(opts)
    return { chat: { completions: { create: openaiCreate } } }
  }),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: anthropicCreate } })),
}))
vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ chat: { completions: { create: groqCreate } } })),
}))

const USER_KEY = 'sk-test-USERSECRET1234567890'

function requestHeaders(values: Record<string, string>) {
  const h = new Headers(values)
  return { get: (name: string) => h.get(name) }
}

async function load() {
  vi.resetModules()
  return import('./llm')
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GROQ_API_KEY = 'server-groq-key'
  delete process.env.ALLOW_CUSTOM_LLM_BASE_URL
  delete process.env.ANTHROPIC_API_KEY
  // Default: outside a request scope, like the worker.
  headersMock.mockImplementation(() => {
    throw new Error('headers was called outside a request scope')
  })
})

const consoleSpies: { mockRestore(): void }[] = []
afterEach(() => {
  // Not vi.restoreAllMocks(): that would also wipe the SDK constructor mocks above.
  while (consoleSpies.length) consoleSpies.pop()!.mockRestore()
})

describe('readUserLLMConfig', () => {
  it('accepts a valid provider/model/key', async () => {
    const { readUserLLMConfig } = await load()
    expect(
      readUserLLMConfig(
        requestHeaders({ 'x-atlas-llm-provider': 'anthropic', 'x-atlas-llm-model': 'claude-sonnet-5-5', 'x-atlas-llm-key': USER_KEY })
      )
    ).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: USER_KEY })
  })

  it("fills in the provider's default model when none is sent", async () => {
    const { readUserLLMConfig } = await load()
    expect(readUserLLMConfig(requestHeaders({ 'x-atlas-llm-provider': 'gemini', 'x-atlas-llm-key': 'AIzaKEY' }))?.model).toBe(
      'gemini-2.5-flash'
    )
  })

  it('rejects an unknown provider, an empty key, and a bad model name', async () => {
    const { readUserLLMConfig } = await load()
    expect(readUserLLMConfig(requestHeaders({ 'x-atlas-llm-provider': 'nope', 'x-atlas-llm-key': USER_KEY }))).toBeNull()
    expect(readUserLLMConfig(requestHeaders({ 'x-atlas-llm-provider': 'openai', 'x-atlas-llm-key': '' }))).toBeNull()
    expect(
      readUserLLMConfig(requestHeaders({ 'x-atlas-llm-provider': 'openai', 'x-atlas-llm-key': USER_KEY, 'x-atlas-llm-model': 'a b' }))
    ).toBeNull()
  })

  it('rejects a custom base URL unless the server opts in', async () => {
    const custom = { 'x-atlas-llm-provider': 'custom', 'x-atlas-llm-key': 'k', 'x-atlas-llm-model': 'llama3', 'x-atlas-llm-base-url': 'http://localhost:11434/v1' }
    let mod = await load()
    expect(mod.readUserLLMConfig(requestHeaders(custom))).toBeNull()

    process.env.ALLOW_CUSTOM_LLM_BASE_URL = 'true'
    mod = await load()
    expect(mod.readUserLLMConfig(requestHeaders(custom))?.baseUrl).toBe('http://localhost:11434/v1')
    expect(mod.readUserLLMConfig(requestHeaders({ ...custom, 'x-atlas-llm-base-url': 'file:///etc/passwd' }))).toBeNull()
  })
})

describe('getLLM resolution order', () => {
  it("uses the user's key when the request carries one", async () => {
    headersMock.mockReturnValue(requestHeaders({ 'x-atlas-llm-provider': 'openai', 'x-atlas-llm-model': 'gpt-4o', 'x-atlas-llm-key': USER_KEY }))
    const { getLLM } = await load()
    const llm = getLLM()
    expect(llm).toMatchObject({ provider: 'openai', model: 'gpt-4o', keySource: 'user' })
    expect(openaiCtor).toHaveBeenCalledWith(expect.objectContaining({ apiKey: USER_KEY, baseURL: 'https://api.openai.com/v1' }))
  })

  it('falls back to the server Groq client outside a request (worker)', async () => {
    const { getLLM } = await load()
    expect(getLLM()).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b', keySource: 'server' })
  })

  it('falls back to the server client when the request carries invalid config', async () => {
    headersMock.mockReturnValue(requestHeaders({ 'x-atlas-llm-provider': 'bogus', 'x-atlas-llm-key': USER_KEY }))
    const { getLLM } = await load()
    expect(getLLM()?.keySource).toBe('server')
  })

  it('returns null when there is neither a user key nor a server key', async () => {
    delete process.env.GROQ_API_KEY
    headersMock.mockReturnValue(requestHeaders({}))
    const { getLLM, hasLLM } = await load()
    expect(getLLM()).toBeNull()
    expect(hasLLM()).toBe(false)
  })

  it("lets Next's dynamic-usage signal through instead of swallowing it", async () => {
    headersMock.mockImplementation(() => {
      throw Object.assign(new Error('Dynamic server usage'), { digest: 'DYNAMIC_SERVER_USAGE' })
    })
    const { getLLM } = await load()
    expect(() => getLLM()).toThrow('Dynamic server usage')
  })

  it('Paper Compare: user key wins, then server Anthropic, then null (no Groq)', async () => {
    let mod = await load()
    expect(mod.getLLMPreferringServerAnthropic()).toBeNull()

    process.env.ANTHROPIC_API_KEY = 'server-anthropic'
    mod = await load()
    expect(mod.getLLMPreferringServerAnthropic()).toMatchObject({ provider: 'anthropic', keySource: 'server' })

    headersMock.mockReturnValue(requestHeaders({ 'x-atlas-llm-provider': 'gemini', 'x-atlas-llm-key': 'AIzaUSER' }))
    mod = await load()
    expect(mod.getLLMPreferringServerAnthropic()).toMatchObject({ provider: 'gemini', keySource: 'user' })
  })
})

describe('OpenAI-compatible request quirks', () => {
  it('OpenAI reasoning models get max_completion_tokens and no temperature', async () => {
    const { buildOpenAICompatibleBody } = await load()
    const body = buildOpenAICompatibleBody(
      { provider: 'openai', model: 'o4-mini', apiKey: 'k' },
      { messages: [{ role: 'user', content: 'hi' }], temperature: 0.3, max_tokens: 500 }
    )
    expect(body).toMatchObject({ model: 'o4-mini', max_completion_tokens: 500 })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('max_tokens')
  })

  it("other providers keep max_tokens and temperature, drop seed, and always use the user's model", async () => {
    const { buildOpenAICompatibleBody } = await load()
    const body = buildOpenAICompatibleBody(
      { provider: 'mistral', model: 'mistral-large-latest', apiKey: 'k' },
      { messages: [], model: 'openai/gpt-oss-120b', temperature: 0.2, max_tokens: 300, seed: 7 }
    )
    expect(body).toEqual({ model: 'mistral-large-latest', messages: [], temperature: 0.2, max_tokens: 300 })
  })
})

describe('Anthropic adapter', () => {
  it('splits out system, sets max_tokens, starts on a user turn and merges same-role turns', async () => {
    const { buildAnthropicBody } = await load()
    const body = buildAnthropicBody('claude-sonnet-5-5', {
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'assistant', content: 'Hello! How can I help?' },
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
      ],
      temperature: 1.4,
    })
    expect(body).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 2048,
      system: 'be brief',
      temperature: 1,
      messages: [
        { role: 'user', content: '(conversation start)' },
        { role: 'assistant', content: 'Hello! How can I help?' },
        { role: 'user', content: 'a\n\nb' },
      ],
    })
  })

  it('maps a response back to choices[0].message.content', async () => {
    headersMock.mockReturnValue(requestHeaders({ 'x-atlas-llm-provider': 'anthropic', 'x-atlas-llm-key': 'sk-ant-USERKEY123' }))
    anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"ok":' }, { type: 'text', text: 'true}' }] })
    const { getLLM } = await load()
    const out = await getLLM()!.client.chat.completions.create({ messages: [{ role: 'user', content: 'x' }], max_tokens: 50 })
    expect(out.choices[0].message.content).toBe('{"ok":true}')
    expect(anthropicCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-5-5', max_tokens: 50 }))
  })

  it('maps streaming text deltas to choices[0].delta.content', async () => {
    const { anthropicEventsToChunks } = await load()
    async function* events() {
      yield { type: 'message_start' }
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }
      yield { type: 'content_block_delta', delta: { type: 'input_json_delta' } }
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } }
      yield { type: 'message_stop' }
    }
    const out: string[] = []
    for await (const c of anthropicEventsToChunks(events())) out.push(c.choices[0].delta.content ?? '')
    expect(out.join('')).toBe('Hello')
  })
})

describe('redaction — the key never leaks', () => {
  it('redactSecrets scrubs the exact key and key-shaped strings', async () => {
    const { redactSecrets } = await load()
    expect(redactSecrets(`bad key ${USER_KEY}`, USER_KEY)).toBe('bad key [redacted]')
    expect(redactSecrets('Incorrect API key provided: sk-proj-abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
    expect(redactSecrets('key gsk_ABCDEFGH12345678 rejected')).toBe('key [redacted] rejected')
    expect(redactSecrets('AIzaSyA1234567890abcdefghijklmno is invalid')).toBe('[redacted] is invalid')
  })

  it('provider errors are rethrown without the key, and generateWithGroq logs no key', async () => {
    headersMock.mockReturnValue(requestHeaders({ 'x-atlas-llm-provider': 'openai', 'x-atlas-llm-key': USER_KEY }))
    openaiCreate.mockRejectedValue(Object.assign(new Error(`401 Incorrect API key provided: ${USER_KEY}`), { status: 401, headers: { authorization: `Bearer ${USER_KEY}` } }))
    const logged: string[] = []
    const capture = (...args: unknown[]) => logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${JSON.stringify(a)}` : String(a))).join(' '))
    consoleSpies.push(
      vi.spyOn(console, 'error').mockImplementation(capture),
      vi.spyOn(console, 'warn').mockImplementation(capture),
      vi.spyOn(console, 'log').mockImplementation(capture)
    )

    const { getLLM } = await load()
    const err = (await getLLM()!.client.chat.completions.create({ messages: [] }).catch((e: unknown) => e)) as Error & { status?: number }
    expect(err.message).not.toContain(USER_KEY)
    expect(err.status).toBe(401)
    expect(JSON.stringify(err)).not.toContain(USER_KEY)

    const { generateWithGroq } = await import('./groq')
    await generateWithGroq('prompt')
    expect(logged.length).toBeGreaterThan(0)
    expect(logged.join('\n')).not.toContain(USER_KEY)
  })

  it('a streamed [Error: …] chunk does not contain the key', async () => {
    headersMock.mockReturnValue(requestHeaders({ 'x-atlas-llm-provider': 'groq', 'x-atlas-llm-key': USER_KEY }))
    openaiCreate.mockRejectedValue(new Error(`invalid api key ${USER_KEY}`))
    await load()
    const { streamGroqChat } = await import('./groq')
    const stream = await streamGroqChat([{ role: 'user', content: 'hi' }], 'sys')
    const text = await new Response(stream!).text()
    expect(text).toContain('[Error:')
    expect(text).not.toContain(USER_KEY)
  })

  it('/api/llm/test reports the provider error with the key scrubbed', async () => {
    openaiCreate.mockRejectedValue(Object.assign(new Error(`Incorrect API key provided: ${USER_KEY}`), { status: 401 }))
    vi.resetModules()
    const { POST } = await import('@/app/api/llm/test/route')
    const res = await POST(
      new Request('http://localhost/api/llm/test', {
        method: 'POST',
        body: JSON.stringify({ provider: 'openai', model: 'gpt-4o', apiKey: USER_KEY }),
      }) as never
    )
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.status).toBe(401)
    expect(JSON.stringify(body)).not.toContain(USER_KEY)
  })

  it('/api/llm/test reports success', async () => {
    openaiCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] })
    vi.resetModules()
    const { POST } = await import('@/app/api/llm/test/route')
    const res = await POST(
      new Request('http://localhost/api/llm/test', {
        method: 'POST',
        body: JSON.stringify({ provider: 'deepseek', apiKey: USER_KEY }),
      }) as never
    )
    expect(await res.json()).toEqual({ ok: true, provider: 'deepseek', model: 'deepseek-chat', reply: 'ok' })
    expect(openaiCtor).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'https://api.deepseek.com/v1' }))
  })
})
