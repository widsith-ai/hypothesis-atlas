import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveEdition, sameSiteCallbackPath, shouldOfferUserKeys } from './edition'

describe('resolveEdition', () => {
  it('honours an explicit ATLAS_EDITION', () => {
    expect(resolveEdition({ ATLAS_EDITION: 'hosted' })).toBe('hosted')
    expect(resolveEdition({ ATLAS_EDITION: ' Self-Hosted ', REQUIRE_AUTH: 'true' })).toBe('self-hosted')
  })

  it('falls back to REQUIRE_AUTH, the existing hosted-deployment flag', () => {
    expect(resolveEdition({ REQUIRE_AUTH: 'true' })).toBe('hosted')
    expect(resolveEdition({ ATLAS_EDITION: 'nonsense', REQUIRE_AUTH: 'true' })).toBe('hosted')
  })

  it('defaults to self-hosted (the open-source edition needs no configuration)', () => {
    expect(resolveEdition({})).toBe('self-hosted')
    expect(resolveEdition({ REQUIRE_AUTH: 'false' })).toBe('self-hosted')
  })
})

describe('shouldOfferUserKeys', () => {
  it('hosted: always offer, with or without a server key', () => {
    expect(shouldOfferUserKeys('hosted', true)).toBe(true)
    expect(shouldOfferUserKeys('hosted', false)).toBe(true)
  })

  it('self-hosted: only when the backend has no model key of its own', () => {
    expect(shouldOfferUserKeys('self-hosted', true)).toBe(false)
    expect(shouldOfferUserKeys('self-hosted', false)).toBe(true)
  })
})

describe('GET /api/llm', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reports edition and offerUserKeys, never key values', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_secret_value_123')
    vi.stubEnv('ATLAS_EDITION', 'self-hosted')
    vi.resetModules()
    const { GET } = await import('@/app/api/llm/route')
    const body = await (await GET()).json()
    expect(body).toEqual({
      serverModel: { provider: 'groq', model: 'openai/gpt-oss-120b' },
      edition: 'self-hosted',
      offerUserKeys: false,
    })
    expect(JSON.stringify(body)).not.toContain('gsk_secret_value_123')
  })

  it('hosted deployment offers user keys', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_x')
    vi.stubEnv('ATLAS_EDITION', '')
    vi.stubEnv('REQUIRE_AUTH', 'true')
    vi.resetModules()
    const { GET } = await import('@/app/api/llm/route')
    expect(await (await GET()).json()).toMatchObject({ edition: 'hosted', offerUserKeys: true })
  })
})

describe('sameSiteCallbackPath (#96)', () => {
  const app = 'https://atlas.example'
  it('keeps relative paths and absolute URLs on our own origin', () => {
    expect(sameSiteCallbackPath('/job/123?tab=notes', app)).toBe('/job/123?tab=notes')
    expect(sameSiteCallbackPath('https://atlas.example/jobs', app)).toBe('/jobs')
    expect(sameSiteCallbackPath(['/workspace', '/x'], app)).toBe('/workspace')
  })

  it('never redirects off-site', () => {
    expect(sameSiteCallbackPath('https://evil.example/jobs', app)).toBeNull()
    expect(sameSiteCallbackPath('//evil.example/jobs', app)).toBeNull()
    expect(sameSiteCallbackPath('javascript:alert(1)', app)).toBeNull()
    expect(sameSiteCallbackPath('https://atlas.example/jobs', undefined)).toBeNull()
  })

  it('ignores empty values and the home page itself', () => {
    expect(sameSiteCallbackPath(undefined, app)).toBeNull()
    expect(sameSiteCallbackPath('', app)).toBeNull()
    expect(sameSiteCallbackPath('/', app)).toBeNull()
  })
})
