import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, getServerSessionMock, syncJobGraphMock, syncAllJobsMock } = vi.hoisted(() => ({
  prismaMock: { job: { findUnique: vi.fn() } },
  getServerSessionMock: vi.fn(),
  syncJobGraphMock: vi.fn(),
  syncAllJobsMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/research-graph', () => ({ syncJobGraph: syncJobGraphMock, syncAllJobs: syncAllJobsMock }))

import { POST } from './route'

const req = (body?: unknown) =>
  new NextRequest('http://localhost/api/graph/sync', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
})

describe('POST /api/graph/sync', () => {
  it('with no jobId, syncs only the viewer\'s own jobs (null userId when anonymous)', async () => {
    syncAllJobsMock.mockResolvedValue({ jobs: 0, entities: 0, edges: 0 })
    await POST(req())
    expect(syncAllJobsMock).toHaveBeenCalledWith({ userId: null })
  })

  it('with no jobId, scopes to the signed-in viewer\'s own jobs', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    syncAllJobsMock.mockResolvedValue({ jobs: 0, entities: 0, edges: 0 })
    await POST(req())
    expect(syncAllJobsMock).toHaveBeenCalledWith({ userId: 'user-1' })
  })

  it('returns 404 for a jobId that does not exist', async () => {
    prismaMock.job.findUnique.mockResolvedValue(null)
    const res = await POST(req({ jobId: 'missing' }))
    expect(res.status).toBe(404)
    expect(syncJobGraphMock).not.toHaveBeenCalled()
  })

  it('syncs a specific job the viewer owns', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    prismaMock.job.findUnique.mockResolvedValue({ userId: 'user-1' })
    syncJobGraphMock.mockResolvedValue({ entities: 1, edges: 0 })
    const res = await POST(req({ jobId: 'job-1' }))
    expect(res.status).toBe(200)
    expect(syncJobGraphMock).toHaveBeenCalledWith('job-1')
  })

  it('refuses to sync a job owned by someone else', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-2' } })
    prismaMock.job.findUnique.mockResolvedValue({ userId: 'user-1' })
    const res = await POST(req({ jobId: 'job-1' }))
    expect(res.status).toBe(403)
    expect(syncJobGraphMock).not.toHaveBeenCalled()
  })

  it('an anonymous viewer can sync an unowned job', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ userId: null })
    syncJobGraphMock.mockResolvedValue({ entities: 1, edges: 0 })
    const res = await POST(req({ jobId: 'job-1' }))
    expect(res.status).toBe(200)
  })
})
