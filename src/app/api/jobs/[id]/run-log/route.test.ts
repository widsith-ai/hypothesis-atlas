import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, getServerSessionMock, getRunLogMock } = vi.hoisted(() => ({
  prismaMock: {
    job: { findUnique: vi.fn() },
    node: { findMany: vi.fn() },
    graphEntity: { findMany: vi.fn() },
  },
  getServerSessionMock: vi.fn(),
  getRunLogMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/runLog', () => ({ getRunLog: getRunLogMock }))

import { GET } from './route'

const req = () => new NextRequest('http://localhost/api/jobs/job-1/run-log')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
  prismaMock.node.findMany.mockResolvedValue([])
  prismaMock.graphEntity.findMany.mockResolvedValue([])
})

describe('GET /api/jobs/[id]/run-log', () => {
  it('returns 404 for a missing job', async () => {
    prismaMock.job.findUnique.mockResolvedValue(null)
    const res = await GET(req(), { params: { id: 'job-1' } })
    expect(res.status).toBe(404)
  })

  it("refuses to show another account's job", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-2' } })
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', userId: 'user-1' })
    const res = await GET(req(), { params: { id: 'job-1' } })
    expect(res.status).toBe(403)
  })

  it('returns the run log for an unowned job to anyone', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', userId: null })
    getRunLogMock.mockResolvedValue([{ id: 'log-1', step: 'expand_query', recordIds: [] }])
    const res = await GET(req(), { params: { id: 'job-1' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.steps).toHaveLength(1)
  })

  it('marks a step humanEdited when one of its produced nodes became a user-edited graph entity', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', userId: null })
    getRunLogMock.mockResolvedValue([
      { id: 'log-1', step: 'build_root_node', recordIds: ['node-1'] },
      { id: 'log-2', step: 'build_child_node', recordIds: ['node-2'] },
    ])
    prismaMock.node.findMany.mockResolvedValue([
      { id: 'node-1', label: 'Topic A' },
      { id: 'node-2', label: 'Topic B' },
    ])
    prismaMock.graphEntity.findMany.mockResolvedValue([{ label: 'Topic A' }])

    const res = await GET(req(), { params: { id: 'job-1' } })
    const body = await res.json()
    expect(body.steps.find((s: { id: string }) => s.id === 'log-1').humanEdited).toBe(true)
    expect(body.steps.find((s: { id: string }) => s.id === 'log-2').humanEdited).toBe(false)
    expect(body.humanEditedCount).toBe(1)
  })

  it('returns 500 on a database error', async () => {
    prismaMock.job.findUnique.mockRejectedValue(new Error('db down'))
    const res = await GET(req(), { params: { id: 'job-1' } })
    expect(res.status).toBe(500)
  })
})
