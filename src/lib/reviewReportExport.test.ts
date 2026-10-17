import { describe, it, expect } from 'vitest'
import { buildReviewReportMarkdown, reviewReportFileName, type ReviewReportData } from './reviewReportExport'

const baseData: ReviewReportData = {
  venue: { name: 'ML Conference', criteria: [] },
  role: 'author',
  agents: [
    {
      id: 'methodologist',
      name: 'Methodology & Novelty Reviewer',
      summary: 'Solid idea, under-evaluated.',
      strengths: ['Clear motivation'],
      weaknesses: ['No quality metric reported', 'Single GPU only'],
      questions: ['What happens under concurrent load?'],
      scores: { novelty: 6, soundness: 4, clarity: 7, significance: 5, overall: 5 },
      recommendation: 'major revision',
    },
    { id: 'rigor', name: 'Statistical Rigor Reviewer', unavailable: true },
  ],
  disagreements: [{ description: 'Scores range from 2 to 7.' }],
  revisionRoadmap: { blocking: ['Add quality metrics'], niceToFix: ['Fix typo in Table 2'] },
  responseLetterSkeleton: [{ comment: 'Add quality metrics', draftResponse: 'We will add F1 and exact-match scores.' }],
  final: {
    scores: { novelty: 6, soundness: 4, clarity: 7, significance: 5, overall: 5 },
    consensus: 'major revision',
    metaReview: 'Needs quantitative evaluation before resubmission.',
    decisionLetter: 'Dear Authors,\n\nWe have reached a decision of major revision...',
    reviewerCount: 1,
  },
}

describe('buildReviewReportMarkdown', () => {
  it('includes the paper title, venue, and final verdict', () => {
    const md = buildReviewReportMarkdown('My Paper', baseData)
    expect(md).toContain('# Peer Review Rehearsal: My Paper')
    expect(md).toContain('ML Conference')
    expect(md).toContain('major revision')
    expect(md).toContain('Needs quantitative evaluation before resubmission.')
  })

  it('includes the decision letter when present', () => {
    const md = buildReviewReportMarkdown('My Paper', baseData)
    expect(md).toContain('We have reached a decision of major revision')
  })

  it('includes every available reviewer, with strengths/weaknesses/questions', () => {
    const md = buildReviewReportMarkdown('My Paper', baseData)
    expect(md).toContain('Methodology & Novelty Reviewer')
    expect(md).toContain('Clear motivation')
    expect(md).toContain('No quality metric reported')
    expect(md).toContain('What happens under concurrent load?')
  })

  it('notes an unavailable reviewer without crashing on missing fields', () => {
    const md = buildReviewReportMarkdown('My Paper', baseData)
    expect(md).toContain('Statistical Rigor Reviewer')
    expect(md).toContain('failed to produce a review')
  })

  it('includes disagreements when present', () => {
    const md = buildReviewReportMarkdown('My Paper', baseData)
    expect(md).toContain('Where Reviewers Disagreed')
    expect(md).toContain('Scores range from 2 to 7.')
  })

  it('omits the disagreements section entirely when there are none', () => {
    const md = buildReviewReportMarkdown('My Paper', { ...baseData, disagreements: [] })
    expect(md).not.toContain('Where Reviewers Disagreed')
  })

  it('includes the revision roadmap and response letter for the author role', () => {
    const md = buildReviewReportMarkdown('My Paper', baseData)
    expect(md).toContain('Revision Roadmap')
    expect(md).toContain('Add quality metrics')
    expect(md).toContain('Response Letter — Draft Starting Points')
    expect(md).toContain('We will add F1 and exact-match scores.')
  })

  it('omits the revision roadmap and response letter sections for the reviewer role (empty data)', () => {
    const md = buildReviewReportMarkdown('My Paper', {
      ...baseData,
      role: 'reviewer',
      revisionRoadmap: { blocking: [], niceToFix: [] },
      responseLetterSkeleton: [],
    })
    expect(md).not.toContain('Revision Roadmap')
    expect(md).not.toContain('Response Letter — Draft Starting Points')
  })
})

describe('reviewReportFileName', () => {
  it('slugifies the paper label into a safe .md filename', () => {
    expect(reviewReportFileName('My Great Paper: A Study')).toBe('peer-review-my-great-paper-a-study.md')
  })

  it('falls back to a generic name for an empty/unslugifiable label', () => {
    expect(reviewReportFileName('')).toBe('peer-review-rehearsal.md')
    expect(reviewReportFileName('!!!')).toBe('peer-review-rehearsal.md')
  })
})
