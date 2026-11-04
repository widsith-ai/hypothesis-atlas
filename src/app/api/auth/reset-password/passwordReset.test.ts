import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// In-memory stand-in for the two Prisma tables the flow touches.
const { db, prismaMock, sendMock } = vi.hoisted(() => {
  const db = {
    tokens: [] as { identifier: string; token: string; expires: Date }[],
    users: [] as { email: string; passwordHash: string | null }[],
  }
  const prismaMock = {
    verificationToken: {
      findFirst: vi.fn(async ({ where }: { where: { identifier: string } }) =>
        db.tokens.filter((t) => t.identifier === where.identifier).sort((a, b) => +b.expires - +a.expires)[0] ?? null
      ),
      findUnique: vi.fn(async ({ where }: { where: { token: string } }) => db.tokens.find((t) => t.token === where.token) ?? null),
      deleteMany: vi.fn(async ({ where }: { where: { identifier: string } }) => {
        const before = db.tokens.length
        db.tokens = db.tokens.filter((t) => t.identifier !== where.identifier)
        return { count: before - db.tokens.length }
      }),
      create: vi.fn(async ({ data }: { data: { identifier: string; token: string; expires: Date } }) => {
        db.tokens.push(data)
        return data
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => db.users.find((u) => u.email === where.email) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { email: string }; data: { passwordHash: string } }) => {
        const matches = db.users.filter((u) => u.email === where.email)
        matches.forEach((u) => (u.passwordHash = data.passwordHash))
        return { count: matches.length }
      }),
    },
  }
  return { db, prismaMock, sendMock: vi.fn() }
})
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })) }))

import bcrypt from 'bcryptjs'
import { POST as forgot } from '../forgot-password/route'
import { POST as reset } from './route'
import { FORGOT_PASSWORD_MESSAGE, RESET_REQUEST_COOLDOWN_MS, RESET_TOKEN_TTL_MS, consumePasswordResetToken, createPasswordResetToken } from '@/lib/passwordReset'

const post = (path: string, body: unknown, host = 'localhost:3000') =>
  new NextRequest(`http://${host}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

const sentLink = (): string => {
  const html = sendMock.mock.calls.at(-1)?.[0]?.html as string
  return html.match(/href="([^"]+reset-password\?token=[0-9a-f]+)"/)![1]
}
const tokenFrom = (link: string) => new URL(link).searchParams.get('token')!

const ENV = { ...process.env }
beforeEach(() => {
  vi.clearAllMocks()
  db.tokens = []
  db.users = [
    { email: 'ada@example.com', passwordHash: 'old-hash' },
    { email: 'oauth@example.com', passwordHash: null },
  ]
  process.env.RESEND_API_KEY = 're_test'
  process.env.NEXT_PUBLIC_APP_URL = 'https://atlas.example'
  sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  process.env = { ...ENV }
})

describe('POST /api/auth/forgot-password', () => {
  it('emails a one-time link for an account with a password, storing only a hash of the token', async () => {
    const res = await forgot(post('/api/auth/forgot-password', { email: ' Ada@Example.com ' }))
    expect(await res.json()).toEqual({ ok: true, message: FORGOT_PASSWORD_MESSAGE })
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@example.com' }))

    const link = sentLink()
    expect(link.startsWith('https://atlas.example/reset-password?token=')).toBe(true)
    expect(db.tokens).toHaveLength(1)
    expect(db.tokens[0].identifier).toBe('password-reset:ada@example.com')
    expect(db.tokens[0].token).not.toBe(tokenFrom(link))
  })

  it('answers identically for unknown and OAuth-only emails, and sends nothing', async () => {
    for (const email of ['nobody@example.com', 'oauth@example.com']) {
      const res = await forgot(post('/api/auth/forgot-password', { email }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, message: FORGOT_PASSWORD_MESSAGE })
    }
    expect(sendMock).not.toHaveBeenCalled()
    expect(db.tokens).toHaveLength(0)
  })

  it('rejects an invalid email', async () => {
    const res = await forgot(post('/api/auth/forgot-password', { email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('never builds the link from the request Host header', async () => {
    await forgot(post('/api/auth/forgot-password', { email: 'ada@example.com' }, 'evil.example'))
    expect(new URL(sentLink()).host).toBe('atlas.example')
  })

  it('in production with no app URL configured, sends no link rather than trusting the Host header', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXTAUTH_URL
    vi.stubEnv('NODE_ENV', 'production')
    const res = await forgot(post('/api/auth/forgot-password', { email: 'ada@example.com' }, 'evil.example'))
    vi.unstubAllEnvs()
    expect(res.status).toBe(200)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('without RESEND_API_KEY in dev, logs the link instead of emailing it', async () => {
    delete process.env.RESEND_API_KEY
    await forgot(post('/api/auth/forgot-password', { email: 'ada@example.com' }))
    expect(sendMock).not.toHaveBeenCalled()
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('https://atlas.example/reset-password?token='))
  })

  it('returns 503 when the database is unreachable', async () => {
    prismaMock.user.findUnique.mockRejectedValueOnce(new Error("Can't reach database server"))
    const res = await forgot(post('/api/auth/forgot-password', { email: 'ada@example.com' }))
    expect(res.status).toBe(503)
  })
})

describe('POST /api/auth/reset-password', () => {
  async function issueLinkToken() {
    await forgot(post('/api/auth/forgot-password', { email: 'ada@example.com' }))
    return tokenFrom(sentLink())
  }

  it('sets the new password and the token works only once', async () => {
    const token = await issueLinkToken()
    const res = await reset(post('/api/auth/reset-password', { token, password: 'brand-new-pass' }))
    expect(await res.json()).toEqual({ ok: true, email: 'ada@example.com' })
    expect(await bcrypt.compare('brand-new-pass', db.users[0].passwordHash!)).toBe(true)

    const again = await reset(post('/api/auth/reset-password', { token, password: 'another-pass-1' }))
    expect(again.status).toBe(400)
  })

  it('rejects a short password without consuming the token', async () => {
    const token = await issueLinkToken()
    const res = await reset(post('/api/auth/reset-password', { token, password: 'short' }))
    expect(res.status).toBe(400)
    expect(db.tokens).toHaveLength(1)
  })

  it('rejects an unknown or malformed token', async () => {
    expect((await reset(post('/api/auth/reset-password', { token: 'f'.repeat(64), password: 'long-enough' }))).status).toBe(400)
    expect((await reset(post('/api/auth/reset-password', { token: '../etc', password: 'long-enough' }))).status).toBe(400)
    expect(db.users[0].passwordHash).toBe('old-hash')
  })
})

describe('token lifecycle', () => {
  it('expires after the TTL', async () => {
    const now = Date.now()
    const issued = await createPasswordResetToken('ada@example.com', now)
    if (!issued.ok) throw new Error('expected a token')
    expect(await consumePasswordResetToken(issued.token, now + RESET_TOKEN_TTL_MS + 1)).toBeNull()
    expect(db.tokens).toHaveLength(0)
  })

  it('a new request replaces the old token, and requests inside the cooldown are ignored', async () => {
    const now = Date.now()
    const first = await createPasswordResetToken('ada@example.com', now)
    expect(await createPasswordResetToken('ada@example.com', now + 1000)).toEqual({ ok: false, reason: 'cooldown' })
    const second = await createPasswordResetToken('ada@example.com', now + RESET_REQUEST_COOLDOWN_MS + 1)
    if (!first.ok || !second.ok) throw new Error('expected tokens')
    expect(db.tokens).toHaveLength(1)
    expect(await consumePasswordResetToken(first.token, now + RESET_REQUEST_COOLDOWN_MS + 2)).toBeNull()
    expect(await consumePasswordResetToken(second.token, now + RESET_REQUEST_COOLDOWN_MS + 2)).toBe('ada@example.com')
  })
})
