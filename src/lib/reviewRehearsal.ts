// #80 — pre-submission review rehearsal. Pure helpers for the parts of the
// rehearsal pipeline that don't need an LLM call themselves: the reviewer
// roster, reconciling where reviewers disagree, and validating the
// structured output of the revision-roadmap/response-letter LLM calls (the
// actual Groq calls live in src/app/api/paper-review/route.ts — kept thin
// here so this logic is unit-testable without one).

export interface ReviewerAgentDef {
  id: string
  name: string
  // The full prompt-facing description — what the LLM is told to embody.
  persona: string
  // #83: a short, human-facing summary of the same thing, for the "which
  // reviewers did this, and what were they looking for" explainer in the
  // UI — separate from `persona` so that text can stay prompt-engineering
  // verbose without becoming unreadable as UI copy.
  focus: string
}

// #63 (V3.0.0.1): role names, not invented people — a made-up name with a
// title ("Prof. Elena Marsh") can read as a real expert's verdict. These are
// labeled review lenses, not personas standing in for actual reviewers.
export const PRESET_AGENTS: ReviewerAgentDef[] = [
  {
    id: 'methodologist',
    name: 'Methodology & Novelty Reviewer',
    persona:
      'Reviews with 15 years of top-tier program-committee experience. Skeptical of incremental work; scrutinizes whether the claimed contribution is genuinely novel versus repackaged prior art. Reads the method description line by line and flags logical gaps, missing baselines, and unsupported assumptions.',
    focus: 'Whether the contribution is genuinely novel, and whether the method holds up to line-by-line scrutiny.',
  },
  {
    id: 'committee',
    name: 'Venue Fit & Impact Reviewer',
    persona:
      'Reviews as a program committee member and journal associate editor would. Evaluates whether the paper matters to this venue\'s specific audience, whether the positioning and related-work coverage are fair, and whether the claims match the evidence. Writes balanced reviews but is decisive about rejections that waste reviewer time.',
    focus: "Fit for this venue's audience, and whether the claims actually match the evidence.",
  },
  {
    id: 'rigor',
    name: 'Statistical Rigor & Reproducibility Reviewer',
    persona:
      'Reviews with a background in experimental design. Checks statistical validity, sample sizes, error bars, ablation coverage, dataset choices, and whether the experiments could be reproduced from the paper alone. Unforgiving about overclaimed results and missing negative results.',
    focus: 'Statistical validity, reproducibility, and whether results are overclaimed.',
  },
  {
    id: 'literature',
    name: 'Related Work & Claims Reviewer',
    persona:
      'Reviews meticulously for honesty: checks whether the paper positions its contribution honestly, distinguishes evidence from speculation, and makes claims at the right level of scope. Calls out missing comparisons and citations that do not support the surrounding argument.',
    focus: 'Honest positioning — claims scoped correctly, with citations that actually support the argument.',
  },
  {
    id: 'clarity',
    name: 'Clarity & Reproducibility Reviewer',
    persona:
      'Reviews for whether another research group could understand, reproduce, and build on the work. Traces definitions, datasets, implementation details, and stated limitations, and turns ambiguities into concrete questions for the authors.',
    focus: 'Whether another research group could actually understand, reproduce, and build on the work.',
  },
]

// #80 task 1: a distinct adversarial pass, not another persona of the same
// kind as the preset reviewer lenses — explicitly hunting for the single
// most damaging flaw, the way the harshest reviewer on a committee would,
// rather than producing a balanced list of pros and cons.
export const DEVILS_ADVOCATE_AGENT: ReviewerAgentDef = {
  id: 'devils-advocate',
  name: "Devil's Advocate Reviewer",
  persona:
    "Reviews adversarially, the way the harshest reviewer on a program committee would. Actively hunts for the single most damaging flaw — not a balanced list of minor nitpicks, but the one issue that would justify a reject on its own if true. States the sharpest version of every criticism instead of softening it to be diplomatic. Still grounds every claim in the paper's actual text — never invents a flaw the paper does not exhibit.",
  focus: 'An adversarial pass — hunts for the single most damaging flaw, phrased as bluntly as the harshest real reviewer would.',
}

export interface ReviewerVerdict {
  name: string
  recommendation: string
  overallScore: number
}

export interface Disagreement {
  description: string
  reviewers: string[]
}

const RECOMMENDATION_RANK: Record<string, number> = {
  accept: 0,
  'minor revision': 1,
  'major revision': 2,
  reject: 3,
}

/**
 * #80 task 1: "reconcile where they disagree." Flags two kinds of split: a
 * wide gap in recommendation severity (e.g. accept vs. reject), and a wide
 * spread in overall score — either one means the average/consensus alone
 * would hide a real disagreement worth the author's attention.
 */
export function findDisagreements(verdicts: ReviewerVerdict[]): Disagreement[] {
  if (verdicts.length < 2) return []
  const disagreements: Disagreement[] = []

  const ranks = verdicts.map((v) => RECOMMENDATION_RANK[v.recommendation] ?? RECOMMENDATION_RANK['major revision'])
  const minRank = Math.min(...ranks)
  const maxRank = Math.max(...ranks)
  if (maxRank - minRank >= 2) {
    const lenient = verdicts.filter((_, i) => ranks[i] === minRank)
    const harsh = verdicts.filter((_, i) => ranks[i] === maxRank)
    disagreements.push({
      description: `${lenient.map((v) => v.name).join(', ')} recommend${lenient.length === 1 ? 's' : ''} "${lenient[0].recommendation}" while ${harsh.map((v) => v.name).join(', ')} recommend${harsh.length === 1 ? 's' : ''} "${harsh[0].recommendation}" — worth resolving before you rely on the average.`,
      reviewers: [...new Set([...lenient, ...harsh].map((v) => v.name))],
    })
  }

  const scores = verdicts.map((v) => v.overallScore)
  const scoreSpread = Math.max(...scores) - Math.min(...scores)
  if (scoreSpread >= 4) {
    const low = verdicts.filter((v) => v.overallScore === Math.min(...scores))
    const high = verdicts.filter((v) => v.overallScore === Math.max(...scores))
    disagreements.push({
      description: `Overall scores range from ${Math.min(...scores)} (${low.map((v) => v.name).join(', ')}) to ${Math.max(...scores)} (${high.map((v) => v.name).join(', ')}) — a ${scoreSpread}-point spread the average score alone doesn't show.`,
      reviewers: [...new Set([...low, ...high].map((v) => v.name))],
    })
  }

  return disagreements
}

export interface RevisionRoadmapItem {
  issue: string
  blocking: boolean
}

export interface RevisionRoadmap {
  blocking: string[]
  niceToFix: string[]
}

/** #80 task 3: validates the LLM's {issue, blocking} list before trusting it. */
export function parseRevisionRoadmap(raw: unknown): RevisionRoadmapItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((entry): RevisionRoadmapItem[] => {
      if (!entry || typeof entry !== 'object') return []
      const e = entry as Record<string, unknown>
      const issue = typeof e.issue === 'string' ? e.issue.trim().slice(0, 300) : ''
      if (!issue) return []
      return [{ issue, blocking: e.blocking === true }]
    })
    .slice(0, 15)
}

export function sortRevisionRoadmap(items: RevisionRoadmapItem[]): RevisionRoadmap {
  return {
    blocking: items.filter((i) => i.blocking).map((i) => i.issue),
    niceToFix: items.filter((i) => !i.blocking).map((i) => i.issue),
  }
}

export interface ResponseLetterEntry {
  comment: string
  draftResponse: string
}

/**
 * #80 task 4: validates the LLM's {comment, draftResponse} pairs — a
 * drafting aid for the author, never a finished rebuttal (task 5: this is a
 * pre-submission rehearsal, not the real post-submission review cycle).
 */
export function parseResponseLetter(raw: unknown): ResponseLetterEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((entry): ResponseLetterEntry[] => {
      if (!entry || typeof entry !== 'object') return []
      const e = entry as Record<string, unknown>
      const comment = typeof e.comment === 'string' ? e.comment.trim().slice(0, 300) : ''
      const draftResponse = typeof e.draftResponse === 'string' ? e.draftResponse.trim().slice(0, 600) : ''
      if (!comment || !draftResponse) return []
      return [{ comment, draftResponse }]
    })
    .slice(0, 10)
}
