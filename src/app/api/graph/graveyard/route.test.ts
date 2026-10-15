import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { serializeOutcomeMetadata } from '@/lib/outcomes'

const { prismaMock, getServerSessionMock } = vi.hoisted(() => ({
  prismaMock: {
    graphEntity: { findMany: vi.fn() },
    graphEdge: { findMany: vi.fn() },
  },
  getServerSessionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET } from './route'

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/graph/graveyard${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
})

describe('GET /api/graph/graveyard', () => {
  it('returns only refuted/abandoned hypotheses, not proposed/grounded/supported ones', async () => {
    const entities = [
      { id: 'h1', type: 'hypothesis', label: 'Refuted H', workspaceId: 'default', visibility: 'private', metadataJson: null, abandonedReason: null, content: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'h2', type: 'hypothesis', label: 'Proposed H', workspaceId: 'default', visibility: 'private', metadataJson: null, abandonedReason: null, content: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'o1', type: 'outcome', label: 'Outcome', workspaceId: 'default', visibility: 'private', metadataJson: serializeOutcomeMetadata({ result: 'refuted', failureMode: null, effect: null, conditions: null }), abandonedReason: null, content: null, createdAt: new Date(), updatedAt: new Date() },
    ]
    const edges = [{ id: 'edge-1', fromId: 'o1', toId: 'h1', type: 'tests' }]
    prismaMock.graphEntity.findMany.mockResolvedValue(entities)
    prismaMock.graphEdge.findMany.mockResolvedValue(edges)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.hypotheses).toHaveLength(1)
    expect(body.hypotheses[0].id).toBe('h1')
    expect(body.hypotheses[0].status).toBe('refuted')
  })

  it('includes an abandoned hypothesis with its reason', async () => {
    const entities = [
      { id: 'h1', type: 'hypothesis', label: 'Abandoned H', workspaceId: 'default', visibility: 'private', metadataJson: null, abandonedReason: 'ran out of time', content: null, createdAt: new Date(), updatedAt: new Date() },
    ]
    prismaMock.graphEntity.findMany.mockResolvedValue(entities)
    prismaMock.graphEdge.findMany.mockResolvedValue([])

    const res = await GET(getRequest())
    const body = await res.json()
    expect(body.hypotheses[0].status).toBe('abandoned')
    expect(body.hypotheses[0].abandonedReason).toBe('ran out of time')
  })

  it('filters by method — only hypotheses linked to that method survive', async () => {
    const entities = [
      { id: 'm1', type: 'method', label: 'Method A', workspaceId: 'default', visibility: 'private', metadataJson: null, abandonedReason: null, content: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'm2', type: 'method', label: 'Method B', workspaceId: 'default', visibility: 'private', metadataJson: null, abandonedReason: null, content: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'h1', type: 'hypothesis', label: 'Via A', workspaceId: 'default', visibility: 'private', metadataJson: null, abandonedReason: 'x', content: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'h2', type: 'hypothesis', label: 'Via B', workspaceId: 'default', visibility: 'private', metadataJson: null, abandonedReason: 'y', content: null, createdAt: new Date(), updatedAt: new Date() },
    ]
    const edges = [
      { id: 'e1', fromId: 'h1', toId: 'm1', type: 'uses_method' },
      { id: 'e2', fromId: 'h2', toId: 'm2', type: 'uses_method' },
    ]
    prismaMock.graphEntity.findMany.mockResolvedValue(entities)
    prismaMock.graphEdge.findMany.mockResolvedValue(edges)

    const res = await GET(getRequest('?method=m1'))
    const body = await res.json()
    expect(body.hypotheses.map((h: { id: string }) => h.id)).toEqual(['h1'])
  })

  it('scopes to the viewer\'s visibility — a private hypothesis in another workspace is excluded', async () => {
    // graphVisibilityWhere is applied via the mocked prisma call's `where` —
    // this test checks the route actually passes a visibility-scoped where.
    prismaMock.graphEntity.findMany.mockResolvedValue([])
    prismaMock.graphEdge.findMany.mockResolvedValue([])
    await GET(getRequest())
    expect(prismaMock.graphEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ workspaceId: 'default' }, { visibility: 'public' }] } })
    )
  })

  it('returns 500 on a database error', async () => {
    prismaMock.graphEntity.findMany.mockRejectedValue(new Error('db down'))
    const res = await GET(getRequest())
    expect(res.status).toBe(500)
  })
})
