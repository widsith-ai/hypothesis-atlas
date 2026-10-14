import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, getServerSessionMock } = vi.hoisted(() => ({
  prismaMock: { graphEdge: { findUnique: vi.fn(), delete: vi.fn() } },
  getServerSessionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { DELETE } from './route'

const req = () => new NextRequest('http://localhost/api/graph/edges/edge-1', { method: 'DELETE' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
})

describe('DELETE /api/graph/edges/[id]', () => {
  it('returns 404 for a missing edge', async () => {
    prismaMock.graphEdge.findUnique.mockResolvedValue(null)
    const res = await DELETE(req(), { params: { id: 'edge-1' } })
    expect(res.status).toBe(404)
  })

  it('deletes an edge in the viewer\'s own workspace', async () => {
    prismaMock.graphEdge.findUnique.mockResolvedValue({ id: 'edge-1', workspaceId: 'default' })
    prismaMock.graphEdge.delete.mockResolvedValue({})
    const res = await DELETE(req(), { params: { id: 'edge-1' } })
    expect(res.status).toBe(200)
  })

  it('refuses to delete an edge in a different workspace', async () => {
    prismaMock.graphEdge.findUnique.mockResolvedValue({ id: 'edge-1', workspaceId: 'someone-else' })
    const res = await DELETE(req(), { params: { id: 'edge-1' } })
    expect(res.status).toBe(403)
    expect(prismaMock.graphEdge.delete).not.toHaveBeenCalled()
  })
})
