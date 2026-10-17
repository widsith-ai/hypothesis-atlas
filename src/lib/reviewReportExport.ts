// The downloadable Markdown export for a completed Peer Review rehearsal —
// mirrors atlasPlanExport.ts's pattern (a pure, client-safe builder the
// component calls after a review finishes, not a server round-trip).

export interface ReportScores {
  novelty: number
  soundness: number
  clarity: number
  significance: number
  overall: number
}

export interface ReportAgent {
  id: string
  name: string
  unavailable?: boolean
  summary?: string
  strengths?: string[]
  weaknesses?: string[]
  questions?: string[]
  scores?: ReportScores
  recommendation?: string
}

export interface ReportDisagreement {
  description: string
}

export interface ReportRevisionRoadmap {
  blocking: string[]
  niceToFix: string[]
}

export interface ReportResponseLetterEntry {
  comment: string
  draftResponse: string
}

export interface ReviewReportData {
  venue: { name: string; criteria: string[] }
  role?: 'author' | 'reviewer'
  agents: ReportAgent[]
  disagreements?: ReportDisagreement[]
  revisionRoadmap?: ReportRevisionRoadmap
  responseLetterSkeleton?: ReportResponseLetterEntry[]
  final: {
    scores: ReportScores
    consensus: string
    metaReview: string
    decisionLetter?: string
    reviewerCount: number
  }
}

const SCORE_LABELS: [keyof ReportScores, string][] = [
  ['novelty', 'Novelty'],
  ['soundness', 'Soundness'],
  ['clarity', 'Clarity'],
  ['significance', 'Significance'],
  ['overall', 'Overall'],
]

export function buildReviewReportMarkdown(paperLabel: string, data: ReviewReportData): string {
  const lines: string[] = [`# Peer Review Rehearsal: ${paperLabel}`, '']
  lines.push(
    `*Simulated review for ${data.venue.name}${data.role ? ` — viewed as the ${data.role}` : ''}. This is a pre-submission rehearsal, not a real decision or a substitute for actual reviewer feedback.*`,
    ''
  )

  lines.push('## Final Verdict', '')
  lines.push(`**Consensus recommendation:** ${data.final.consensus}`, '')
  lines.push(`**Scores** (1-10, averaged across ${data.final.reviewerCount} reviewer${data.final.reviewerCount === 1 ? '' : 's'}):`)
  for (const [key, label] of SCORE_LABELS) lines.push(`- ${label}: ${data.final.scores[key]}`)
  lines.push('')
  lines.push("**Editor's meta-review:**", data.final.metaReview, '')
  if (data.final.decisionLetter) {
    lines.push('**Simulated decision letter:**', '', data.final.decisionLetter, '')
  }

  if (data.disagreements && data.disagreements.length > 0) {
    lines.push('## Where Reviewers Disagreed', '')
    for (const d of data.disagreements) lines.push(`- ${d.description}`)
    lines.push('')
  }

  lines.push('## Reviewer Roster', '')
  for (const agent of data.agents) {
    lines.push(`### ${agent.name}`, '')
    if (agent.unavailable) {
      lines.push('_This reviewer failed to produce a review — LLM service may have been rate-limited._', '')
      continue
    }
    if (agent.recommendation) lines.push(`**Recommendation:** ${agent.recommendation}`, '')
    if (agent.scores) {
      lines.push(`**Scores:** ${SCORE_LABELS.map(([key, label]) => `${label} ${agent.scores![key]}`).join(' · ')}`, '')
    }
    if (agent.summary) lines.push(agent.summary, '')
    if (agent.strengths && agent.strengths.length > 0) {
      lines.push('**Strengths:**')
      for (const s of agent.strengths) lines.push(`- ${s}`)
      lines.push('')
    }
    if (agent.weaknesses && agent.weaknesses.length > 0) {
      lines.push('**Weaknesses:**')
      for (const w of agent.weaknesses) lines.push(`- ${w}`)
      lines.push('')
    }
    if (agent.questions && agent.questions.length > 0) {
      lines.push('**Questions to authors:**')
      for (const q of agent.questions) lines.push(`- ${q}`)
      lines.push('')
    }
  }

  if (data.revisionRoadmap && (data.revisionRoadmap.blocking.length > 0 || data.revisionRoadmap.niceToFix.length > 0)) {
    lines.push('## Revision Roadmap', '')
    if (data.revisionRoadmap.blocking.length > 0) {
      lines.push('**Blocking:**')
      data.revisionRoadmap.blocking.forEach((issue, i) => lines.push(`${i + 1}. ${issue}`))
      lines.push('')
    }
    if (data.revisionRoadmap.niceToFix.length > 0) {
      lines.push('**Nice to fix:**')
      data.revisionRoadmap.niceToFix.forEach((issue, i) => lines.push(`${i + 1}. ${issue}`))
      lines.push('')
    }
  }

  if (data.responseLetterSkeleton && data.responseLetterSkeleton.length > 0) {
    lines.push('## Response Letter — Draft Starting Points', '')
    lines.push('_Drafting aids to edit, not a finished rebuttal._', '')
    for (const entry of data.responseLetterSkeleton) {
      lines.push(`**Comment:** ${entry.comment}`, '', entry.draftResponse, '')
    }
  }

  return lines.join('\n').trim() + '\n'
}

/** A filesystem-safe filename stem for the downloaded report. */
export function reviewReportFileName(paperLabel: string): string {
  const slug = paperLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `peer-review-${slug || 'rehearsal'}.md`
}
