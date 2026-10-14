import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getServerSessionMock, dedupeGraphMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  dedupeGraphMock: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/research-graph', () => ({ dedupeGraph: dedupeGraphMock }))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
})

describe('POST /api/graph/dedupe', () => {
  it('scopes the dedupe pass to the shared default workspace when anonymous', async () => {
    dedupeGraphMock.mockResolvedValue({ normalized: 0, groups: 0, merged: 0 })
    await POST()
    expect(dedupeGraphMock).toHaveBeenCalledWith('default')
  })

  it('scopes the dedupe pass to the signed-in viewer\'s own workspace', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    dedupeGraphMock.mockResolvedValue({ normalized: 0, groups: 0, merged: 0 })
    await POST()
    expect(dedupeGraphMock).toHaveBeenCalledWith('user-1')
  })

  it('returns 500 on failure', async () => {
    dedupeGraphMock.mockRejectedValue(new Error('db down'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
