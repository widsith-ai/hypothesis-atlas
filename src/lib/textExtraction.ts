// Fixes a PDF text-extraction artifact: when a PDF's embedded font lacks a
// correct ToUnicode CMap — common for LaTeX math-italic glyphs like the
// variables in "v = (k, x, a, τ)" — pdf-parse/pdf.js falls back to a glyph
// index it can't actually resolve to a real character, and that fallback
// often lands in the (very large, 11k+ code point) Hangul Syllables block.
// The result is an otherwise-English paper with stray Korean-looking
// characters sprinkled through its math notation. There's no way to
// recover the intended glyph from a broken CMap, so this flags the
// artifact with the Unicode replacement character instead of either
// displaying the wrong script or silently deleting a character (which
// would glue two words together with nothing to show a letter went
// missing).

const SUSPECT_SCRIPT_RANGES: [number, number][] = [
  [0xac00, 0xd7a3], // Hangul syllables
  [0x1100, 0x11ff], // Hangul Jamo
  [0x3130, 0x318f], // Hangul compatibility jamo
  [0xa960, 0xa97f], // Hangul jamo extended-A
  [0xd7b0, 0xd7ff], // Hangul jamo extended-B
]

function isSuspectCodePoint(code: number): boolean {
  return SUSPECT_SCRIPT_RANGES.some(([start, end]) => code >= start && code <= end)
}

/**
 * Replaces stray Hangul-block characters with "�", but only when they make
 * up a small fraction of the text — a genuinely Korean or mixed-script
 * document should never have its real content stripped out.
 */
export function stripGlyphMappingArtifacts(text: string, maxSuspectRatio = 0.05): string {
  const chars = [...text]
  if (chars.length === 0) return text

  let suspectCount = 0
  for (const ch of chars) {
    if (isSuspectCodePoint(ch.codePointAt(0)!)) suspectCount++
  }
  if (suspectCount === 0) return text

  const ratio = suspectCount / chars.length
  if (ratio > maxSuspectRatio) return text

  return chars.map((ch) => (isSuspectCodePoint(ch.codePointAt(0)!) ? '�' : ch)).join('')
}
