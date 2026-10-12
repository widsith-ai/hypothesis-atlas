import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, generateAtlasPlanMock, buildPlanExportMarkdownMock } = vi.hoisted(() => ({
  prismaMock: {
    job: { findUnique: vi.fn() },
    source: { findMany: vi.fn() },
    top3Ideas: { findUnique: vi.fn() },
  },
  generateAtlasPlanMock: vi.fn(),
  buildPlanExportMarkdownMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/atlasPlan', () => ({ generateAtlasPlan: generateAtlasPlanMock, buildPlanExportMarkdown: buildPlanExportMarkdownMock }))

import { POST } from './route'

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/jobs/job-1/plan', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/jobs/[id]/plan', () => {
  it('returns 404 for a missing job', async () => {
    prismaMock.job.findUnique.mockResolvedValue(null)
    const res = await POST(req({}), { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })

  it('defaults to full-plan mode, passes the selected idea and the peer-reviewed sources', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'A topic' })
    prismaMock.source.findMany.mockResolvedValue([{ title: 'Paper One', snippet: 'abstract' }])
    prismaMock.top3Ideas.findUnique.mockResolvedValue(null)
    generateAtlasPlanMock.mockResolvedValue({ mode: 'plan', available: true, claims: [], outline: [] })
    buildPlanExportMarkdownMock.mockReturnValue('# plan')

    const res = await POST(req({ selectedIdea: { title: 'Idea' } }), { params: { id: 'job-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.exportMarkdown).toBe('# plan')
    expect(generateAtlasPlanMock).toHaveBeenCalledWith(
      'plan',
      'A topic',
      { title: 'Idea' },
      [{ title: 'Paper One', snippet: 'abstract' }],
      null,
      null
    )
  })

  it('passes through outline mode and trims the instruction', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'A topic' })
    prismaMock.source.findMany.mockResolvedValue([])
    prismaMock.top3Ideas.findUnique.mockResolvedValue(null)
    generateAtlasPlanMock.mockResolvedValue({ mode: 'outline', available: true, claims: [], outline: [] })

    await POST(req({ mode: 'outline', instruction: '  focus on X  ' }), { params: { id: 'job-1' } })

    expect(generateAtlasPlanMock).toHaveBeenCalledWith('outline', 'A topic', null, [], 'focus on X', null)
  })

  it('falls back to the first Top3Ideas candidate when no idea is selected', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'A topic' })
    prismaMock.source.findMany.mockResolvedValue([])
    prismaMock.top3Ideas.findUnique.mockResolvedValue({ ideasJson: JSON.stringify([{ title: 'First idea' }]) })
    generateAtlasPlanMock.mockResolvedValue({ mode: 'plan', available: true, claims: [], outline: [] })

    await POST(req({}), { params: { id: 'job-1' } })

    expect(generateAtlasPlanMock).toHaveBeenCalledWith('plan', 'A topic', { title: 'First idea' }, [], null, null)
  })

  it('returns 500 when plan generation throws', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'A topic' })
    prismaMock.source.findMany.mockResolvedValue([])
    prismaMock.top3Ideas.findUnique.mockResolvedValue(null)
    generateAtlasPlanMock.mockRejectedValue(new Error('boom'))

    const res = await POST(req({}), { params: { id: 'job-1' } })
    expect(res.status).toBe(500)
  })

  it('does not build an export when the plan is unavailable', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'A topic' })
    prismaMock.source.findMany.mockResolvedValue([])
    prismaMock.top3Ideas.findUnique.mockResolvedValue(null)
    generateAtlasPlanMock.mockResolvedValue({ mode: 'plan', available: false, claims: [], outline: [] })

    const res = await POST(req({}), { params: { id: 'job-1' } })
    const body = await res.json()

    expect(body.exportMarkdown).toBeNull()
    expect(buildPlanExportMarkdownMock).not.toHaveBeenCalled()
  })
})
