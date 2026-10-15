import { createHash } from 'crypto'
import { prisma } from './prisma'
import { emitProgressEvent } from './events'
import { resolveWorkspaceId } from './graphAccess'
import { verifyClaim, type ClaimSource, type ClaimVerificationResult } from './claimVerification'

export const ENTITY_TYPES = ['topic', 'hypothesis', 'method', 'evidence', 'gap', 'note', 'outcome', 'dataset'] as const
export const EDGE_TYPES = [
  'motivates',
  'supports',
  'uses_method',
  'contradicts',
  'reveals',
  'related_to',
  'notes_on',
  'tests',
  'uses_dataset',
  'derived_from',
  'transferred_from',
  'replicates',
] as const

export type EntityType = (typeof ENTITY_TYPES)[number]
export type EdgeType = (typeof EDGE_TYPES)[number]

// #55/V3.0.2: coarse "who/what wrote this" stamp for everything syncJobGraph
// produces. A full per-agent identity (model, version, tool calls) is #58's
// job — this just distinguishes agent-written records from human-written ones.
const SYNC_PRODUCER = 'research-agent'

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v)
}

export function isEdgeType(v: unknown): v is EdgeType {
  return typeof v === 'string' && (EDGE_TYPES as readonly string[]).includes(v)
}

// Entities are keyed by (type, normalized label) so the same concept discovered
// in different runs converges onto one node instead of duplicating.
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
}

function globalSyncKey(type: EntityType, label: string): string {
  return `g:${type}:${normalizeLabel(label)}`
}

function computeContentHash(type: string, label: string, content: string | null): string {
  return createHash('sha256').update(`${type}\u0000${label}\u0000${content ?? ''}`).digest('hex')
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x) => typeof x === 'string' && x.trim().length > 0)
      .map((x) => (x as string).trim())
  } catch {
    return []
  }
}

type VerificationStamp = Pick<ClaimVerificationResult, 'status' | 'method' | 'confidence' | 'checkedAt' | 'verifier'>

function verificationFieldsOf(verification: VerificationStamp | null | undefined): Record<string, unknown> {
  if (!verification) return {}
  return {
    status: verification.status,
    method: verification.method,
    confidence: verification.confidence,
    checkedAt: verification.checkedAt,
    verifier: verification.verifier,
  }
}

interface UpsertEntityOpts {
  type: EntityType
  label: string
  content?: string | null
  jobId?: string | null
  syncKey: string
  workspaceId: string
  producer?: string | null
  domain?: string | null
  supersedes?: string | null
  verification?: VerificationStamp | null
}

// Upsert keyed on (workspaceId, syncKey) — #54/V3.0.1: syncKey alone used to
// be globally unique, so two users' entities with the same label collided
// into one record. System-origin entities get refreshed; user-edited ones
// (origin flipped to 'user') are left untouched so edits survive re-syncs.
async function upsertEntity(opts: UpsertEntityOpts) {
  const label = opts.label.trim().slice(0, 200)
  if (!label) return null
  const content = opts.content?.trim().slice(0, 4000) || null
  const contentHash = computeContentHash(opts.type, label, content)
  const verificationFields = verificationFieldsOf(opts.verification)

  const existing = await prisma.graphEntity.findUnique({
    where: { workspaceId_syncKey: { workspaceId: opts.workspaceId, syncKey: opts.syncKey } },
  })
  if (existing) {
    if (existing.origin !== 'system') return existing
    const data: Record<string, unknown> = { ...verificationFields }
    if (existing.label !== label || existing.content !== content) {
      data.label = label
      data.content = content
      data.contentHash = contentHash
    }
    if (Object.keys(data).length === 0) return existing
    return prisma.graphEntity.update({ where: { id: existing.id }, data })
  }

  return prisma.graphEntity.create({
    data: {
      type: opts.type,
      label,
      content,
      jobId: opts.jobId ?? null,
      origin: 'system',
      syncKey: opts.syncKey,
      workspaceId: opts.workspaceId,
      contentHash,
      producer: opts.producer ?? null,
      domain: opts.domain ?? null,
      supersedes: opts.supersedes ?? null,
      ...verificationFields,
    },
  })
}

interface UpsertEdgeOpts {
  producer?: string | null
  verification?: VerificationStamp | null
}

async function upsertEdge(
  fromId: string,
  toId: string,
  type: EdgeType,
  workspaceId: string,
  jobId?: string | null,
  opts?: UpsertEdgeOpts
) {
  if (fromId === toId) return
  const verificationFields = verificationFieldsOf(opts?.verification)
  await prisma.graphEdge.upsert({
    where: { fromId_toId_type: { fromId, toId, type } },
    update: verificationFields,
    create: {
      fromId,
      toId,
      type,
      jobId: jobId ?? null,
      origin: 'system',
      workspaceId,
      producer: opts?.producer ?? null,
      ...verificationFields,
    },
  })
}

async function linkSources(
  entityId: string,
  sourceIds: string[],
  role: 'supporting' | 'contradicting' = 'supporting',
  passages?: Map<string, { start: number; end: number; text: string }>
) {
  for (const sourceId of sourceIds) {
    const passage = passages?.get(sourceId)
    const passageFields = passage ? { start: passage.start, end: passage.end, text: passage.text } : {}
    await prisma.entitySource.upsert({
      where: { entityId_sourceId: { entityId, sourceId } },
      update: { role, ...passageFields },
      create: { entityId, sourceId, role, ...passageFields },
    })
  }
}

function passageMap(verification: ClaimVerificationResult): Map<string, { start: number; end: number; text: string }> {
  const map = new Map<string, { start: number; end: number; text: string }>()
  for (const p of verification.passages) map.set(p.sourceId, { start: p.start, end: p.end, text: p.text })
  return map
}

/**
 * Maps a completed run's knowledge tree into the persistent research graph:
 * root node -> topic, child nodes -> hypotheses, findings -> evidence,
 * methods -> methods, open problems -> gaps, disagreements -> contradicting evidence.
 * Node->Source links are preserved as EntitySource provenance. Idempotent via
 * label-based global syncKeys, so concepts found in different runs converge to
 * one entity; a dedupe pass at the end folds in any stragglers.
 *
 * #55/V3.0.2: every evidence/counter-evidence claim is run through
 * verifyClaim() against its node's linked sources before being written —
 * failing claims are still written (never dropped), just badged with their
 * verification status so the graph can show them as unsupported/contradicted.
 */
export async function syncJobGraph(jobId: string): Promise<{ entities: number; edges: number }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, topicQuery: true, rootNodeId: true, userId: true },
  })
  if (!job) return { entities: 0, edges: 0 }
  const workspaceId = resolveWorkspaceId(job.userId)

  const nodes = await prisma.node.findMany({
    where: { jobId },
    include: {
      nodeSources: {
        select: { sourceId: true, role: true, source: { select: { title: true, snippet: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (nodes.length === 0) return { entities: 0, edges: 0 }

  const rootNode = nodes.find((n) => n.id === job.rootNodeId) ?? nodes.find((n) => n.depth === 0) ?? nodes[0]
  const children = nodes.filter((n) => n.id !== rootNode.id)

  const entityIds = new Set<string>()
  let edgeCount = 0

  const track = (e: { id: string } | null) => {
    if (e) entityIds.add(e.id)
    return e
  }

  // Root -> topic entity
  const topicEntity = track(
    await upsertEntity({
      type: 'topic',
      label: rootNode.label,
      content: rootNode.summary,
      jobId,
      workspaceId,
      syncKey: globalSyncKey('topic', rootNode.label),
      producer: SYNC_PRODUCER,
    })
  )

  const sourceIdsFor = (node: (typeof nodes)[number]) => node.nodeSources.map((ns) => ns.sourceId)
  const claimSourcesFor = (node: (typeof nodes)[number]): ClaimSource[] =>
    node.nodeSources.map((ns) => ({
      id: ns.sourceId,
      text: [ns.source.title, ns.source.snippet].filter(Boolean).join('. '),
    }))

  if (topicEntity) {
    await linkSources(topicEntity.id, sourceIdsFor(rootNode))
  }

  // Root-level methods / findings / gaps / disagreements
  const rootMethods = parseJsonArray(rootNode.methodsJson)
  const rootFindings = parseJsonArray(rootNode.findingsJson)
  const rootGaps = parseJsonArray(rootNode.openProblemsJson)
  const rootDisagreements = parseJsonArray(rootNode.disagreementsJson)
  const rootClaimSources = claimSourcesFor(rootNode)

  if (topicEntity) {
    for (let i = 0; i < rootMethods.length; i++) {
      const method = track(
        await upsertEntity({
          type: 'method',
          label: rootMethods[i],
          content: null,
          jobId,
          workspaceId,
          syncKey: globalSyncKey('method', rootMethods[i]),
          producer: SYNC_PRODUCER,
        })
      )
      if (method) {
        await upsertEdge(topicEntity.id, method.id, 'uses_method', workspaceId, jobId, { producer: SYNC_PRODUCER })
        edgeCount++
      }
    }

    for (let i = 0; i < rootFindings.length; i++) {
      const verification = await verifyClaim(rootFindings[i], rootClaimSources)
      const evidence = track(
        await upsertEntity({
          type: 'evidence',
          label: rootFindings[i],
          content: null,
          jobId,
          workspaceId,
          syncKey: globalSyncKey('evidence', rootFindings[i]),
          producer: SYNC_PRODUCER,
          verification,
        })
      )
      if (evidence) {
        await upsertEdge(evidence.id, topicEntity.id, 'supports', workspaceId, jobId, { producer: SYNC_PRODUCER, verification })
        await linkSources(evidence.id, sourceIdsFor(rootNode), 'supporting', passageMap(verification))
        edgeCount++
      }
    }

    for (let i = 0; i < rootGaps.length; i++) {
      const gap = track(
        await upsertEntity({
          type: 'gap',
          label: rootGaps[i],
          content: null,
          jobId,
          workspaceId,
          syncKey: globalSyncKey('gap', rootGaps[i]),
          producer: SYNC_PRODUCER,
        })
      )
      if (gap) {
        await upsertEdge(topicEntity.id, gap.id, 'reveals', workspaceId, jobId, { producer: SYNC_PRODUCER })
        edgeCount++
      }
    }

    for (let i = 0; i < rootDisagreements.length; i++) {
      const verification = await verifyClaim(rootDisagreements[i], rootClaimSources)
      const counter = track(
        await upsertEntity({
          type: 'evidence',
          label: rootDisagreements[i],
          content: null,
          jobId,
          workspaceId,
          syncKey: globalSyncKey('evidence', rootDisagreements[i]),
          producer: SYNC_PRODUCER,
          verification,
        })
      )
      if (counter) {
        await upsertEdge(counter.id, topicEntity.id, 'contradicts', workspaceId, jobId, { producer: SYNC_PRODUCER, verification })
        await linkSources(counter.id, sourceIdsFor(rootNode), 'contradicting', passageMap(verification))
        edgeCount++
      }
    }
  }

  // Child nodes -> hypotheses under the topic
  for (const child of children) {
    const hypothesis = track(
      await upsertEntity({
        type: 'hypothesis',
        label: child.label,
        content: child.summary,
        jobId,
        workspaceId,
        syncKey: globalSyncKey('hypothesis', child.label),
        producer: SYNC_PRODUCER,
      })
    )
    if (!hypothesis) continue

    if (topicEntity) {
      await upsertEdge(topicEntity.id, hypothesis.id, 'motivates', workspaceId, jobId, { producer: SYNC_PRODUCER })
      edgeCount++
    }
    await linkSources(hypothesis.id, sourceIdsFor(child))

    const childClaimSources = claimSourcesFor(child)
    const findings = parseJsonArray(child.findingsJson)
    for (let i = 0; i < findings.length; i++) {
      const verification = await verifyClaim(findings[i], childClaimSources)
      const evidence = track(
        await upsertEntity({
          type: 'evidence',
          label: findings[i],
          content: null,
          jobId,
          workspaceId,
          syncKey: globalSyncKey('evidence', findings[i]),
          producer: SYNC_PRODUCER,
          verification,
        })
      )
      if (evidence) {
        await upsertEdge(evidence.id, hypothesis.id, 'supports', workspaceId, jobId, { producer: SYNC_PRODUCER, verification })
        await linkSources(evidence.id, sourceIdsFor(child), 'supporting', passageMap(verification))
        edgeCount++
      }
    }

    const gaps = parseJsonArray(child.openProblemsJson)
    for (let i = 0; i < gaps.length; i++) {
      const gap = track(
        await upsertEntity({
          type: 'gap',
          label: gaps[i],
          content: null,
          jobId,
          workspaceId,
          syncKey: globalSyncKey('gap', gaps[i]),
          producer: SYNC_PRODUCER,
        })
      )
      if (gap) {
        await upsertEdge(hypothesis.id, gap.id, 'reveals', workspaceId, jobId, { producer: SYNC_PRODUCER })
        edgeCount++
      }
    }

    const disagreements = parseJsonArray(child.disagreementsJson)
    for (let i = 0; i < disagreements.length; i++) {
      const verification = await verifyClaim(disagreements[i], childClaimSources)
      const counter = track(
        await upsertEntity({
          type: 'evidence',
          label: disagreements[i],
          content: null,
          jobId,
          workspaceId,
          syncKey: globalSyncKey('evidence', disagreements[i]),
          producer: SYNC_PRODUCER,
          verification,
        })
      )
      if (counter) {
        await upsertEdge(counter.id, hypothesis.id, 'contradicts', workspaceId, jobId, { producer: SYNC_PRODUCER, verification })
        await linkSources(counter.id, sourceIdsFor(child), 'contradicting', passageMap(verification))
        edgeCount++
      }
    }
  }

  const dedupe = await dedupeGraph(workspaceId)

  await emitProgressEvent({
    jobId,
    stage: 'research_graph',
    status: 'completed',
    message: `Research graph updated — ${entityIds.size} entities, ${edgeCount} edges persisted across runs${
      dedupe.merged > 0 ? ` · ${dedupe.merged} duplicates merged` : ''
    }`,
    timestamp: Date.now(),
  })

  return { entities: entityIds.size, edges: edgeCount }
}

interface DedupeCandidate {
  id: string
  type: string
  label: string
  content: string | null
  origin: string
  pinned: boolean
  syncKey: string | null
  workspaceId: string
  createdAt: Date
}

/**
 * Collapses entities that share (workspace, type, normalized label) into a
 * single node: edges and source links are re-pointed to the canonical
 * entity, duplicates are deleted (cascades clean up their originals). Notes
 * are exempt — they are timestamped session memory, not concepts. Groups
 * made up purely of user-created entities are left alone (deliberate
 * duplicates). Also rewrites syncKeys to the global label-based scheme so
 * pre-existing per-job entities converge on the next sync. Idempotent.
 *
 * #54/V3.0.1: the grouping key always includes workspaceId — two different
 * workspaces' entities sharing a label must never merge into one, even when
 * `workspaceId` is omitted and this scans every workspace (the `syncJobGraph`
 * caller always scopes to its own workspace via the `workspaceId` param;
 * an unscoped call is for maintenance/admin use, not exposed to any route).
 */
export async function dedupeGraph(workspaceId?: string): Promise<{
  normalized: number
  groups: number
  merged: number
}> {
  const entities = await prisma.graphEntity.findMany({
    where: workspaceId ? { workspaceId } : undefined,
    select: {
      id: true,
      type: true,
      label: true,
      content: true,
      origin: true,
      pinned: true,
      syncKey: true,
      workspaceId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const groups = new Map<string, DedupeCandidate[]>()
  for (const e of entities) {
    if (e.type === 'note') continue
    const key = `${e.workspaceId}:${e.type}:${normalizeLabel(e.label)}`
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }

  let normalized = 0
  let groupsMerged = 0
  let merged = 0

  for (const list of groups.values()) {
    if (list.length === 1) {
      const only = list[0]
      const globalKey = globalSyncKey(only.type as EntityType, only.label)
      if (only.syncKey !== globalKey) {
        try {
          await prisma.graphEntity.update({ where: { id: only.id }, data: { syncKey: globalKey } })
          normalized++
        } catch {
          // Stale-key collision from a since-renamed entity — leave as-is.
        }
      }
      continue
    }

    if (!list.some((e) => e.origin === 'system')) continue

    groupsMerged++
    // User-origin wins so manual edits survive future syncs; then oldest.
    const canonical = [...list].sort(
      (a, b) => (a.origin === 'user' ? 0 : 1) - (b.origin === 'user' ? 0 : 1)
    )[0]
    const dupes = list.filter((e) => e.id !== canonical.id)
    const idMap = new Map(dupes.map((d) => [d.id, canonical.id]))
    const dupeIds = dupes.map((d) => d.id)

    const content = canonical.content ?? dupes.find((d) => d.content)?.content ?? null
    const pinned = canonical.pinned || dupes.some((d) => d.pinned)
    const syncKey = globalSyncKey(canonical.type as EntityType, canonical.label)

    try {
      await prisma.graphEntity.update({ where: { id: canonical.id }, data: { content, pinned, syncKey } })
    } catch {
      await prisma.graphEntity.update({ where: { id: canonical.id }, data: { content, pinned } })
    }

    const edges = await prisma.graphEdge.findMany({
      where: { OR: [{ fromId: { in: dupeIds } }, { toId: { in: dupeIds } }] },
    })
    for (const edge of edges) {
      const fromId = idMap.get(edge.fromId) ?? edge.fromId
      const toId = idMap.get(edge.toId) ?? edge.toId
      if (fromId === toId) continue
      try {
        await prisma.graphEdge.upsert({
          where: { fromId_toId_type: { fromId, toId, type: edge.type } },
          update: {},
          create: { fromId, toId, type: edge.type, jobId: edge.jobId, origin: edge.origin, workspaceId: canonical.workspaceId },
        })
      } catch {
        // Concurrent writer hit the same compound key — the edge exists either way.
      }
    }

    const links = await prisma.entitySource.findMany({ where: { entityId: { in: dupeIds } } })
    for (const link of links) {
      try {
        await prisma.entitySource.upsert({
          where: { entityId_sourceId: { entityId: canonical.id, sourceId: link.sourceId } },
          update: {},
          create: { entityId: canonical.id, sourceId: link.sourceId, role: link.role },
        })
      } catch {
        // Unique race — the link exists either way.
      }
    }

    await prisma.graphEntity.deleteMany({ where: { id: { in: dupeIds } } })
    merged += dupes.length
  }

  return { normalized, groups: groupsMerged, merged }
}

/**
 * Backfill completed jobs into the graph (idempotent). #54/V3.0.1: optionally
 * scoped to one owner (`userId: string | null`, matching Job.userId) so a
 * route can backfill "my jobs" without touching every tenant's data; omitted
 * entirely, this still means "every completed job" for internal/background use.
 */
export async function syncAllJobs(where?: { userId?: string | null }): Promise<{ jobs: number; entities: number; edges: number }> {
  const jobs = await prisma.job.findMany({
    where: { status: 'completed', ...(where ?? {}) },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  let entities = 0
  let edges = 0
  for (const job of jobs) {
    const result = await syncJobGraph(job.id)
    entities += result.entities
    edges += result.edges
  }
  return { jobs: jobs.length, entities, edges }
}
