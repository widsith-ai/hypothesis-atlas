import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { syncJobGraph } from '@/lib/research-graph'
import { resolveWorkspaceId, graphVisibilityWhere } from '@/lib/graphAccess'
import { computeHypothesisStatuses, collectMethodFailureModes } from '@/lib/outcomes'

// Source rows are per-job (papers get re-fetched per run), so the same paper
// can be linked several times via different rows — collapse them by title.
function dedupeSources<T extends { source: { title: string } }>(links: T[]): T[] {
  const seen = new Set<string>()
  return links.filter((es) => {
    const key = es.source.title.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const viewerId = session?.user?.id
    const viewerWorkspaceId = resolveWorkspaceId(viewerId)
    const viewerAuthenticated = !!viewerId

    // Backfill any of the viewer's own completed jobs whose knowledge tree hasn't
    // reached the graph yet (#54/V3.0.1: scoped to the viewer's own jobs — a
    // request from one account shouldn't trigger writes into another's workspace).
    // A pre-existing 'note' entity used to make this look already-synced and skip
    // every job forever — checking entityCount === 0 isn't a valid "synced" signal.
    // Sync completion is tracked via the 'research_graph' progress event syncJobGraph
    // emits per job, rather than entity ownership — topic entities converge across
    // jobs that share a label, so a later job's id may never own one.
    const completedJobs = await prisma.job.findMany({
      where: { status: 'completed', userId: viewerId ?? null },
      select: { id: true },
    })
    if (completedJobs.length > 0) {
      const syncedJobIds = new Set(
        (
          await prisma.progressEvent.findMany({
            where: { stage: 'research_graph', status: 'completed', jobId: { in: completedJobs.map((j) => j.id) } },
            select: { jobId: true },
          })
        ).map((e) => e.jobId)
      )
      const unsyncedJobs = completedJobs.filter((job) => !syncedJobIds.has(job.id))
      for (const job of unsyncedJobs) {
        await syncJobGraph(job.id)
      }
    }

    // #54/V3.0.1: every /api/graph route now actually checks who's asking —
    // previously none did. Unowned (workspace "default") data stays exactly
    // as open as before accounts existed; only entities/edges that belong to
    // someone else's workspace, and aren't shared/public, are now excluded.
    const entities = await prisma.graphEntity.findMany({
      where: graphVisibilityWhere(viewerWorkspaceId, viewerAuthenticated),
      include: {
        entitySources: {
          include: {
            source: {
              select: { id: true, title: true, url: true, type: true, venue: true, publishedAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // An edge is visible exactly when both its endpoints are — see lib/graphAccess.ts.
    const visibleEntityIds = entities.map((e) => e.id)
    const edges = await prisma.graphEdge.findMany({
      where: { fromId: { in: visibleEntityIds }, toId: { in: visibleEntityIds } },
      orderBy: { createdAt: 'asc' },
    })

    const byType: Record<string, number> = {}
    for (const e of entities) {
      byType[e.type] = (byType[e.type] ?? 0) + 1
    }

    // #56/V3.0.3: derived, not stored — a hypothesis's status from its
    // outcomes, and a method's known failure modes from outcomes that
    // refuted a hypothesis it was used on.
    const hypothesisStatuses = computeHypothesisStatuses(entities, edges)

    return NextResponse.json({
      entities: entities.map((e) => ({
        id: e.id,
        type: e.type,
        label: e.label,
        content: e.content,
        jobId: e.jobId,
        origin: e.origin,
        pinned: e.pinned,
        metadata: e.metadataJson ? JSON.parse(e.metadataJson) : null,
        domain: e.domain,
        producer: e.producer,
        status: e.status,
        method: e.method,
        confidence: e.confidence,
        checkedAt: e.checkedAt,
        verifier: e.verifier,
        abandonedReason: e.abandonedReason,
        hypothesisStatus: e.type === 'hypothesis' ? hypothesisStatuses.get(e.id) ?? null : null,
        knownFailureModes: e.type === 'method' ? collectMethodFailureModes(e.id, entities, edges) : null,
        visibility: e.visibility,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        sources: dedupeSources(e.entitySources).map((es) => ({
          ...es.source,
          role: es.role,
          passage: es.start != null && es.end != null && es.text ? { start: es.start, end: es.end, text: es.text } : null,
        })),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        fromId: e.fromId,
        toId: e.toId,
        type: e.type,
        jobId: e.jobId,
        origin: e.origin,
        producer: e.producer,
        status: e.status,
        confidence: e.confidence,
      })),
      stats: {
        entities: entities.length,
        edges: edges.length,
        byType,
      },
    })
  } catch (error) {
    console.error('Error fetching research graph:', error)
    return NextResponse.json({ error: 'Failed to fetch research graph' }, { status: 500 })
  }
}
