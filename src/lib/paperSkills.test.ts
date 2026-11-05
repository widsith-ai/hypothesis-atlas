import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAPER_SKILL_ID,
  MAX_COLLECTED_PAPERS,
  MAX_PLAN_CHARS,
  PAPER_SKILLS,
  buildPaperContext,
  getPaperSkill,
  skillForRequest,
} from './paperSkills'

describe('paper skill registry (#99)', () => {
  it('has the launch skills, each well-formed and uniquely identified', () => {
    const ids = PAPER_SKILLS.map((s) => s.id)
    expect(ids).toEqual(
      expect.arrayContaining(['writing', 'experiment', 'literature-review', 'critical-reviewer', 'abstract-title', 'section-drafting']),
    )
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of PAPER_SKILLS) {
      expect(s.id, s.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
      expect(s.label.trim(), s.id).not.toBe('')
      expect(s.icon.trim(), s.id).not.toBe('')
      expect(s.description.length, s.id).toBeGreaterThan(20)
      expect(s.instructions.length, s.id).toBeGreaterThan(100)
      expect(s.starters.length, s.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('falls back to the default skill for unknown ids', () => {
    expect(getPaperSkill('nope').id).toBe(DEFAULT_PAPER_SKILL_ID)
    expect(getPaperSkill(undefined).id).toBe(DEFAULT_PAPER_SKILL_ID)
    expect(getPaperSkill('critical-reviewer').id).toBe('critical-reviewer')
  })

  it('keeps older persona callers working, and leaves the question bot alone', () => {
    expect(skillForRequest('experiment', undefined)?.id).toBe('experiment')
    expect(skillForRequest('writing', undefined)?.id).toBe('writing')
    expect(skillForRequest(undefined, undefined)?.id).toBe('writing')
    expect(skillForRequest(undefined, 'literature-review')?.id).toBe('literature-review')
    expect(skillForRequest('ask', 'literature-review')).toBeNull()
  })
})

describe('buildPaperContext (#99)', () => {
  it('formats collected papers and the plan', () => {
    const out = buildPaperContext({
      collectedPapers: [{ title: 'Attention Is All You Need', venue: 'NeurIPS', year: 2017 }, { title: '  ' }],
      planMarkdown: '# Plan\nContribution: X',
    })
    expect(out).toContain('• Attention Is All You Need (NeurIPS 2017)')
    expect(out).not.toMatch(/•\s*\n/)
    expect(out).toContain('Current Atlas Plan')
    expect(out).toContain('Contribution: X')
  })

  it('returns nothing for missing or malformed input', () => {
    expect(buildPaperContext(undefined)).toBe('')
    expect(buildPaperContext('junk')).toBe('')
    expect(buildPaperContext({ collectedPapers: 'x', planMarkdown: 42 })).toBe('')
  })

  it('caps untrusted input so it cannot blow up the prompt', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ title: `Paper ${i}` }))
    const out = buildPaperContext({ collectedPapers: many, planMarkdown: 'p'.repeat(MAX_PLAN_CHARS * 3) })
    expect(out.match(/• Paper/g)?.length).toBe(MAX_COLLECTED_PAPERS)
    expect(out).toContain('(plan truncated)')
    expect(out.length).toBeLessThan(MAX_PLAN_CHARS + 2000)
  })
})
