import { describe, it, expect } from 'vitest'
import {
  PAPER_SPLIT_DEFAULT,
  PAPER_SPLIT_LIMITS,
  clampSplit,
  fractionFromPointer,
  parseStoredSplit,
  serializeSplit,
} from './splitPane'

const L = PAPER_SPLIT_LIMITS // minLeft 320, minRight 440, divider 12

describe('clampSplit', () => {
  it('leaves a fraction inside both minimums untouched', () => {
    expect(clampSplit(0.4, 1412, L)).toBeCloseTo(0.4)
  })

  it('never lets the chat get narrower than its minimum', () => {
    const f = clampSplit(0.05, 1412, L)
    expect(f * (1412 - L.divider)).toBeCloseTo(L.minLeft)
  })

  it('never lets the session get narrower than its minimum', () => {
    const f = clampSplit(0.95, 1412, L)
    expect((1 - f) * (1412 - L.divider)).toBeCloseTo(L.minRight)
  })

  it('shares the space by the minimums when the window is too narrow for both', () => {
    expect(clampSplit(0.9, 600, L)).toBeCloseTo(320 / 760)
  })

  it('falls back to the default for NaN', () => {
    expect(clampSplit(Number.NaN, 1412, L)).toBeCloseTo(PAPER_SPLIT_DEFAULT)
  })
})

describe('fractionFromPointer', () => {
  it('maps the pointer to the left pane share, accounting for the divider', () => {
    // container at x=100, 1212px wide → 1200px usable; pointer at the centre of the divider
    expect(fractionFromPointer(100 + 6 + 600, 100, 1212, L)).toBeCloseTo(0.5)
  })

  it('clamps when dragged past either edge', () => {
    expect(fractionFromPointer(0, 100, 1212, L) * 1200).toBeCloseTo(320)
    expect((1 - fractionFromPointer(5000, 100, 1212, L)) * 1200).toBeCloseTo(440)
  })
})

describe('stored split', () => {
  it('round-trips', () => {
    expect(parseStoredSplit(serializeSplit(0.4321))).toBeCloseTo(0.4321)
  })

  it('ignores missing, malformed and out-of-range values', () => {
    for (const raw of [null, undefined, '', 'abc', '0', '1', '-0.2', '1.5', 'NaN']) {
      expect(parseStoredSplit(raw)).toBe(PAPER_SPLIT_DEFAULT)
    }
  })
})
