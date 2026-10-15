import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, getServerSessionMock } = vi.hoisted(() => ({
  prismaMock: { graphEntity: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } },
  getServerSessionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { PATCH, DELETE } from './route'

const patchReq = (body: unknown) =>
  new NextRequest('http://localhost/api/graph/entities/e1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
const deleteReq = () => new NextRequest('http://localhost/api/graph/entities/e1', { method: 'DELETE' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getServerSessionMock.mockResolvedValue(null)
})

describe('PATCH /api/graph/entities/[id]', () => {
  it('returns 404 for a missing entity', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue(null)
    const res = await PATCH(patchReq({ label: 'x' }), { params: { id: 'e1' } })
    expect(res.status).toBe(404)
  })

  it('edits an entity in the viewer\'s own (default) workspace', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'e1', workspaceId: 'default', type: 'note', label: 'Old', content: null, origin: 'system' })
    prismaMock.graphEntity.update.mockResolvedValue({ id: 'e1', label: 'New' })
    const res = await PATCH(patchReq({ label: 'New' }), { params: { id: 'e1' } })
    expect(res.status).toBe(200)
    expect(prismaMock.graphEntity.update).toHaveBeenCalled()
  })

  it('refuses to edit an entity in a different workspace', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'e1', workspaceId: 'someone-else', type: 'note', label: 'Old' })
    const res = await PATCH(patchReq({ label: 'New' }), { params: { id: 'e1' } })
    expect(res.status).toBe(403)
    expect(prismaMock.graphEntity.update).not.toHaveBeenCalled()
  })

  it('a signed-in viewer can edit their own workspace\'s entity', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'e1', workspaceId: 'user-1', type: 'note', label: 'Old' })
    prismaMock.graphEntity.update.mockResolvedValue({ id: 'e1', label: 'New' })
    const res = await PATCH(patchReq({ label: 'New' }), { params: { id: 'e1' } })
    expect(res.status).toBe(200)
  })

  it("#56/V3.0.3: one-click sharing — widens visibility via PATCH", async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'e1', workspaceId: 'default', type: 'outcome', label: 'Outcome', origin: 'user' })
    prismaMock.graphEntity.update.mockResolvedValue({ id: 'e1', visibility: 'shared' })
    const res = await PATCH(patchReq({ visibility: 'shared' }), { params: { id: 'e1' } })
    expect(res.status).toBe(200)
    expect(prismaMock.graphEntity.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { visibility: 'shared' } })
  })

  it('#56/V3.0.3: rejects an invalid visibility value', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'e1', workspaceId: 'default', type: 'outcome', label: 'Outcome', origin: 'user' })
    const res = await PATCH(patchReq({ visibility: 'bogus' }), { params: { id: 'e1' } })
    expect(res.status).toBe(400)
    expect(prismaMock.graphEntity.update).not.toHaveBeenCalled()
  })

  it('#56/V3.0.3: abandons a hypothesis with a reason', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'h1', workspaceId: 'default', type: 'hypothesis', label: 'H', origin: 'system' })
    prismaMock.graphEntity.update.mockResolvedValue({ id: 'h1', abandonedReason: 'team moved on' })
    const res = await PATCH(patchReq({ abandonedReason: 'team moved on' }), { params: { id: 'h1' } })
    expect(res.status).toBe(200)
    expect(prismaMock.graphEntity.update).toHaveBeenCalledWith({ where: { id: 'h1' }, data: { abandonedReason: 'team moved on' } })
  })

  it('#56/V3.0.3: rejects an empty abandon reason', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'h1', workspaceId: 'default', type: 'hypothesis', label: 'H', origin: 'system' })
    const res = await PATCH(patchReq({ abandonedReason: '   ' }), { params: { id: 'h1' } })
    expect(res.status).toBe(400)
  })

  it('#56/V3.0.3: clears an abandon reason by setting it to null', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'h1', workspaceId: 'default', type: 'hypothesis', label: 'H', origin: 'system' })
    prismaMock.graphEntity.update.mockResolvedValue({ id: 'h1', abandonedReason: null })
    const res = await PATCH(patchReq({ abandonedReason: null }), { params: { id: 'h1' } })
    expect(res.status).toBe(200)
    expect(prismaMock.graphEntity.update).toHaveBeenCalledWith({ where: { id: 'h1' }, data: { abandonedReason: null } })
  })
})

describe('DELETE /api/graph/entities/[id]', () => {
  it('returns 404 for a missing entity', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue(null)
    const res = await DELETE(deleteReq(), { params: { id: 'e1' } })
    expect(res.status).toBe(404)
  })

  it('deletes an entity in the viewer\'s own workspace', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'e1', workspaceId: 'default' })
    prismaMock.graphEntity.delete.mockResolvedValue({})
    const res = await DELETE(deleteReq(), { params: { id: 'e1' } })
    expect(res.status).toBe(200)
  })

  it('refuses to delete an entity in a different workspace', async () => {
    prismaMock.graphEntity.findUnique.mockResolvedValue({ id: 'e1', workspaceId: 'someone-else' })
    const res = await DELETE(deleteReq(), { params: { id: 'e1' } })
    expect(res.status).toBe(403)
    expect(prismaMock.graphEntity.delete).not.toHaveBeenCalled()
  })
})
