// #56/V3.0.3 — negative results. An 'outcome' entity (GraphEntity type
// 'outcome', added in #55) records that a hypothesis was actually tested:
// what happened, how it failed (if it did), the effect size, and under what
// conditions. Structured outcome fields live in GraphEntity.metadataJson
// (the same slot 'note' entities already use for noteType) rather than new
// columns — this is small, optional, per-entity-type data, not something
// every row needs.

export const OUTCOME_RESULTS = ['supported', 'refuted', 'inconclusive', 'in_progress'] as const
export type OutcomeResult = (typeof OUTCOME_RESULTS)[number]

export function isOutcomeResult(v: unknown): v is OutcomeResult {
  return typeof v === 'string' && (OUTCOME_RESULTS as readonly string[]).includes(v)
}

export interface OutcomeMetadata {
  result: OutcomeResult
  failureMode: string | null
  effect: string | null
  conditions: string | null
}

export function parseOutcomeMetadata(raw: string | null | undefined): OutcomeMetadata | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !isOutcomeResult((parsed as Record<string, unknown>).result)) return null
    const obj = parsed as Record<string, unknown>
    return {
      result: obj.result as OutcomeResult,
      failureMode: typeof obj.failureMode === 'string' ? obj.failureMode : null,
      effect: typeof obj.effect === 'string' ? obj.effect : null,
      conditions: typeof obj.conditions === 'string' ? obj.conditions : null,
    }
  } catch {
    return null
  }
}

export function serializeOutcomeMetadata(meta: OutcomeMetadata): string {
  return JSON.stringify(meta)
}

// 'proposed': no outcomes yet, no grounded evidence either — a bare idea.
// 'grounded': no outcomes yet, but has at least one grounded evidence link.
// 'under_test': has an in-progress outcome.
// 'supported' | 'refuted' | 'inconclusive': has at least one finished outcome.
// 'abandoned': explicitly abandoned (a stored reason), regardless of outcomes
// — this always wins, since it's a deliberate human decision, not a derived
// state.
export const HYPOTHESIS_STATUSES = [
  'proposed',
  'grounded',
  'under_test',
  'supported',
  'refuted',
  'inconclusive',
  'abandoned',
] as const
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number]

/**
 * Computes a hypothesis's status from its outcomes (#56/V3.0.3). A single
 * refuted outcome outweighs any number of supporting ones — negative results
 * should surface, not get averaged away — but an in-progress outcome always
 * takes precedence over a finished one, since the hypothesis is still being
 * actively tested.
 */
export function computeHypothesisStatus(opts: {
  abandonedReason?: string | null
  hasGroundedEvidence: boolean
  outcomeResults: OutcomeResult[]
}): HypothesisStatus {
  if (opts.abandonedReason) return 'abandoned'
  if (opts.outcomeResults.length === 0) return opts.hasGroundedEvidence ? 'grounded' : 'proposed'
  if (opts.outcomeResults.includes('in_progress')) return 'under_test'
  if (opts.outcomeResults.includes('refuted')) return 'refuted'
  if (opts.outcomeResults.includes('supported')) return 'supported'
  return 'inconclusive'
}

export interface GraphEntityLite {
  id: string
  type: string
  metadataJson: string | null
  abandonedReason?: string | null
  status?: string | null // verification status, e.g. 'grounded'
}

export interface GraphEdgeLite {
  id: string
  fromId: string
  toId: string
  type: string
}

/**
 * Derives every hypothesis's status from the in-memory graph (no extra
 * queries) — an outcome entity tests a hypothesis via a 'tests' edge
 * (outcome -> hypothesis); grounded evidence links via 'supports'
 * (evidence -> hypothesis, see #55).
 */
export function computeHypothesisStatuses(
  entities: GraphEntityLite[],
  edges: GraphEdgeLite[]
): Map<string, HypothesisStatus> {
  const byId = new Map(entities.map((e) => [e.id, e]))
  const statuses = new Map<string, HypothesisStatus>()

  for (const entity of entities) {
    if (entity.type !== 'hypothesis') continue
    const outcomeResults: OutcomeResult[] = []
    let hasGroundedEvidence = false

    for (const edge of edges) {
      if (edge.toId !== entity.id) continue
      if (edge.type === 'tests') {
        const meta = parseOutcomeMetadata(byId.get(edge.fromId)?.metadataJson ?? null)
        if (meta) outcomeResults.push(meta.result)
      } else if (edge.type === 'supports' && byId.get(edge.fromId)?.status === 'grounded') {
        hasGroundedEvidence = true
      }
    }

    statuses.set(
      entity.id,
      computeHypothesisStatus({ abandonedReason: entity.abandonedReason, hasGroundedEvidence, outcomeResults })
    )
  }

  return statuses
}

/**
 * Collects known failure modes for a method (#56/V3.0.3 task: "method pages
 * collect known failure modes from linked outcomes automatically"). Looks at
 * hypotheses connected to the method directly via 'uses_method', plus
 * hypotheses motivated by a topic the method is itself linked to (the shape
 * syncJobGraph actually produces — methods link to the run's topic, not
 * directly to its hypotheses). Returns the distinct failureMode strings from
 * every 'refuted' outcome testing one of those hypotheses.
 */
export function collectMethodFailureModes(methodId: string, entities: GraphEntityLite[], edges: GraphEdgeLite[]): string[] {
  const byId = new Map(entities.map((e) => [e.id, e]))
  const hypothesisIds = new Set<string>()
  const topicIds = new Set<string>()

  for (const edge of edges) {
    if (edge.type !== 'uses_method') continue
    const otherId = edge.fromId === methodId ? edge.toId : edge.toId === methodId ? edge.fromId : null
    if (!otherId) continue
    const other = byId.get(otherId)
    if (other?.type === 'hypothesis') hypothesisIds.add(otherId)
    else if (other?.type === 'topic') topicIds.add(otherId)
  }

  for (const edge of edges) {
    if (edge.type === 'motivates' && topicIds.has(edge.fromId) && byId.get(edge.toId)?.type === 'hypothesis') {
      hypothesisIds.add(edge.toId)
    }
  }

  const failureModes = new Set<string>()
  for (const edge of edges) {
    if (edge.type !== 'tests' || !hypothesisIds.has(edge.toId)) continue
    const meta = parseOutcomeMetadata(byId.get(edge.fromId)?.metadataJson ?? null)
    if (meta?.result === 'refuted' && meta.failureMode) failureModes.add(meta.failureMode)
  }

  return [...failureModes]
}
