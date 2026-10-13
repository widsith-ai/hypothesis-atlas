import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prismaMock, generateAtlasPlanMock, buildPlanExportMarkdownMock, groundPlanClaimsMock } = vi.hoisted(() => ({
  prismaMock: {
    job: { findUnique: vi.fn() },
    source: { findMany: vi.fn() },
    top3Ideas: { findUnique: vi.fn() },
  },
  generateAtlasPlanMock: vi.fn(),
  buildPlanExportMarkdownMock: vi.fn(),
  groundPlanClaimsMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/atlasPlan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/atlasPlan')>('@/lib/atlasPlan')
  return {
    mergePlanSources: actual.mergePlanSources,
    generateAtlasPlan: generateAtlasPlanMock,
    buildPlanExportMarkdown: buildPlanExportMarkdownMock,
    groundPlanClaims: groundPlanClaimsMock,
  }
})

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

  it('plans with the papers collected on Setup, after the job\'s own sources and without duplicates', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'A topic' })
    prismaMock.source.findMany.mockResolvedValue([{ title: 'Paper One', snippet: 'db abstract' }])
    prismaMock.top3Ideas.findUnique.mockResolvedValue(null)
    generateAtlasPlanMock.mockResolvedValue({ mode: 'plan', available: true, claims: [], outline: [] })

    await POST(
      req({ extraSources: [{ title: 'paper one', snippet: 'client copy' }, { title: 'Paper Two', snippet: 'abstract two' }, { snippet: 'no title' }] }),
      { params: { id: 'job-1' } }
    )

    expect(generateAtlasPlanMock.mock.calls[0][3]).toEqual([
      { title: 'Paper One', snippet: 'db abstract' },
      { title: 'Paper Two', snippet: 'abstract two' },
    ])
  })

  it('re-checks edited claims against the same merged sources without regenerating the plan', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'A topic' })
    prismaMock.source.findMany.mockResolvedValue([{ title: 'Paper One', snippet: 'db abstract' }])
    prismaMock.top3Ideas.findUnique.mockResolvedValue(null)
    groundPlanClaimsMock.mockResolvedValue([{ text: 'Edited claim', grounding: { status: 'grounded' } }])

    const res = await POST(
      req({ action: 'ground', claims: [{ text: '  Edited claim ', citedSourceTitles: ['Paper One', 7] }, { text: '' }], extraSources: [{ title: 'Paper Two', snippet: null }] }),
      { params: { id: 'job-1' } }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.claims).toEqual([{ text: 'Edited claim', grounding: { status: 'grounded' } }])
    expect(groundPlanClaimsMock).toHaveBeenCalledWith(
      [{ text: 'Edited claim', citedSourceTitles: ['Paper One'] }],
      [{ title: 'Paper One', snippet: 'db abstract' }, { title: 'Paper Two', snippet: null }]
    )
    expect(generateAtlasPlanMock).not.toHaveBeenCalled()
  })

  it('rejects a re-check with no usable claims', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'A topic' })
    prismaMock.source.findMany.mockResolvedValue([])
    prismaMock.top3Ideas.findUnique.mockResolvedValue(null)

    const res = await POST(req({ action: 'ground', claims: [{ text: '   ' }] }), { params: { id: 'job-1' } })
    expect(res.status).toBe(400)
    expect(groundPlanClaimsMock).not.toHaveBeenCalled()
  })
})
