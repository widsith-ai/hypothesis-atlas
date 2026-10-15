import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifyClaim, CLAIM_VERIFIER_ID } from './claimVerification'

const originalFetch = global.fetch

beforeEach(() => {
  delete process.env.REVIEW_NLI_ENDPOINT
})

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('verifyClaim', () => {
  it('marks a claim unsupported when it has no sources at all', async () => {
    const result = await verifyClaim('The intervention reduced error rates by half.', [])
    expect(result.status).toBe('unsupported')
    expect(result.method).toBe('overlap')
    expect(result.verifier).toBe(CLAIM_VERIFIER_ID)
    expect(result.passages).toEqual([])
  })

  it('marks a claim unavailable (not dropped) when sources overlap but no NLI endpoint is configured', async () => {
    const result = await verifyClaim('The novel algorithm improves accuracy significantly.', [
      { id: 'src-1', text: 'The novel algorithm improves accuracy by 20 percent in benchmarks.' },
    ])
    expect(result.status).toBe('unavailable')
    expect(result.method).toBe('unavailable')
  })

  it('attributes a matched passage back to the source it came from', async () => {
    const result = await verifyClaim('Simulation reduces accidents.', [
      { id: 'src-1', text: 'Unrelated filler text about something else entirely.' },
      { id: 'src-2', text: 'Our simulation study found that simulation reduces accidents substantially.' },
    ])
    // No NLI endpoint configured → status is 'unavailable', but the best-overlap
    // span (ranked first) should still be attributed to the source it actually
    // came from — the record is never dropped, and provenance should be as
    // accurate as possible even when the verdict itself is inconclusive.
    expect(result.passages[0]?.sourceId).toBe('src-2')
    expect(result.passages[0]?.text).toContain('simulation reduces accidents')
  })

  it('splits a multi-sentence claim and reports the worst sub-claim status', async () => {
    const result = await verifyClaim(
      'Simulation reduces accidents. The rocket engine failed catastrophically in orbit.',
      [{ id: 'src-1', text: 'Our simulation study found that simulation reduces accidents substantially.' }]
    )
    // The rocket-engine sub-claim has no supporting source at all → unsupported,
    // which is more severe than the first sub-claim's 'unavailable' — the gate
    // reports the worst finding across sub-claims, not just the first one.
    expect(result.status).toBe('unsupported')
  })

  it('never throws and always returns a usable result when sources are malformed/empty text', async () => {
    const result = await verifyClaim('Some claim.', [{ id: 'src-1', text: '' }])
    expect(result.status).toBeTruthy()
    expect(result.checkedAt).toBeInstanceOf(Date)
  })

  it('surfaces an inline DOI as a reference issue regardless of grounding status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }) as unknown as typeof fetch
    const result = await verifyClaim('This replicates the result in 10.1234/abcd.efgh.', [])
    expect(result.referenceIssues).toHaveLength(1)
    expect(result.referenceIssues[0].doi).toBe('10.1234/abcd.efgh')
  })
})
