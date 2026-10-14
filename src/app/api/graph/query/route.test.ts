import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, generateWithGroqMock, getServerSessionMock } = vi.hoisted(() => ({
  prismaMock: {
    graphEntity: { findMany: vi.fn() },
    graphEdge: { findMany: vi.fn() },
    entitySource: { findMany: vi.fn() },
  },
  generateWithGroqMock: vi.fn(),
  getServerSessionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/groq', () => ({ generateWithGroq: generateWithGroqMock }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { POST } from './route'

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/graph/query', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  prismaMock.entitySource.findMany.mockResolvedValue([])
  getServerSessionMock.mockResolvedValue(null)
})

describe('POST /api/graph/query', () => {
  it('rejects an empty query', async () => {
    const res = await POST(postRequest({ query: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns a "no matches" message when nothing is found', async () => {
    prismaMock.graphEntity.findMany.mockResolvedValueOnce([])
    const res = await POST(postRequest({ query: 'nonexistent topic' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.answer).toBeNull()
    expect(body.message).toContain('No matching entities')
  })

  it('synthesizes an answer from matched entities via generateWithGroq', async () => {
    const matched = { id: 'e1', type: 'topic', label: 'Autonomous Vehicles', content: 'summary', jobId: 'job-1', origin: 'system' }
    prismaMock.graphEntity.findMany
      .mockResolvedValueOnce([matched]) // initial matches
      .mockResolvedValueOnce([matched]) // subgraph entities
    prismaMock.graphEdge.findMany.mockResolvedValue([])
    generateWithGroqMock.mockResolvedValue({
      answer: 'Autonomous vehicles reduce accidents.',
      keyTakeaways: ['Safety improves'],
      gaps: ['Long-term data is sparse'],
    })

    const res = await POST(postRequest({ query: 'autonomous vehicles' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.answer).toBe('Autonomous vehicles reduce accidents.')
    expect(body.keyTakeaways).toEqual(['Safety improves'])
    expect(body.matchedIds).toEqual(['e1'])
    expect(body.subgraph.entities[0].matched).toBe(true)
  })

  it('falls back to subgraph-only when the LLM synthesis is unavailable', async () => {
    const matched = { id: 'e1', type: 'topic', label: 'Topic', content: null, jobId: null, origin: 'system' }
    prismaMock.graphEntity.findMany.mockResolvedValueOnce([matched]).mockResolvedValueOnce([matched])
    prismaMock.graphEdge.findMany.mockResolvedValue([])
    generateWithGroqMock.mockResolvedValue({
      summary: 'Analysis unavailable — LLM service temporarily unreachable.',
    })

    const res = await POST(postRequest({ query: 'topic' }))
    const body = await res.json()

    expect(body.answer).toBeNull()
    expect(body.message).toContain('LLM synthesis unavailable')
  })

  it('returns 500 on a database error', async () => {
    prismaMock.graphEntity.findMany.mockRejectedValue(new Error('db down'))
    const res = await POST(postRequest({ query: 'topic' }))
    expect(res.status).toBe(500)
  })
})
