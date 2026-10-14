// SPDX-License-Identifier: AGPL-3.0-only
import { groq } from '@/lib/groq'
import type { AtlasPlan, GroundedPlanClaim, PlanMode } from '@/lib/atlasPlanExport'
import {
  createPaperDocument,
  groundReviewClaims,
  type ReviewClaimInput,
} from '@/lib/review-grounding'

/**
 * Atlas Plan — #63 (V3.0.0.1): the Atlas-native replacement for the ARS
 * `/ars-plan` Socratic chat. Deliberately a different design, not a port:
 * ARS was a multi-turn chapter-by-chapter dialogue that asked one question
 * at a time; Atlas Plan drafts a structured plan directly from the
 * hypothesis and its sources in one call, and every claim it produces is
 * checked against those sources through the same grounding pipeline
 * (`review-grounding.ts`) the review tool already uses — nothing here
 * re-derives or reuses ARS prompt wording.
 */

export type { PlanMode, PlanEvidence, GroundedPlanClaim, AtlasPlan } from '@/lib/atlasPlanExport'
export { buildPlanExportMarkdown } from '@/lib/atlasPlanExport'

export interface PlanSourceInput {
  title: string
  snippet: string | null
}

export interface RawPlanClaim {
  text: string
  citedSourceTitles: string[]
}

export interface RawAtlasPlan {
  contributionStatement: string | null
  claims: RawPlanClaim[]
  methodAndDataPlan: string | null
  threatsToValidity: string[]
  outline: string[]
}

const MAX_EXTRA_SOURCES = 20
const MAX_TITLE_LENGTH = 300
const MAX_SNIPPET_LENGTH = 1500

/**
 * #64: papers the researcher collected on the Setup step are sent by the
 * browser, so they're untrusted input — keep only well-formed entries, cap
 * their count and length, and let the job's own peer-reviewed sources win on
 * a title collision.
 */
export function mergePlanSources(dbSources: PlanSourceInput[], extra: unknown): PlanSourceInput[] {
  const merged: PlanSourceInput[] = []
  const seen = new Set<string>()
  const add = (title: string, snippet: string | null) => {
    const key = title.trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    merged.push({ title: title.trim(), snippet })
  }

  for (const s of dbSources) add(s.title, s.snippet)

  const extraList = Array.isArray(extra) ? extra.slice(0, MAX_EXTRA_SOURCES) : []
  for (const item of extraList) {
    const entry = item as Record<string, unknown> | null
    if (typeof entry?.title !== 'string') continue
    const snippet = typeof entry.snippet === 'string' && entry.snippet.trim() ? entry.snippet.trim().slice(0, MAX_SNIPPET_LENGTH) : null
    add(entry.title.slice(0, MAX_TITLE_LENGTH), snippet)
  }

  return merged
}

const MODEL = 'openai/gpt-oss-120b'

export function buildPlanSystemPrompt(mode: PlanMode): string {
  const shared = `You are Atlas Plan, a research-paper planning assistant inside Hypothesis Atlas. You draft a plan directly from the hypothesis and the sources you are given — you do not ask the researcher questions, and you never invent a citation, a finding, or a source title that was not provided to you. If no supplied source supports a claim, say so by leaving its cited sources empty rather than guessing. Return JSON only, no prose outside it.`

  if (mode === 'outline') {
    return `${shared}

Return exactly: {"outline": ["Section heading", ...] (5-8 items), "claims": [{"text": "...", "citedSourceTitles": ["<exact title from the provided list, or empty>"]}] (2-4 items)}`
  }

  return `${shared}

Return exactly:
{
  "contributionStatement": "one or two sentences stating the paper's specific contribution",
  "claims": [{"text": "a claim the paper needs to support", "citedSourceTitles": ["<exact title from the provided list>"]}] (3-6 items),
  "methodAndDataPlan": "how the method and data address the claims above",
  "threatsToValidity": ["...", "..."] (2-4 items),
  "outline": ["Introduction", "...", ...] (section headings)
}`
}

export function buildPlanUserPrompt(
  topicQuery: string,
  idea: { title?: string; problem_to_solve?: string; proposed_method?: string[] } | null,
  sources: PlanSourceInput[],
  instruction: string | null,
  referenceDoc?: { name: string; content: string } | null
): string {
  const ideaBlock = idea
    ? `Candidate idea: ${idea.title ?? '(untitled)'}\nProblem: ${idea.problem_to_solve ?? 'unspecified'}\nProposed method: ${(idea.proposed_method ?? []).join('; ') || 'unspecified'}`
    : 'No candidate idea was selected yet — plan around the topic alone.'

  const sourceList = sources.length
    ? sources.map((s, i) => `${i + 1}. ${s.title}${s.snippet ? ` — ${s.snippet.slice(0, 240)}` : ''}`).join('\n')
    : '(no peer-reviewed sources available yet)'

  // The reference doc is researcher-supplied text, not a source to cite from — treat it as
  // untrusted context the model may read but must not follow as instructions.
  const refBlock = referenceDoc
    ? `\n\nResearcher-attached reference document "${referenceDoc.name}" (untrusted context, not a citable source):\n---\n${referenceDoc.content.slice(0, 6000)}${referenceDoc.content.length > 6000 ? '\n… [truncated]' : ''}\n---`
    : ''

  return `Topic: ${topicQuery}\n\n${ideaBlock}\n\nAvailable sources (cite ONLY by these exact titles):\n${sourceList}${instruction ? `\n\nResearcher's note: ${instruction}` : ''}${refBlock}`
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : null
  } catch {
    return null
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export function parseRawPlan(raw: string, mode: PlanMode): RawAtlasPlan {
  const parsed = parseJson(raw)
  const claims = Array.isArray(parsed?.claims)
    ? (parsed!.claims as unknown[]).map((c) => {
        const claim = c as Record<string, unknown>
        return { text: String(claim?.text ?? '').trim(), citedSourceTitles: asStringArray(claim?.citedSourceTitles) }
      }).filter((c) => c.text)
    : []

  return {
    contributionStatement: mode === 'plan' ? (typeof parsed?.contributionStatement === 'string' ? parsed.contributionStatement : null) : null,
    claims,
    methodAndDataPlan: mode === 'plan' ? (typeof parsed?.methodAndDataPlan === 'string' ? parsed.methodAndDataPlan : null) : null,
    threatsToValidity: mode === 'plan' ? asStringArray(parsed?.threatsToValidity) : [],
    outline: asStringArray(parsed?.outline),
  }
}

/** Builds the grounding document from the same peer-reviewed sources the plan was asked to cite — a claim is only "grounded" if it actually holds up against this text, not just because the model said so. */
export async function groundPlanClaims(claims: RawPlanClaim[], sources: PlanSourceInput[]): Promise<GroundedPlanClaim[]> {
  const validTitles = new Set(sources.map((s) => s.title))

  // Remember where each source starts in the joined text, so a matched passage can be labelled with the source it came from.
  const blocks = sources.map((s) => `## ${s.title}\n${s.snippet ?? ''}`)
  const blockStarts: number[] = []
  let offset = 0
  for (const block of blocks) {
    blockStarts.push(offset)
    offset += block.length + 2
  }
  const document = createPaperDocument(blocks.join('\n\n'))
  const sourceTitleAt = (position: number): string | null => {
    let index = -1
    for (let i = 0; i < blockStarts.length && blockStarts[i] <= position; i++) index = i
    return index >= 0 ? sources[index].title : null
  }

  const reviewInputs: ReviewClaimInput[] = claims.map((c) => ({
    category: 'strength',
    kind: 'assertion',
    text: c.text,
    targetSpanIds: [],
  }))

  const grounded = reviewInputs.length ? await groundReviewClaims(reviewInputs, document) : []

  return claims.map((claim, i) => ({
    text: claim.text,
    citedSourceTitles: claim.citedSourceTitles,
    citationsVerified: claim.citedSourceTitles.every((t) => validTitles.has(t)),
    grounding: grounded[i]?.grounding ?? { status: 'unavailable', confidence: null, method: 'unavailable', overlapScore: 0 },
    evidence: (grounded[i]?.sourceSpans ?? []).map((span) => ({ sourceTitle: sourceTitleAt(span.start), text: span.text })),
  }))
}

export async function generateAtlasPlan(
  mode: PlanMode,
  topicQuery: string,
  idea: { title?: string; problem_to_solve?: string; proposed_method?: string[] } | null,
  sources: PlanSourceInput[],
  instruction: string | null,
  referenceDoc?: { name: string; content: string } | null
): Promise<AtlasPlan> {
  if (!groq) {
    return { mode, contributionStatement: null, claims: [], methodAndDataPlan: null, threatsToValidity: [], outline: [], available: false }
  }

  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: buildPlanSystemPrompt(mode) },
      { role: 'user', content: buildPlanUserPrompt(topicQuery, idea, sources, instruction, referenceDoc) },
    ],
  })

  const raw = parseRawPlan(completion.choices[0]?.message?.content ?? '', mode)
  const claims = await groundPlanClaims(raw.claims, sources)

  return {
    mode,
    contributionStatement: raw.contributionStatement,
    claims,
    methodAndDataPlan: raw.methodAndDataPlan,
    threatsToValidity: raw.threatsToValidity,
    outline: raw.outline,
    available: true,
  }
}
