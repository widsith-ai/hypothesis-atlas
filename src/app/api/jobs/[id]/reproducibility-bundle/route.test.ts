import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, getServerSessionMock, getRunLogMock } = vi.hoisted(() => ({
  prismaMock: {
    job: { findUnique: vi.fn() },
    source: { findMany: vi.fn() },
    node: { findMany: vi.fn() },
  },
  getServerSessionMock: vi.fn(),
  getRunLogMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/runLog', () => ({ getRunLog: getRunLogMock }))

import { GET } from './route'

const req = () => new NextRequest('http://localhost/api/jobs/job-1/reproducibility-bundle')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
  prismaMock.source.findMany.mockResolvedValue([])
  prismaMock.node.findMany.mockResolvedValue([])
  getRunLogMock.mockResolvedValue([])
})

describe('GET /api/jobs/[id]/reproducibility-bundle', () => {
  it('returns 404 for a missing job', async () => {
    prismaMock.job.findUnique.mockResolvedValue(null)
    const res = await GET(req(), { params: { id: 'job-1' } })
    expect(res.status).toBe(404)
  })

  it("refuses to export another account's job", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-2' } })
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', userId: 'user-1', topicQuery: 'x', status: 'completed', createdAt: new Date() })
    const res = await GET(req(), { params: { id: 'job-1' } })
    expect(res.status).toBe(403)
  })

  it('includes run log, model calls with seeds, and dataset versions', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', userId: null, topicQuery: 'AI safety', status: 'completed', createdAt: new Date() })
    getRunLogMock.mockResolvedValue([
      { id: 'log-1', jobId: 'job-1', step: 'expand_query', prompt: 'p', model: 'openai/gpt-oss-120b', seed: 42, toolsCalled: [], output: null, recordIds: [], createdAt: new Date() },
      { id: 'log-2', jobId: 'job-1', step: 'fetch_sources', prompt: null, model: null, seed: null, toolsCalled: ['openalex.search'], output: null, recordIds: ['s1'], createdAt: new Date() },
    ])
    prismaMock.source.findMany.mockResolvedValue([
      { id: 's1', type: 'paper', title: 'A Paper', externalId: 'W123', url: 'https://x', publishedAt: new Date(), createdAt: new Date(), runLogId: 'log-2' },
    ])
    prismaMock.node.findMany.mockResolvedValue([{ id: 'n1', label: 'Root', parentId: null, depth: 0, runLogId: null }])

    const res = await GET(req(), { params: { id: 'job-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.runLog).toHaveLength(2)
    expect(body.modelCalls).toEqual([{ step: 'expand_query', model: 'openai/gpt-oss-120b', seed: 42, prompt: 'p' }])
    expect(body.datasetVersions[0]).toMatchObject({ id: 's1', externalId: 'W123', runLogId: 'log-2' })
  })

  it('returns 500 on a database error', async () => {
    prismaMock.job.findUnique.mockRejectedValue(new Error('db down'))
    const res = await GET(req(), { params: { id: 'job-1' } })
    expect(res.status).toBe(500)
  })
})
