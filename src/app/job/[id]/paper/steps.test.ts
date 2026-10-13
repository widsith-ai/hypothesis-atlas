import { describe, it, expect } from 'vitest'
import { resolveStep, STEPS } from './steps'

describe('resolveStep', () => {
  it('accepts every current step id', () => {
    for (const s of STEPS) expect(resolveStep(s.id)).toBe(s.id)
  })

  it('maps the step ids from before #64 so old links and saved state still land somewhere sensible', () => {
    expect(resolveStep('context')).toBe('setup')
    expect(resolveStep('papers')).toBe('setup')
    expect(resolveStep('outline')).toBe('plan')
  })

  it('returns null for missing or unknown values', () => {
    expect(resolveStep(null)).toBeNull()
    expect(resolveStep('')).toBeNull()
    expect(resolveStep('bogus')).toBeNull()
  })
})
