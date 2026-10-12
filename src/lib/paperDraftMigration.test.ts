import { describe, it, expect } from 'vitest'
import { extractAtlasPlanDraft, extractLegacyArsDraft, pickNewestDraft } from './paperDraftMigration'

describe('extractLegacyArsDraft', () => {
  it('returns null for missing or malformed input', () => {
    expect(extractLegacyArsDraft(null)).toBeNull()
    expect(extractLegacyArsDraft('not json')).toBeNull()
  })

  it('returns null when there are no assistant messages', () => {
    expect(extractLegacyArsDraft(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], savedAt: 1 }))).toBeNull()
  })

  it('uses the last assistant message when it is substantial', () => {
    const long = 'x'.repeat(1600)
    const raw = JSON.stringify({ messages: [{ role: 'assistant', content: 'short' }, { role: 'assistant', content: long }], savedAt: 42 })
    const result = extractLegacyArsDraft(raw)
    expect(result).toEqual({ text: long, savedAt: 42 })
  })

  it('joins the last two short assistant messages when there is more than one', () => {
    const raw = JSON.stringify({ messages: [{ role: 'assistant', content: 'part one' }, { role: 'assistant', content: 'part two' }], savedAt: 5 })
    const result = extractLegacyArsDraft(raw)
    expect(result?.text).toBe('part one\n\npart two')
  })
})

describe('extractAtlasPlanDraft', () => {
  it('returns null for missing input or a missing export', () => {
    expect(extractAtlasPlanDraft(null)).toBeNull()
    expect(extractAtlasPlanDraft(JSON.stringify({ savedAt: 1 }))).toBeNull()
    expect(extractAtlasPlanDraft(JSON.stringify({ exportMarkdown: '  ', savedAt: 1 }))).toBeNull()
  })

  it('reads the export markdown and saved time', () => {
    const raw = JSON.stringify({ exportMarkdown: '# Plan', savedAt: 99 })
    expect(extractAtlasPlanDraft(raw)).toEqual({ text: '# Plan', savedAt: 99 })
  })
})

describe('pickNewestDraft', () => {
  it('returns null for no candidates', () => {
    expect(pickNewestDraft([])).toBeNull()
  })

  it('picks the most recently saved candidate across both prefixes', () => {
    const result = pickNewestDraft([
      { key: 'ars-plan:job-1:my-idea', prefix: 'ars-plan:job-1:', text: 'old draft', savedAt: 10 },
      { key: 'atlas-plan:job-1:my-idea', prefix: 'atlas-plan:job-1:', text: 'new draft', savedAt: 20 },
    ])
    expect(result).toEqual({ label: 'my idea', savedAt: 20, text: 'new draft' })
  })

  it('derives a readable label from the key slug, falling back when empty', () => {
    const result = pickNewestDraft([{ key: 'atlas-plan:job-1:', prefix: 'atlas-plan:job-1:', text: 't', savedAt: 1 }])
    expect(result?.label).toBe('Write Paper session')
  })
})
