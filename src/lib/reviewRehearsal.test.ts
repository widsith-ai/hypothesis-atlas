import { describe, it, expect } from 'vitest'
import {
  findDisagreements,
  parseRevisionRoadmap,
  sortRevisionRoadmap,
  parseResponseLetter,
  DEVILS_ADVOCATE_AGENT,
} from './reviewRehearsal'

describe('DEVILS_ADVOCATE_AGENT', () => {
  it('has a distinct id and a persona describing an adversarial, not balanced, review', () => {
    expect(DEVILS_ADVOCATE_AGENT.id).toBe('devils-advocate')
    expect(DEVILS_ADVOCATE_AGENT.persona.toLowerCase()).toContain('adversarial')
  })
})

describe('findDisagreements', () => {
  it('returns nothing for a single reviewer', () => {
    expect(findDisagreements([{ name: 'A', recommendation: 'accept', overallScore: 8 }])).toEqual([])
  })

  it('returns nothing when reviewers broadly agree', () => {
    const verdicts = [
      { name: 'A', recommendation: 'minor revision', overallScore: 7 },
      { name: 'B', recommendation: 'major revision', overallScore: 6 },
    ]
    expect(findDisagreements(verdicts)).toEqual([])
  })

  it('flags a wide recommendation gap (accept vs reject)', () => {
    const verdicts = [
      { name: 'A', recommendation: 'accept', overallScore: 8 },
      { name: 'B', recommendation: 'reject', overallScore: 7 },
    ]
    const result = findDisagreements(verdicts)
    expect(result.some((d) => d.description.includes('accept') && d.description.includes('reject'))).toBe(true)
  })

  it('flags a wide score spread even when recommendations are close', () => {
    const verdicts = [
      { name: 'A', recommendation: 'minor revision', overallScore: 9 },
      { name: 'B', recommendation: 'major revision', overallScore: 3 },
    ]
    const result = findDisagreements(verdicts)
    expect(result.some((d) => d.description.includes('spread'))).toBe(true)
  })

  it('an unrecognized recommendation is treated as a middling severity, not a crash', () => {
    const verdicts = [
      { name: 'A', recommendation: 'bogus', overallScore: 5 },
      { name: 'B', recommendation: 'major revision', overallScore: 5 },
    ]
    expect(() => findDisagreements(verdicts)).not.toThrow()
  })
})

describe('parseRevisionRoadmap / sortRevisionRoadmap', () => {
  it('parses valid entries and drops malformed ones', () => {
    const raw = [
      { issue: 'Missing ablation for component X', blocking: true },
      { issue: 'Typo in Table 2 caption', blocking: false },
      { issue: '' }, // dropped: empty issue
      { blocking: true }, // dropped: no issue
      'not an object', // dropped
    ]
    const items = parseRevisionRoadmap(raw)
    expect(items).toEqual([
      { issue: 'Missing ablation for component X', blocking: true },
      { issue: 'Typo in Table 2 caption', blocking: false },
    ])
  })

  it('treats a missing/non-boolean blocking field as not blocking', () => {
    const items = parseRevisionRoadmap([{ issue: 'Something', blocking: 'yes' }])
    expect(items).toEqual([{ issue: 'Something', blocking: false }])
  })

  it('returns [] for non-array input', () => {
    expect(parseRevisionRoadmap(null)).toEqual([])
    expect(parseRevisionRoadmap({})).toEqual([])
  })

  it('sorts into blocking vs nice-to-fix buckets', () => {
    const items = parseRevisionRoadmap([
      { issue: 'Blocking one', blocking: true },
      { issue: 'Nice one', blocking: false },
    ])
    expect(sortRevisionRoadmap(items)).toEqual({ blocking: ['Blocking one'], niceToFix: ['Nice one'] })
  })
})

describe('parseResponseLetter', () => {
  it('parses valid comment/response pairs', () => {
    const raw = [{ comment: 'Sample size is too small', draftResponse: 'We agree and added a power analysis.' }]
    expect(parseResponseLetter(raw)).toEqual(raw)
  })

  it('drops an entry missing either field', () => {
    const raw = [
      { comment: 'Only a comment' },
      { draftResponse: 'Only a response' },
      { comment: 'Both present', draftResponse: 'Here is the response' },
    ]
    expect(parseResponseLetter(raw)).toEqual([{ comment: 'Both present', draftResponse: 'Here is the response' }])
  })

  it('caps the list at 10 entries', () => {
    const raw = Array.from({ length: 15 }, (_, i) => ({ comment: `c${i}`, draftResponse: `r${i}` }))
    expect(parseResponseLetter(raw)).toHaveLength(10)
  })
})
