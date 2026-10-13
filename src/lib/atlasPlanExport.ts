// SPDX-License-Identifier: AGPL-3.0-only
import type { ClaimGrounding } from '@/lib/review-grounding'

/**
 * Atlas Plan types and the Markdown export — #64 (V3.0.0.2). Split out of
 * lib/atlasPlan.ts so the browser can rebuild the export after the
 * researcher edits a plan, without pulling the server-only Groq client into
 * the client bundle.
 */

export type PlanMode = 'plan' | 'outline'

/** A passage the grounding pipeline checked a claim against, labelled with the source it came from. */
export interface PlanEvidence {
  sourceTitle: string | null
  text: string
}

export interface GroundedPlanClaim {
  text: string
  citedSourceTitles: string[]
  /** False when the model cited a title that isn't in the source list it was given — caught before grounding even runs. */
  citationsVerified: boolean
  grounding: ClaimGrounding
  evidence?: PlanEvidence[]
  /** Set when the researcher edited the claim after it was grounded — the verdict above no longer applies until it is re-checked. */
  edited?: boolean
}

export interface AtlasPlan {
  mode: PlanMode
  contributionStatement: string | null
  claims: GroundedPlanClaim[]
  methodAndDataPlan: string | null
  threatsToValidity: string[]
  outline: string[]
  available: boolean
}

function claimBadge(claim: GroundedPlanClaim): string {
  if (claim.edited) return '[unchecked]'
  if (claim.grounding.status === 'grounded') return '[grounded]'
  if (claim.grounding.status === 'contradicted') return '[contradicted]'
  return '[unsupported]'
}

/** The neutral Markdown export — works with any agent, not tied to one plugin. */
export function buildPlanExportMarkdown(topicQuery: string, plan: AtlasPlan): string {
  const lines: string[] = [`# Research Plan: ${topicQuery}`, '']

  if (plan.contributionStatement) {
    lines.push('## Contribution', plan.contributionStatement, '')
  }

  if (plan.claims.length) {
    lines.push('## Claims to support')
    for (const c of plan.claims) {
      const cites = c.citedSourceTitles.length ? ` — sources: ${c.citedSourceTitles.join('; ')}` : ''
      lines.push(`- ${claimBadge(c)} ${c.text}${cites}`)
    }
    lines.push('')
  }

  if (plan.methodAndDataPlan) {
    lines.push('## Method and data plan', plan.methodAndDataPlan, '')
  }

  if (plan.threatsToValidity.length) {
    lines.push('## Threats to validity', ...plan.threatsToValidity.map((t) => `- ${t}`), '')
  }

  if (plan.outline.length) {
    lines.push('## Outline', ...plan.outline.map((o, i) => `${i + 1}. ${o}`), '')
  }

  return lines.join('\n')
}
