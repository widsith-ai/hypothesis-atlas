import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, getServerSessionMock } = vi.hoisted(() => ({
  prismaMock: {
    graphEntity: { create: vi.fn(), findUnique: vi.fn() },
    graphEdge: { create: vi.fn() },
  },
  getServerSessionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { POST } from './route'

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/graph/entities', {
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

describe('POST /api/graph/entities', () => {
  it('creates a user entity in the shared default workspace when anonymous', async () => {
    prismaMock.graphEntity.create.mockResolvedValue({ id: 'e1', type: 'note', label: 'My note' })
    const res = await POST(postRequest({ type: 'note', label: 'My note' }))
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.entity).toEqual({ id: 'e1', type: 'note', label: 'My note' })
    expect(prismaMock.graphEntity.create).toHaveBeenCalledWith({
      data: { type: 'note', label: 'My note', content: null, jobId: null, origin: 'user', workspaceId: 'default' },
    })
  })

  it('creates a user entity in the signed-in user\'s own workspace', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    prismaMock.graphEntity.create.mockResolvedValue({ id: 'e1', type: 'note', label: 'My note' })
    await POST(postRequest({ type: 'note', label: 'My note' }))
    expect(prismaMock.graphEntity.create).toHaveBeenCalledWith({
      data: { type: 'note', label: 'My note', content: null, jobId: null, origin: 'user', workspaceId: 'user-1' },
    })
  })

  it('rejects an invalid entity type', async () => {
    const res = await POST(postRequest({ type: 'not-a-type', label: 'x' }))
    expect(res.status).toBe(400)
    expect(prismaMock.graphEntity.create).not.toHaveBeenCalled()
  })

  it('rejects a missing/blank label', async () => {
    const res = await POST(postRequest({ type: 'note', label: '   ' }))
    expect(res.status).toBe(400)
  })

  it('links the new entity to a target in the same workspace when connectTo/edgeType are valid', async () => {
    prismaMock.graphEntity.create.mockResolvedValue({ id: 'e1', type: 'note', label: 'New' })
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'target-1', workspaceId: 'default' })
    prismaMock.graphEdge.create.mockResolvedValue({})

    const res = await POST(postRequest({ type: 'note', label: 'New', connectTo: 'target-1', edgeType: 'related_to' }))

    expect(res.status).toBe(201)
    expect(prismaMock.graphEdge.create).toHaveBeenCalledWith({
      data: { fromId: 'e1', toId: 'target-1', type: 'related_to', origin: 'user', workspaceId: 'default' },
    })
  })

  it('does not connect to a target in a different workspace', async () => {
    prismaMock.graphEntity.create.mockResolvedValue({ id: 'e1', type: 'note', label: 'New' })
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'target-1', workspaceId: 'someone-else' })

    const res = await POST(postRequest({ type: 'note', label: 'New', connectTo: 'target-1', edgeType: 'related_to' }))

    expect(res.status).toBe(201) // the entity itself is still created
    expect(prismaMock.graphEdge.create).not.toHaveBeenCalled()
  })

  it('silently ignores a duplicate-edge conflict (P2002)', async () => {
    prismaMock.graphEntity.create.mockResolvedValue({ id: 'e1', type: 'note', label: 'New' })
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'target-1', workspaceId: 'default' })
    prismaMock.graphEdge.create.mockRejectedValue({ code: 'P2002' })

    const res = await POST(postRequest({ type: 'note', label: 'New', connectTo: 'target-1', edgeType: 'related_to' }))
    expect(res.status).toBe(201)
  })

  it('returns 500 when entity creation fails unexpectedly', async () => {
    prismaMock.graphEntity.create.mockRejectedValue(new Error('db down'))
    const res = await POST(postRequest({ type: 'note', label: 'New' }))
    expect(res.status).toBe(500)
  })
})
