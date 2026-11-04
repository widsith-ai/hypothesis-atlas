// SPDX-License-Identifier: AGPL-3.0-only

import { getLLM } from './llm'
import { openai, OPENAI_MODEL } from './openai'
import { fetchTopicPapers, type FetchedPaper } from './fetchTopicPapers'

/**
 * Bold Idea's multi-agent pipeline — see the "Bold Idea: multi-agent
 * exploration + cross-model verification" issue for the design and the
 * research it's based on (Google's AI Co-Scientist's Generation/Reflection
 * split, heterogeneous-model debate findings that cross-model critique
 * surfaces more genuine disagreement than same-model self-critique, and
 * agentic literature search as a multi-step process rather than one search
 * call).
 *
 * No evidence-mapping Job is created here — this pipeline is Bold Idea's
 * own, lightweight result: candidate directions, the papers found for them
 * (each with a per-paper method/summary/gap extraction, not a full
 * Knowledge Tree node), and an overall summary/gaps/next-steps synthesis.
 *
 * Three agents, two model providers, one bounded pass (v0 — no tournament
 * ranking, no iterative evolution, no multi-round debate):
 *   1. Explorer (Groq)     — idea exploration: 2-4 candidate directions.
 *   2. Literature Agent    — searching: grounds each candidate in real
 *      papers via the *existing* fetchTopicPapers (OpenAlex + PubMed).
 *   3. Critic (OpenAI)     — validating: a genuinely different model from
 *      the Explorer gives a verdict per candidate, plus an overall
 *      summary/gaps/next-steps synthesis in the same call.
 *   4. Paper Analyzer (Groq) — a per-paper method/summary/gap extraction
 *      from each paper's abstract, for the hover-card UI (not chat text).
 *
 * This is a confidence signal from LLM-as-judge machinery, not a proof —
 * same caveat as this app's other verification features (math/physics/
 * chemistry), just not restated in every chat message (kept terse by
 * request — it's read in a chat window, not a report).
 *
 * Chat text is real Markdown: AssistantChat renders message content through
 * ChatMarkdown (headings, bold, bullet lists, "---" rules, plus KaTeX for
 * $math$), not the plain-prose-with-emoji workaround an earlier version of
 * this file used back when the chat only rendered LaTeX. Paper titles/links
 * still live in real React (the session page's tree of candidate -> paper
 * nodes, mirroring KnowledgeTree's parent/child layout) rather than being
 * interpolated into the chat text as Markdown links.
 */

export interface AgentCandidate {
  title: string
  rationale: string
}

interface GroundedCandidate extends AgentCandidate {
  papers: FetchedPaper[]
}

export type CriticVerdict = 'well-supported' | 'speculative' | 'contradicted'

export interface PaperAnalysis {
  title: string
  url: string
  year: string
  method: string
  summary: string
  gap: string
}

export interface CandidateVerdict {
  title: string
  rationale: string
  verdict: CriticVerdict
  critique: string
  /** This candidate's own papers, analyzed — the tree's child nodes under this candidate (see the session page's PaperTree, which mirrors KnowledgeTree's parent/child node layout). Looked up from the single deduplicated analyzePapers() pass below, not a second LLM call per candidate. */
  papers: PaperAnalysis[]
}

export interface BoldIdeaAgentTrace {
  candidates: CandidateVerdict[]
  /** All analyzed papers, deduplicated across candidates — used to ground the session chat; the UI tree renders papers per-candidate via candidates[].papers instead. */
  papers: PaperAnalysis[]
  overallSummary: string
  gaps: string
  nextSteps: string
  /** Plain-text synthesis built from the three fields above, for the chat's opening message. */
  chatSummary: string
}

const MAX_CANDIDATES = 4
const PAPERS_PER_CANDIDATE = 3
const MAX_PAPERS_TO_ANALYZE = 10

/** Explorer agent (Groq): idea exploration — candidate research directions, not literature-grounded yet. */
async function explore(text: string, tags: string[]): Promise<AgentCandidate[]> {
  const llm = getLLM()
  if (!llm) return []
  try {
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content:
            `You are a research exploration agent. Given a research idea (tagged as: ${tags.join(', ')}), ` +
            `propose ${MAX_CANDIDATES} distinct, concrete research directions it could branch into — not ` +
            'restatements of the same idea, genuinely different angles (e.g. a mechanism question, a ' +
            'clinical/applied question, a methods question, a comparative question). Respond with ONLY ' +
            'JSON: {"candidates":[{"title":"short direction name","rationale":"1-2 sentences why this ' +
            'is a distinct, worthwhile direction"}]}.',
        },
        { role: 'user', content: text },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return []
    const parsed = JSON.parse(match[0]) as { candidates?: AgentCandidate[] }
    return (parsed.candidates ?? []).slice(0, MAX_CANDIDATES).filter((c) => c.title && c.rationale)
  } catch {
    return []
  }
}

/** Literature agent: searching — grounds each candidate via the existing fetchTopicPapers, not a new pipeline. */
async function ground(candidates: AgentCandidate[]): Promise<GroundedCandidate[]> {
  return Promise.all(
    candidates.map(async (candidate) => {
      let papers: FetchedPaper[] = []
      try {
        papers = await fetchTopicPapers(candidate.title, PAPERS_PER_CANDIDATE)
      } catch {
        papers = []
      }
      return { ...candidate, papers }
    })
  )
}

interface CriticResponse {
  verdicts?: { index: number; verdict: string; critique: string }[]
  overallSummary?: string
  gaps?: string
  nextSteps?: string
}

/**
 * Critic agent (OpenAI — deliberately the *other* model provider from
 * the Explorer's Groq call): validating — reviews each grounded candidate
 * and gives a verdict, plus one overall summary/gaps/next-steps synthesis
 * covering the exploration as a whole. One call for everything, not one
 * call per candidate and a separate synthesis call — keeps this a single
 * bounded pass, not an open-ended multi-round debate.
 */
type VerdictOnly = Omit<CandidateVerdict, 'papers'>

async function critique(candidates: GroundedCandidate[], ideaText: string): Promise<{
  verdicts: VerdictOnly[]
  overallSummary: string
  gaps: string
  nextSteps: string
}> {
  const fallback = {
    verdicts: candidates.map((c) => ({
      title: c.title,
      rationale: c.rationale,
      verdict: 'speculative' as const,
      critique: 'Critic unavailable.',
    })),
    overallSummary: `Explored "${ideaText}" across ${candidates.length} direction(s).`,
    gaps: 'Critic model unavailable — gaps could not be assessed.',
    nextSteps: 'Try again once the critic model is reachable.',
  }
  if (!openai || candidates.length === 0) return fallback

  try {
    const candidateBlock = candidates
      .map(
        (c, i) =>
          `${i + 1}. "${c.title}" — ${c.rationale}\n   Papers found: ${
            c.papers.length > 0
              ? c.papers.map((p) => `"${p.title}" (${p.year}): ${(p.abstract ?? '').slice(0, 200)}`).join(' | ')
              : 'none'
          }`
      )
      .join('\n')
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content:
            `You are an independent research critic reviewing candidate directions for the idea "${ideaText}", ` +
            'each proposed by another model and each with papers found for it by a separate search step. ' +
            'Be skeptical: a paper merely sharing keywords with a candidate is not support. ' +
            'Do two things: ' +
            '(1) For each candidate, give a verdict — "well-supported" (the papers genuinely back the ' +
            'direction), "speculative" (no strong papers either way, not unreasonable), or "contradicted" ' +
            '(the papers undercut the premise) — plus a critique of no more than 15 words. ' +
            '(2) Write a short overall synthesis of the exploration as a whole: a 1-2 sentence summary, a ' +
            'single sentence naming the biggest gap across the directions (what is under-evidenced or ' +
            'missing), and 1-2 short concrete next steps that could close that gap (e.g. a narrower ' +
            'search, a specific study design, a different database). Be terse throughout — this is read in a ' +
            'chat window, not a report. ' +
            'Respond with ONLY JSON: {"verdicts":[{"index":1,"verdict":"well-supported","critique":"..."}],' +
            '"overallSummary":"...","gaps":"...","nextSteps":"..."}.',
        },
        { role: 'user', content: candidateBlock },
      ],
    })
    const text = completion.choices[0]?.message?.content ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    const parsed: CriticResponse | null = match ? JSON.parse(match[0]) : null
    if (!parsed) return fallback

    const byIndex = new Map((parsed.verdicts ?? []).map((v) => [v.index, v]))
    const verdicts: VerdictOnly[] = candidates.map((c, i) => {
      const v = byIndex.get(i + 1)
      const verdict: CriticVerdict =
        v?.verdict === 'well-supported' || v?.verdict === 'contradicted' ? v.verdict : 'speculative'
      return { title: c.title, rationale: c.rationale, verdict, critique: v?.critique ?? 'No critique returned.' }
    })
    return {
      verdicts,
      overallSummary: parsed.overallSummary ?? fallback.overallSummary,
      gaps: parsed.gaps ?? fallback.gaps,
      nextSteps: parsed.nextSteps ?? fallback.nextSteps,
    }
  } catch {
    return fallback
  }
}

/**
 * Paper Analyzer (Groq): a lightweight per-paper method/summary/gap
 * extraction from each paper's abstract — this is what the hover cards
 * show, deliberately not a full Knowledge Tree node (no evidence-mapping
 * Job is created for a bold idea). Deduplicated by URL and capped before
 * calling the model, since the same paper can surface under more than one
 * candidate's search.
 */
async function analyzePapers(candidates: GroundedCandidate[]): Promise<PaperAnalysis[]> {
  const byUrl = new Map<string, FetchedPaper>()
  for (const c of candidates) {
    for (const p of c.papers) {
      if (p.url && !byUrl.has(p.url)) byUrl.set(p.url, p)
    }
  }
  const papers = Array.from(byUrl.values()).slice(0, MAX_PAPERS_TO_ANALYZE)
  if (papers.length === 0) return []
  const llm = getLLM()
  if (!llm) {
    return papers.map((p) => ({
      title: p.title,
      url: p.url,
      year: p.year,
      method: 'Unavailable',
      summary: p.abstract?.slice(0, 200) ?? 'No abstract available.',
      gap: 'Unavailable',
    }))
  }


  try {
    const paperBlock = papers
      .map((p, i) => `${i + 1}. "${p.title}" (${p.year})\nAbstract: ${(p.abstract ?? 'No abstract available.').slice(0, 600)}`)
      .join('\n\n')
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      temperature: 0.1,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content:
            'For each paper below, extract from its abstract: "method" (the approach/technique used, one ' +
            'short phrase), "summary" (1 sentence, the main finding), and "gap" (1 sentence, what this ' +
            "paper does NOT address or leaves open — its own stated limitation if given, otherwise what's " +
            'missing relative to a broader research question). If the abstract is missing or uninformative, ' +
            'say so plainly rather than guessing. Respond with ONLY JSON: {"analyses":[{"index":1,' +
            '"method":"...","summary":"...","gap":"..."}]}.',
        },
        { role: 'user', content: paperBlock },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? (JSON.parse(match[0]) as { analyses?: { index: number; method: string; summary: string; gap: string }[] }) : null
    const byIndex = new Map((parsed?.analyses ?? []).map((a) => [a.index, a]))
    return papers.map((p, i) => {
      const a = byIndex.get(i + 1)
      return {
        title: p.title,
        url: p.url,
        year: p.year,
        method: a?.method ?? 'Not extracted',
        summary: a?.summary ?? p.abstract?.slice(0, 200) ?? 'No abstract available.',
        gap: a?.gap ?? 'Not extracted',
      }
    })
  } catch {
    return papers.map((p) => ({
      title: p.title,
      url: p.url,
      year: p.year,
      method: 'Analysis failed',
      summary: p.abstract?.slice(0, 200) ?? 'No abstract available.',
      gap: 'Analysis failed',
    }))
  }
}

const VERDICT_MARK: Record<CriticVerdict, string> = {
  'well-supported': '✅',
  speculative: '🤔',
  contradicted: '❌',
}

/**
 * Real Markdown — AssistantChat renders it through ChatMarkdown
 * (src/components/ChatMarkdown.tsx): headings, bold, bullet lists, and
 * "---" rules, so each section reads as its own clearly separated block
 * instead of a wall of prose. Kept short on purpose: this is a landing
 * point for the session, not the full result — the candidate/paper tree
 * on the right carries the detail.
 */
function renderChatSummary(
  verdicts: CandidateVerdict[],
  overallSummary: string,
  gaps: string,
  nextSteps: string
): string {
  const candidateLines = verdicts
    .map((v) => `- ${VERDICT_MARK[v.verdict]} **${v.title}** — ${v.critique}`)
    .join('\n')
  return (
    `## Summary\n${overallSummary}\n\n` +
    `---\n\n` +
    `## Directions explored\n${candidateLines}\n\n` +
    `---\n\n` +
    `## Gap\n${gaps}\n\n` +
    `---\n\n` +
    `## What you can still do\n${nextSteps}`
  )
}

export async function runBoldIdeaAgents(text: string, tags: string[]): Promise<BoldIdeaAgentTrace> {
  const explored = await explore(text, tags)
  const grounded = await ground(explored)
  const [{ verdicts, overallSummary, gaps, nextSteps }, papers] = await Promise.all([
    critique(grounded, text),
    analyzePapers(grounded),
  ])

  const paperByUrl = new Map(papers.map((p) => [p.url, p]))
  const candidates: CandidateVerdict[] = verdicts.map((v, i) => ({
    ...v,
    papers: grounded[i].papers.map((p) => paperByUrl.get(p.url)).filter((p): p is PaperAnalysis => !!p),
  }))

  return {
    candidates,
    papers,
    overallSummary,
    gaps,
    nextSteps,
    chatSummary: renderChatSummary(candidates, overallSummary, gaps, nextSteps),
  }
}

export interface ExperimentDesign {
  /** Which candidate direction this was designed for — the session page keys its "Experiment" card off this, not a separate id. */
  candidateTitle: string
  /** Real Markdown (## headings, **bold**, lists) — rendered the same way as chatSummary, via ChatMarkdown. */
  markdown: string
}

/**
 * Second-phase generation: once the researcher has picked a direction out
 * of the information-finding phase (the candidate/paper tree), design a
 * concrete experiment for it. One bounded Groq call, grounded in the
 * candidate's own rationale, critique, and papers — not a restatement of
 * the information-finding step, a distinct next phase the session page
 * surfaces as its own collapsible "Experiment" card once requested.
 *
 * Mirrors the experiment-persona system prompt already used by the regular
 * Job pipeline's assistant chat (see /api/jobs/[id]/assistant-chat's
 * `isExperiment` branch) — same structure (Hypothesis/Variables/Method/
 * Baselines/Metrics/Expected results), adapted to ground in a Bold Idea's
 * own candidate + papers instead of a Job's stored sources/ideas.
 */
export async function generateExperiment(ideaText: string, candidate: CandidateVerdict): Promise<ExperimentDesign> {
  const fallbackMarkdown =
    `## Hypothesis\nExperiment design is unavailable right now (Groq is unreachable). Try again shortly.`
  const llm = getLLM()
  if (!llm) return { candidateTitle: candidate.title, markdown: fallbackMarkdown }

  try {
    // Candidates from before CandidateVerdict carried a `papers` field (see
    // the session page's same fallback) may still have it undefined here.
    const papers = candidate.papers ?? []
    const paperBlock =
      papers.length > 0
        ? papers.map((p) => `- "${p.title}" (${p.year}) — Method: ${p.method}; Gap: ${p.gap}`).join('\n')
        : 'None found during information-finding.'

    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content:
            'You are an experiment designer. Given a research idea, one candidate direction chosen out of a ' +
            "prior literature-exploration phase, that direction's critique from an independent reviewer, and " +
            'the papers found for it, design a concrete, runnable experiment. Ground every suggestion in the ' +
            'papers given — cite them by name — rather than inventing unrelated methods. Respond with ONLY ' +
            'Markdown (no commentary before or after), structured as:\n' +
            '## Hypothesis\nThe precise, falsifiable claim being tested (1-2 sentences).\n\n' +
            '## Variables\nIndependent, dependent, and controlled, as a bullet list with concrete values.\n\n' +
            '## Method\nThe concrete procedure, grounded in the papers above where possible.\n\n' +
            '## Baselines\nComparison methods from the papers, as a bullet list, with the numbers they report ' +
            'if given.\n\n' +
            '## Metrics\nWhat to measure and why — bullet list.\n\n' +
            '## Expected results\n1-2 concrete, quantitative predictions, or an honest statement that the ' +
            'papers found do not support a quantitative prediction. Be terse throughout — this is read in a ' +
            'chat-adjacent panel, not a full report.',
        },
        {
          role: 'user',
          content:
            `Idea: ${ideaText}\n\nChosen direction: "${candidate.title}" — ${candidate.rationale}\n\n` +
            `Reviewer critique (${candidate.verdict}): ${candidate.critique}\n\nPapers found:\n${paperBlock}`,
        },
      ],
    })
    const markdown = completion.choices[0]?.message?.content?.trim()
    return { candidateTitle: candidate.title, markdown: markdown || fallbackMarkdown }
  } catch {
    return { candidateTitle: candidate.title, markdown: fallbackMarkdown }
  }
}
