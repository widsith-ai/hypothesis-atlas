// SPDX-License-Identifier: AGPL-3.0-only
import { buildPlanExportMarkdown, type AtlasPlan } from '@/lib/atlasPlanExport'

/**
 * #63 (V3.0.0.1): pure extraction logic for PaperReviewPanel.tsx's "current
 * draft" lookup, pulled out so it's testable without a DOM/localStorage.
 *
 * `ars-plan:*` was ARSPlanChat's cache (a chat message log — the component
 * is now deleted). `atlas-plan:*` is AtlasPlan's cache (a structured plan +
 * its Markdown export). The shapes are too different to rewrite one into
 * the other losslessly, so rather than a one-shot migration that could lose
 * data on a bug, PaperReviewPanel reads BOTH prefixes and keeps whichever
 * is newer — existing ars-plan drafts stay findable forever (read-only,
 * since nothing writes that prefix anymore), and new atlas-plan drafts are
 * found the same way. Either way, "users keep their drafts" holds.
 */

export interface ExtractedDraft {
  text: string
  savedAt: number
}

export function extractLegacyArsDraft(raw: string | null): ExtractedDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const messages: { role: string; content: string }[] = parsed.messages ?? []
    const assistantParts = messages.filter((m) => m.role === 'assistant' && m.content?.trim())
    if (assistantParts.length === 0) return null
    // Last assistant message is usually the full draft; prepend earlier substantial ones
    const last = assistantParts[assistantParts.length - 1].content.trim()
    const text =
      last.length >= 1500 || assistantParts.length === 1
        ? last
        : assistantParts.slice(-2).map((m) => m.content.trim()).join('\n\n')
    if (!text) return null
    return { text, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0 }
  } catch {
    return null
  }
}

/**
 * #64 (V3.0.0.2): AtlasPlan.tsx's cache stores the structured plan, not a
 * pre-built export (the export is now rebuilt client-side so edits don't
 * need a round trip) — this rebuilds the same way, with a placeholder title
 * since the cached entry doesn't carry the job's topic. The title line is
 * cosmetic; what the review panel needs is the claims/outline body below it.
 */
export function extractAtlasPlanDraft(raw: string | null): ExtractedDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const plan = parsed.plan as AtlasPlan | undefined
    const hasContent = !!(plan?.contributionStatement || plan?.claims?.length || plan?.outline?.length || plan?.methodAndDataPlan)
    if (!plan || !hasContent) return null
    const text = buildPlanExportMarkdown('Untitled', plan)
    return { text, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0 }
  } catch {
    return null
  }
}

export interface DraftCandidate extends ExtractedDraft {
  key: string
  prefix: string
}

export interface DraftInfo {
  label: string
  savedAt: number
  text: string
}

/** Pure selection: picks the newest candidate and derives its display label from the key. */
export function pickNewestDraft(candidates: DraftCandidate[]): DraftInfo | null {
  if (candidates.length === 0) return null
  const best = candidates.reduce((a, b) => (b.savedAt > a.savedAt ? b : a))
  const slug = best.key.slice(best.prefix.length)
  const label = slug.split('-').filter(Boolean).join(' ') || 'Write Paper session'
  return { label, savedAt: best.savedAt, text: best.text }
}
