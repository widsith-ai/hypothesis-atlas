import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { resolveWorkspaceId, graphVisibilityWhere } from '@/lib/graphAccess'
import { computeHypothesisStatuses, parseOutcomeMetadata } from '@/lib/outcomes'

// #56/V3.0.3: "graveyard view of refuted and abandoned hypotheses, filterable
// by method and dataset" — negative results get their own view instead of
// looking identical to every still-open hypothesis in the main graph.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const viewerWorkspaceId = resolveWorkspaceId(session?.user?.id)
    const viewerAuthenticated = !!session?.user?.id
    const visibility = graphVisibilityWhere(viewerWorkspaceId, viewerAuthenticated)

    const methodFilter = request.nextUrl.searchParams.get('method')
    const datasetFilter = request.nextUrl.searchParams.get('dataset')

    const entities = await prisma.graphEntity.findMany({ where: visibility })
    const visibleIds = new Set(entities.map((e) => e.id))
    const edges = (await prisma.graphEdge.findMany({})).filter(
      (e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId)
    )

    const statuses = computeHypothesisStatuses(entities, edges)
    const deadIds = new Set(
      [...statuses.entries()].filter(([, status]) => status === 'refuted' || status === 'abandoned').map(([id]) => id)
    )

    // A hypothesis matches a method/dataset filter if it's linked (directly,
    // or via its outcomes' underlying method) to that entity — reuse the
    // same uses_method/uses_dataset traversal collectMethodFailureModes uses.
    const linkedTo = (entityId: string): Set<string> => {
      const ids = new Set<string>()
      for (const edge of edges) {
        if (edge.type !== 'uses_method' && edge.type !== 'uses_dataset') continue
        if (edge.fromId === entityId) ids.add(edge.toId)
        if (edge.toId === entityId) ids.add(edge.fromId)
      }
      return ids
    }

    let candidateIds = deadIds
    if (methodFilter) {
      const linked = linkedTo(methodFilter)
      candidateIds = new Set([...candidateIds].filter((id) => linked.has(id)))
    }
    if (datasetFilter) {
      const linked = linkedTo(datasetFilter)
      candidateIds = new Set([...candidateIds].filter((id) => linked.has(id)))
    }

    const byId = new Map(entities.map((e) => [e.id, e]))
    const hypotheses = [...candidateIds]
      .map((id) => byId.get(id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .map((e) => ({
        id: e.id,
        label: e.label,
        content: e.content,
        status: statuses.get(e.id),
        abandonedReason: e.abandonedReason,
        outcomes: edges
          .filter((edge) => edge.type === 'tests' && edge.toId === e.id)
          .map((edge) => byId.get(edge.fromId))
          .filter((o): o is NonNullable<typeof o> => Boolean(o))
          .map((o) => ({ id: o.id, label: o.label, ...parseOutcomeMetadata(o.metadataJson) })),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }))

    const methods = entities.filter((e) => e.type === 'method').map((e) => ({ id: e.id, label: e.label }))
    const datasets = entities.filter((e) => e.type === 'dataset').map((e) => ({ id: e.id, label: e.label }))

    return NextResponse.json({ hypotheses, methods, datasets })
  } catch (error) {
    console.error('Error fetching graveyard:', error)
    return NextResponse.json({ error: 'Failed to fetch graveyard' }, { status: 500 })
  }
}
