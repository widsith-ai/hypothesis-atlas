import { describe, it, expect, vi, beforeEach } from 'vitest'

const { groqMock, groundReviewClaimsMock } = vi.hoisted(() => ({
  groqMock: { chat: { completions: { create: vi.fn() } } },
  groundReviewClaimsMock: vi.fn(),
}))
vi.mock('@/lib/groq', () => ({ groq: groqMock }))
vi.mock('@/lib/review-grounding', async () => {
  const actual = await vi.importActual<typeof import('@/lib/review-grounding')>('@/lib/review-grounding')
  return { ...actual, groundReviewClaims: groundReviewClaimsMock }
})

import { parseRawPlan, buildPlanExportMarkdown, groundPlanClaims, generateAtlasPlan } from './atlasPlan'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseRawPlan', () => {
  it('parses a full plan response', () => {
    const raw = JSON.stringify({
      contributionStatement: 'We show X.',
      claims: [{ text: 'Claim A', citedSourceTitles: ['Paper One'] }],
      methodAndDataPlan: 'Use dataset Y.',
      threatsToValidity: ['Small sample'],
      outline: ['Intro', 'Methods'],
    })
    const result = parseRawPlan(raw, 'plan')
    expect(result.contributionStatement).toBe('We show X.')
    expect(result.claims).toEqual([{ text: 'Claim A', citedSourceTitles: ['Paper One'] }])
    expect(result.outline).toEqual(['Intro', 'Methods'])
  })

  it('omits plan-only fields in outline mode', () => {
    const raw = JSON.stringify({ contributionStatement: 'ignored', outline: ['Intro'], claims: [] })
    const result = parseRawPlan(raw, 'outline')
    expect(result.contributionStatement).toBeNull()
    expect(result.methodAndDataPlan).toBeNull()
    expect(result.threatsToValidity).toEqual([])
  })

  it('never throws on malformed JSON — returns an empty-ish plan instead', () => {
    const result = parseRawPlan('not json at all', 'plan')
    expect(result.claims).toEqual([])
    expect(result.outline).toEqual([])
  })

  it('drops claims with empty text and non-string citedSourceTitles entries', () => {
    const raw = JSON.stringify({ claims: [{ text: '  ', citedSourceTitles: [] }, { text: 'Real claim', citedSourceTitles: ['A', 42, null] }] })
    const result = parseRawPlan(raw, 'plan')
    expect(result.claims).toEqual([{ text: 'Real claim', citedSourceTitles: ['A'] }])
  })
})

describe('groundPlanClaims', () => {
  it('flags a claim that cites a title not in the source list, without calling grounding for nothing', async () => {
    groundReviewClaimsMock.mockResolvedValue([
      { grounding: { status: 'grounded', confidence: 0.9, method: 'overlap', overlapScore: 0.8 } },
    ])
    const result = await groundPlanClaims(
      [{ text: 'Claim', citedSourceTitles: ['A real title', 'A fabricated title'] }],
      [{ title: 'A real title', snippet: 'Some evidence text.' }]
    )
    expect(result[0].citationsVerified).toBe(false)
    expect(result[0].grounding.status).toBe('grounded')
  })

  it('marks citations verified when every cited title is in the source list', async () => {
    groundReviewClaimsMock.mockResolvedValue([
      { grounding: { status: 'grounded', confidence: 0.9, method: 'overlap', overlapScore: 0.8 } },
    ])
    const result = await groundPlanClaims(
      [{ text: 'Claim', citedSourceTitles: ['A real title'] }],
      [{ title: 'A real title', snippet: 'Some evidence text.' }]
    )
    expect(result[0].citationsVerified).toBe(true)
  })

  it('skips the grounding call entirely when there are no claims', async () => {
    const result = await groundPlanClaims([], [{ title: 'X', snippet: null }])
    expect(result).toEqual([])
    expect(groundReviewClaimsMock).not.toHaveBeenCalled()
  })
})

describe('generateAtlasPlan', () => {
  it('calls the LLM and grounds the resulting claims end to end', async () => {
    groqMock.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ outline: ['Intro'], claims: [] }) } }],
    })
    const result = await generateAtlasPlan('outline', 'A topic', null, [], null)
    expect(result.available).toBe(true)
    expect(result.outline).toEqual(['Intro'])
  })

  it('reports unavailable (not a crash or a fabricated plan) when GROQ_API_KEY is not configured', async () => {
    vi.resetModules()
    vi.doMock('@/lib/groq', () => ({ groq: null }))
    const { generateAtlasPlan: generateWithoutGroq } = await import('./atlasPlan')
    const result = await generateWithoutGroq('plan', 'A topic', null, [], null)
    expect(result).toEqual({ mode: 'plan', contributionStatement: null, claims: [], methodAndDataPlan: null, threatsToValidity: [], outline: [], available: false })
    vi.doUnmock('@/lib/groq')
  })
})

describe('buildPlanExportMarkdown', () => {
  it('includes a grounding badge per claim and the sources it cited', () => {
    const md = buildPlanExportMarkdown('My Topic', {
      mode: 'plan',
      contributionStatement: 'We show X.',
      claims: [
        { text: 'Claim A', citedSourceTitles: ['Paper One'], citationsVerified: true, grounding: { status: 'grounded', confidence: 0.9, method: 'overlap', overlapScore: 0.8 } },
      ],
      methodAndDataPlan: 'Plan.',
      threatsToValidity: ['Threat.'],
      outline: ['Intro'],
      available: true,
    })
    expect(md).toContain('# Research Plan: My Topic')
    expect(md).toContain('[grounded] Claim A')
    expect(md).toContain('sources: Paper One')
    expect(md).toContain('1. Intro')
  })
})
