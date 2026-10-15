import {
  sanitizeReviewInput,
  createPaperDocument,
  groundReviewClaims,
  verifyInlineCitations,
  type ReviewClaimInput,
  type GroundingStatus,
  type GroundingMethod,
  type ReferenceVerification,
} from './review-grounding'

export interface ClaimSource {
  id: string
  text: string
}

export interface ClaimPassage {
  sourceId: string
  start: number
  end: number
  text: string
}

export interface ClaimVerificationResult {
  status: GroundingStatus
  method: GroundingMethod
  confidence: number | null
  checkedAt: Date
  verifier: string
  passages: ClaimPassage[]
  referenceIssues: ReferenceVerification[]
}

export const CLAIM_VERIFIER_ID = 'verifyClaim/v1'

// Worst-first: a single contradicted sub-claim should flag the whole claim,
// even if its siblings are grounded. 'grounded' only wins when nothing else
// does.
const SEVERITY: GroundingStatus[] = ['contradicted', 'unsupported', 'unavailable', 'grounded']

function splitIntoClaims(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
  return sentences.length > 0 ? sentences : [text]
}

/**
 * The verification gate every claim written into the research graph should
 * pass through (#55/V3.0.2) — pulled out of review-grounding.ts's paper-review
 * pipeline so it can run against arbitrary source text, not just a PDF
 * with declared spans. Sanitizes the claim, splits it into single
 * sentence-level claims, checks any inline citations, and grounds each
 * sub-claim against the supplied sources via the same overlap/NLI/LLM-judge
 * cascade review-grounding.ts uses for paper reviews.
 *
 * Never throws and never signals "reject this claim" — callers always keep
 * the record and just badge it with the returned status (#55 task: "keep
 * claims that fail the check... never drop them").
 */
export async function verifyClaim(claimText: string, sources: ClaimSource[]): Promise<ClaimVerificationResult> {
  const sanitized = sanitizeReviewInput(claimText)
  const subClaims = splitIntoClaims(sanitized.text)
  const combinedText = sources.map((s) => s.text).filter(Boolean).join('\n')
  const document = createPaperDocument(combinedText)

  const [referenceIssues, grounded] = await Promise.all([
    verifyInlineCitations(sanitized.text),
    groundReviewClaims(
      subClaims.map((text): ReviewClaimInput => ({ category: 'question', kind: 'assertion', text, targetSpanIds: [] })),
      document
    ),
  ])

  if (grounded.length === 0) {
    return { status: 'unavailable', method: 'unavailable', confidence: null, checkedAt: new Date(), verifier: CLAIM_VERIFIER_ID, passages: [], referenceIssues }
  }

  const worst = [...grounded].sort(
    (a, b) => SEVERITY.indexOf(a.grounding.status) - SEVERITY.indexOf(b.grounding.status)
  )[0]

  const passages: ClaimPassage[] = []
  for (const span of worst.sourceSpans) {
    const source = sources.find((s) => s.text.includes(span.text))
    if (!source) continue
    const start = source.text.indexOf(span.text)
    passages.push({ sourceId: source.id, start, end: start + span.text.length, text: span.text })
  }

  return {
    status: worst.grounding.status,
    method: worst.grounding.method,
    confidence: worst.grounding.confidence,
    checkedAt: new Date(),
    verifier: CLAIM_VERIFIER_ID,
    passages,
    referenceIssues,
  }
}
