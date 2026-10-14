import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, getServerSessionMock, syncJobGraphMock } = vi.hoisted(() => ({
  prismaMock: {
    job: { findMany: vi.fn() },
    progressEvent: { findMany: vi.fn() },
    graphEntity: { findMany: vi.fn() },
    graphEdge: { findMany: vi.fn() },
  },
  getServerSessionMock: vi.fn(),
  syncJobGraphMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/research-graph', () => ({ syncJobGraph: syncJobGraphMock }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
  prismaMock.job.findMany.mockResolvedValue([])
  prismaMock.progressEvent.findMany.mockResolvedValue([])
  prismaMock.graphEntity.findMany.mockResolvedValue([])
  prismaMock.graphEdge.findMany.mockResolvedValue([])
})

describe('GET /api/graph', () => {
  it('only backfills the viewer\'s own completed jobs (null userId when anonymous)', async () => {
    await GET()
    expect(prismaMock.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'completed', userId: null } })
    )
  })

  it('backfills the signed-in viewer\'s own jobs only', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    await GET()
    expect(prismaMock.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'completed', userId: 'user-1' } })
    )
  })

  it('scopes the entity fetch to the viewer\'s visibility — own workspace plus public only when anonymous', async () => {
    await GET()
    expect(prismaMock.graphEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ workspaceId: 'default' }, { visibility: 'public' }] } })
    )
  })

  it('scopes the entity fetch to include shared items when signed in', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    await GET()
    expect(prismaMock.graphEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ workspaceId: 'user-1' }, { visibility: 'public' }, { visibility: 'shared' }] },
      })
    )
  })

  it('only fetches edges between entities that survived the visibility filter', async () => {
    prismaMock.graphEntity.findMany.mockResolvedValue([{ id: 'e1', entitySources: [] }, { id: 'e2', entitySources: [] }])
    await GET()
    expect(prismaMock.graphEdge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fromId: { in: ['e1', 'e2'] }, toId: { in: ['e1', 'e2'] } } })
    )
  })

  it('returns 500 on a database error', async () => {
    prismaMock.graphEntity.findMany.mockRejectedValue(new Error('db down'))
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
