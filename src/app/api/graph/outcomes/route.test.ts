import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, getServerSessionMock } = vi.hoisted(() => ({
  prismaMock: {
    graphEntity: { findUnique: vi.fn(), create: vi.fn() },
    graphEdge: { create: vi.fn() },
  },
  getServerSessionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { POST } from './route'

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/graph/outcomes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
})

describe('POST /api/graph/outcomes', () => {
  it('rejects an invalid result', async () => {
    const res = await POST(postRequest({ hypothesisId: 'h1', result: 'bogus' }))
    expect(res.status).toBe(400)
    expect(prismaMock.graphEntity.create).not.toHaveBeenCalled()
  })

  it('rejects a missing hypothesisId', async () => {
    const res = await POST(postRequest({ result: 'refuted' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the hypothesis does not exist', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue(null)
    const res = await POST(postRequest({ hypothesisId: 'h1', result: 'refuted' }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the target entity is not actually a hypothesis', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'h1', type: 'note', workspaceId: 'default' })
    const res = await POST(postRequest({ hypothesisId: 'h1', result: 'refuted' }))
    expect(res.status).toBe(404)
  })

  it('refuses to record an outcome against a hypothesis in a different workspace', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'h1', type: 'hypothesis', workspaceId: 'someone-else', label: 'H' })
    const res = await POST(postRequest({ hypothesisId: 'h1', result: 'refuted' }))
    expect(res.status).toBe(403)
    expect(prismaMock.graphEntity.create).not.toHaveBeenCalled()
  })

  it('creates a private outcome entity and a tests edge to the hypothesis', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'h1', type: 'hypothesis', workspaceId: 'default', label: 'H' })
    prismaMock.graphEntity.create.mockResolvedValue({ id: 'o1', type: 'outcome', visibility: 'private' })
    prismaMock.graphEdge.create.mockResolvedValue({ id: 'edge-1', type: 'tests' })

    const res = await POST(postRequest({ hypothesisId: 'h1', result: 'refuted', failureMode: 'underpowered', effect: 'none', conditions: 'n=5' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.outcome.id).toBe('o1')
    expect(body.edge.id).toBe('edge-1')
    expect(prismaMock.graphEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'outcome', workspaceId: 'default', visibility: 'private', origin: 'user' }),
      })
    )
    expect(prismaMock.graphEdge.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromId: 'o1', toId: 'h1', type: 'tests' }) })
    )
  })

  it('returns 500 on unexpected failure', async () => {
    prismaMock.graphEntity.findUnique.mockRejectedValue(new Error('db down'))
    const res = await POST(postRequest({ hypothesisId: 'h1', result: 'refuted' }))
    expect(res.status).toBe(500)
  })
})
