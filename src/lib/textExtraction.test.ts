import { describe, it, expect } from 'vitest'
import { stripGlyphMappingArtifacts } from './textExtraction'

describe('stripGlyphMappingArtifacts', () => {
  it('leaves ordinary English text untouched', () => {
    const text = 'The report contributes a version v = (k, x, a, τ) with value x.'
    expect(stripGlyphMappingArtifacts(text)).toBe(text)
  })

  it('replaces stray Hangul-block characters (the reported bug) with the replacement character, in a realistically long paper excerpt', () => {
    const prose =
      'This section defines the notation used throughout the paper. '.repeat(20) +
      'The report contributes a version 푣=(푘, 푥,푎,휏)with value푥, accession푎, and availability time휏. ' +
      'This section defines the notation used throughout the paper. '.repeat(20)
    const result = stripGlyphMappingArtifacts(prose)
    expect(result).not.toContain('휏')
    expect(result).not.toContain('푘')
    expect(result).toContain('�')
    expect(result).toContain('The report contributes a version')
  })

  it('leaves text alone when Hangul-range characters are a large fraction of it (genuinely Korean content)', () => {
    const korean = '안녕하세요 연구자님 이것은 실제 한국어 논문입니다'
    expect(stripGlyphMappingArtifacts(korean)).toBe(korean)
  })

  it('returns the input unchanged when there is nothing suspect', () => {
    expect(stripGlyphMappingArtifacts('')).toBe('')
    expect(stripGlyphMappingArtifacts('plain ascii only')).toBe('plain ascii only')
  })

  it('respects a custom maxSuspectRatio threshold — above it is treated as genuine content, at/below it is treated as an artifact', () => {
    const text = '가'.repeat(10) + 'a'.repeat(10) // 50% Hangul
    expect(stripGlyphMappingArtifacts(text, 0.3)).toBe(text) // 0.5 > 0.3 → genuine, untouched
    expect(stripGlyphMappingArtifacts(text, 0.6)).not.toBe(text) // 0.5 <= 0.6 → artifact, stripped
  })
})
