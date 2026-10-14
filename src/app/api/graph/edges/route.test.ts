import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, getServerSessionMock } = vi.hoisted(() => ({
  prismaMock: {
    graphEntity: { findUnique: vi.fn() },
    graphEdge: { create: vi.fn() },
  },
  getServerSessionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { POST } from './route'

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/graph/edges', {
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

describe('POST /api/graph/edges', () => {
  it('creates an edge between two existing entities in the same (default) workspace', async () => {
    prismaMock.graphEntity.findUnique
      .mockResolvedValueOnce({ id: 'from-1', workspaceId: 'default' })
      .mockResolvedValueOnce({ id: 'to-1', workspaceId: 'default' })
    prismaMock.graphEdge.create.mockResolvedValue({ id: 'edge-1', fromId: 'from-1', toId: 'to-1', type: 'motivates' })

    const res = await POST(postRequest({ fromId: 'from-1', toId: 'to-1', type: 'motivates' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.edge.id).toBe('edge-1')
    expect(prismaMock.graphEdge.create).toHaveBeenCalledWith({
      data: { fromId: 'from-1', toId: 'to-1', type: 'motivates', jobId: null, origin: 'user', workspaceId: 'default' },
    })
  })

  it('rejects an invalid edge type', async () => {
    const res = await POST(postRequest({ fromId: 'a', toId: 'b', type: 'bogus' }))
    expect(res.status).toBe(400)
  })

  it('rejects identical fromId and toId', async () => {
    const res = await POST(postRequest({ fromId: 'same', toId: 'same', type: 'motivates' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when an endpoint entity is missing', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'to-1', workspaceId: 'default' })
    const res = await POST(postRequest({ fromId: 'from-1', toId: 'to-1', type: 'motivates' }))
    expect(res.status).toBe(404)
  })

  it('refuses to connect an entity that belongs to a different workspace', async () => {
    prismaMock.graphEntity.findUnique
      .mockResolvedValueOnce({ id: 'from-1', workspaceId: 'default' })
      .mockResolvedValueOnce({ id: 'to-1', workspaceId: 'someone-else' })
    const res = await POST(postRequest({ fromId: 'from-1', toId: 'to-1', type: 'motivates' }))
    expect(res.status).toBe(403)
    expect(prismaMock.graphEdge.create).not.toHaveBeenCalled()
  })

  it('returns 409 when the edge already exists', async () => {
    prismaMock.graphEntity.findUnique
      .mockResolvedValueOnce({ id: 'from-1', workspaceId: 'default' })
      .mockResolvedValueOnce({ id: 'to-1', workspaceId: 'default' })
    prismaMock.graphEdge.create.mockRejectedValue({ code: 'P2002' })
    const res = await POST(postRequest({ fromId: 'from-1', toId: 'to-1', type: 'motivates' }))
    expect(res.status).toBe(409)
  })

  it('returns 500 for unexpected errors', async () => {
    prismaMock.graphEntity.findUnique
      .mockResolvedValueOnce({ id: 'from-1', workspaceId: 'default' })
      .mockResolvedValueOnce({ id: 'to-1', workspaceId: 'default' })
    prismaMock.graphEdge.create.mockRejectedValue(new Error('db down'))
    const res = await POST(postRequest({ fromId: 'from-1', toId: 'to-1', type: 'motivates' }))
    expect(res.status).toBe(500)
  })
})
