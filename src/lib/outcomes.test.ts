import { describe, it, expect } from 'vitest'
import {
  isOutcomeResult,
  parseOutcomeMetadata,
  serializeOutcomeMetadata,
  computeHypothesisStatus,
  computeHypothesisStatuses,
  collectMethodFailureModes,
  type GraphEntityLite,
  type GraphEdgeLite,
} from './outcomes'

describe('isOutcomeResult', () => {
  it('accepts every known result', () => {
    expect(isOutcomeResult('supported')).toBe(true)
    expect(isOutcomeResult('refuted')).toBe(true)
    expect(isOutcomeResult('inconclusive')).toBe(true)
    expect(isOutcomeResult('in_progress')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isOutcomeResult('bogus')).toBe(false)
    expect(isOutcomeResult(undefined)).toBe(false)
  })
})

describe('parseOutcomeMetadata / serializeOutcomeMetadata', () => {
  it('round-trips a full outcome', () => {
    const meta = { result: 'refuted' as const, failureMode: 'sample size too small', effect: 'none detected', conditions: 'n=12' }
    expect(parseOutcomeMetadata(serializeOutcomeMetadata(meta))).toEqual(meta)
  })

  it('returns null for malformed JSON', () => {
    expect(parseOutcomeMetadata('{not json')).toBeNull()
  })

  it('returns null when result is missing or invalid', () => {
    expect(parseOutcomeMetadata(JSON.stringify({ failureMode: 'x' }))).toBeNull()
    expect(parseOutcomeMetadata(JSON.stringify({ result: 'bogus' }))).toBeNull()
  })

  it('returns null for null/undefined input', () => {
    expect(parseOutcomeMetadata(null)).toBeNull()
    expect(parseOutcomeMetadata(undefined)).toBeNull()
  })
})

describe('computeHypothesisStatus', () => {
  it('is abandoned when a reason is set, regardless of outcomes', () => {
    expect(
      computeHypothesisStatus({ abandonedReason: 'ran out of funding', hasGroundedEvidence: true, outcomeResults: ['supported'] })
    ).toBe('abandoned')
  })

  it('is proposed with no outcomes and no grounded evidence', () => {
    expect(computeHypothesisStatus({ hasGroundedEvidence: false, outcomeResults: [] })).toBe('proposed')
  })

  it('is grounded with no outcomes but grounded evidence', () => {
    expect(computeHypothesisStatus({ hasGroundedEvidence: true, outcomeResults: [] })).toBe('grounded')
  })

  it('is under_test when any outcome is still in progress, even alongside finished ones', () => {
    expect(
      computeHypothesisStatus({ hasGroundedEvidence: false, outcomeResults: ['supported', 'in_progress'] })
    ).toBe('under_test')
  })

  it('a single refuted outcome outweighs any number of supporting ones', () => {
    expect(
      computeHypothesisStatus({ hasGroundedEvidence: false, outcomeResults: ['supported', 'supported', 'refuted'] })
    ).toBe('refuted')
  })

  it('is supported when outcomes exist and none refute it', () => {
    expect(computeHypothesisStatus({ hasGroundedEvidence: false, outcomeResults: ['supported', 'inconclusive'] })).toBe('supported')
  })

  it('is inconclusive when every finished outcome is inconclusive', () => {
    expect(computeHypothesisStatus({ hasGroundedEvidence: false, outcomeResults: ['inconclusive'] })).toBe('inconclusive')
  })
})

describe('computeHypothesisStatuses', () => {
  it('derives status for every hypothesis from tests/supports edges in the graph', () => {
    const entities: GraphEntityLite[] = [
      { id: 'h1', type: 'hypothesis', metadataJson: null },
      { id: 'h2', type: 'hypothesis', metadataJson: null },
      { id: 'o1', type: 'outcome', metadataJson: serializeOutcomeMetadata({ result: 'refuted', failureMode: null, effect: null, conditions: null }) },
      { id: 'e1', type: 'evidence', metadataJson: null, status: 'grounded' },
      { id: 't1', type: 'topic', metadataJson: null },
    ]
    const edges: GraphEdgeLite[] = [
      { id: 'edge-1', fromId: 'o1', toId: 'h1', type: 'tests' },
      { id: 'edge-2', fromId: 'e1', toId: 'h2', type: 'supports' },
    ]

    const statuses = computeHypothesisStatuses(entities, edges)
    expect(statuses.get('h1')).toBe('refuted')
    expect(statuses.get('h2')).toBe('grounded')
    expect(statuses.has('t1')).toBe(false)
  })

  it('an explicitly abandoned hypothesis stays abandoned even with a supporting outcome', () => {
    const entities: GraphEntityLite[] = [
      { id: 'h1', type: 'hypothesis', metadataJson: null, abandonedReason: 'team moved on' },
      { id: 'o1', type: 'outcome', metadataJson: serializeOutcomeMetadata({ result: 'supported', failureMode: null, effect: null, conditions: null }) },
    ]
    const edges: GraphEdgeLite[] = [{ id: 'edge-1', fromId: 'o1', toId: 'h1', type: 'tests' }]
    expect(computeHypothesisStatuses(entities, edges).get('h1')).toBe('abandoned')
  })
})

describe('collectMethodFailureModes', () => {
  it('collects failure modes from a hypothesis linked directly via uses_method', () => {
    const entities: GraphEntityLite[] = [
      { id: 'm1', type: 'method', metadataJson: null },
      { id: 'h1', type: 'hypothesis', metadataJson: null },
      { id: 'o1', type: 'outcome', metadataJson: serializeOutcomeMetadata({ result: 'refuted', failureMode: 'underpowered sample', effect: null, conditions: null }) },
    ]
    const edges: GraphEdgeLite[] = [
      { id: 'edge-1', fromId: 'h1', toId: 'm1', type: 'uses_method' },
      { id: 'edge-2', fromId: 'o1', toId: 'h1', type: 'tests' },
    ]
    expect(collectMethodFailureModes('m1', entities, edges)).toEqual(['underpowered sample'])
  })

  it('collects failure modes from a hypothesis reached via the method\'s topic (the syncJobGraph shape)', () => {
    const entities: GraphEntityLite[] = [
      { id: 'm1', type: 'method', metadataJson: null },
      { id: 't1', type: 'topic', metadataJson: null },
      { id: 'h1', type: 'hypothesis', metadataJson: null },
      { id: 'o1', type: 'outcome', metadataJson: serializeOutcomeMetadata({ result: 'refuted', failureMode: 'confound not controlled', effect: null, conditions: null }) },
    ]
    const edges: GraphEdgeLite[] = [
      { id: 'edge-1', fromId: 't1', toId: 'm1', type: 'uses_method' },
      { id: 'edge-2', fromId: 't1', toId: 'h1', type: 'motivates' },
      { id: 'edge-3', fromId: 'o1', toId: 'h1', type: 'tests' },
    ]
    expect(collectMethodFailureModes('m1', entities, edges)).toEqual(['confound not controlled'])
  })

  it('ignores supported/inconclusive outcomes and de-duplicates repeated failure modes', () => {
    const entities: GraphEntityLite[] = [
      { id: 'm1', type: 'method', metadataJson: null },
      { id: 'h1', type: 'hypothesis', metadataJson: null },
      { id: 'o1', type: 'outcome', metadataJson: serializeOutcomeMetadata({ result: 'refuted', failureMode: 'same cause', effect: null, conditions: null }) },
      { id: 'o2', type: 'outcome', metadataJson: serializeOutcomeMetadata({ result: 'refuted', failureMode: 'same cause', effect: null, conditions: null }) },
      { id: 'o3', type: 'outcome', metadataJson: serializeOutcomeMetadata({ result: 'supported', failureMode: null, effect: null, conditions: null }) },
    ]
    const edges: GraphEdgeLite[] = [
      { id: 'edge-1', fromId: 'h1', toId: 'm1', type: 'uses_method' },
      { id: 'edge-2', fromId: 'o1', toId: 'h1', type: 'tests' },
      { id: 'edge-3', fromId: 'o2', toId: 'h1', type: 'tests' },
      { id: 'edge-4', fromId: 'o3', toId: 'h1', type: 'tests' },
    ]
    expect(collectMethodFailureModes('m1', entities, edges)).toEqual(['same cause'])
  })

  it('returns nothing for a method with no linked hypotheses', () => {
    const entities: GraphEntityLite[] = [{ id: 'm1', type: 'method', metadataJson: null }]
    expect(collectMethodFailureModes('m1', entities, [])).toEqual([])
  })
})
