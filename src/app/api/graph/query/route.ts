import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { generateWithGroq } from '@/lib/groq'
import { resolveWorkspaceId, graphVisibilityWhere } from '@/lib/graphAccess'

const MAX_CONTEXT_ENTITIES = 60
const MAX_SOURCE_LINES = 15

function formatEntityLine(
  e: {
    id: string
    type: string
    label: string
    content: string | null
    jobId: string | null
  },
  edgesByEntity: Map<string, { type: string; dir: 'from' | 'to'; otherLabel: string; otherType: string }[]>
): string {
  const relations = (edgesByEntity.get(e.id) ?? [])
    .slice(0, 3)
    .map((r) => (r.dir === 'from' ? `--${r.type}-->` : `<--${r.type}--`) + ` ${r.otherType} "${r.otherLabel}"`)
    .join('; ')
  const content = e.content ? ` | ${e.content.slice(0, 300)}` : ''
  const relationsPart = relations ? ` | ${relations}` : ''
  return `- [${e.type}] "${e.label}"${content}${relationsPart}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 500) : ''
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // #54/V3.0.1: this query used to search and synthesize across every
    // tenant's graph. Now scoped to what the viewer can actually see.
    const session = await getServerSession(authOptions)
    const viewerWorkspaceId = resolveWorkspaceId(session?.user?.id)
    const viewerAuthenticated = !!session?.user?.id
    const visibility = graphVisibilityWhere(viewerWorkspaceId, viewerAuthenticated)

    const escaped = query.replace(/[\\%_]/g, (c: string) => `\\${c}`)
    const matches = await prisma.graphEntity.findMany({
      where: {
        AND: [
          visibility,
          {
            OR: [
              { label: { contains: escaped, mode: 'insensitive' } },
              { content: { contains: escaped, mode: 'insensitive' } },
            ],
          },
        ],
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    })

    if (matches.length === 0) {
      return NextResponse.json({
        answer: null,
        message: 'No matching entities found in your research graph yet.',
        subgraph: { entities: [], edges: [], sources: [] },
      })
    }

    // 1-hop neighborhood: entities directly connected to any match
    const matchIds = new Set(matches.map((m) => m.id))
    const neighborEdges = await prisma.graphEdge.findMany({
      where: { OR: [{ fromId: { in: matches.map((m) => m.id) } }, { toId: { in: matches.map((m) => m.id) } }] },
      take: 200,
    })

    const neighborIds = new Set<string>(matchIds)
    for (const edge of neighborEdges) {
      neighborIds.add(edge.fromId)
      neighborIds.add(edge.toId)
    }

    // `neighborIds` was discovered via edges without a visibility check — filter the
    // fetch itself so a neighbor the viewer can't see never enters the subgraph.
    const subgraphEntities = await prisma.graphEntity.findMany({
      where: { AND: [visibility, { id: { in: [...neighborIds] } }] },
      take: MAX_CONTEXT_ENTITIES,
    })

    // An edge only belongs in the subgraph if both endpoints survived the visibility
    // filter above — not just the pre-filter `neighborIds` they were discovered from.
    const visibleIds = new Set(subgraphEntities.map((e) => e.id))
    const subgraphEdges = neighborEdges.filter(
      (e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId)
    )

    const entitySourceLinks = await prisma.entitySource.findMany({
      where: { entityId: { in: subgraphEntities.map((e) => e.id) } },
      include: {
        source: { select: { id: true, title: true, url: true, type: true, venue: true } },
      },
    })

    // Source rows are per-job (papers get re-fetched per run) — collapse by title.
    const sourcesById = new Map<string, { id: string; title: string; url: string | null; type: string; venue: string | null }>()
    const seenSourceTitles = new Set<string>()
    for (const link of entitySourceLinks) {
      const titleKey = link.source.title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (!titleKey || seenSourceTitles.has(titleKey)) continue
      seenSourceTitles.add(titleKey)
      sourcesById.set(link.source.id, link.source)
    }
    const sources = [...sourcesById.values()].slice(0, MAX_SOURCE_LINES)

    // Build labelled context for Groq
    const labelById = new Map(subgraphEntities.map((e) => [e.id, e]))
    const edgesByEntity = new Map<string, { type: string; dir: 'from' | 'to'; otherLabel: string; otherType: string }[]>()
    for (const edge of subgraphEdges) {
      const from = labelById.get(edge.fromId)
      const to = labelById.get(edge.toId)
      if (!from || !to) continue
      const fromList = edgesByEntity.get(edge.fromId) ?? []
      fromList.push({ type: edge.type, dir: 'from', otherLabel: to.label, otherType: to.type })
      edgesByEntity.set(edge.fromId, fromList)
      const toList = edgesByEntity.get(edge.toId) ?? []
      toList.push({ type: edge.type, dir: 'to', otherLabel: from.label, otherType: from.type })
      edgesByEntity.set(edge.toId, toList)
    }

    const matchedLines = matches
      .map((m) => formatEntityLine(m, edgesByEntity))
      .join('\n')
    const otherEntities = subgraphEntities
      .filter((e) => !matchIds.has(e.id))
      .map((e) => formatEntityLine(e, edgesByEntity))
      .join('\n')
    const sourceLines = sources.map((s) => `- ${s.title}${s.venue ? ` (${s.venue})` : ''}${s.url ? ` ${s.url}` : ''}`).join('\n')

    const runCount = new Set(subgraphEntities.map((e) => e.jobId).filter(Boolean)).size

    const prompt = `A researcher asks: "What have I learned across all my runs about ${query}?"

Below is their persistent research graph — knowledge accumulated across ${runCount} research run(s). Each line is an entity (type in brackets) with optional content and relationships.

DIRECTLY MATCHED ENTITIES:
${matchedLines}

${otherEntities ? `CONNECTED CONTEXT:\n${otherEntities}` : ''}

${sourceLines ? `SUPPORTING SOURCES:\n${sourceLines}` : ''}

Synthesize what the researcher has learned about "${query}" across runs. Ground every claim in the entities above — cite them inline as [type "label"]. Highlight: key findings/evidence, methods used, gaps and open problems, contradictions, and how different runs relate. If the graph is thin on this topic, say so.

Return JSON: {"answer": "2-4 paragraph synthesis", "keyTakeaways": ["...", "..."], "gaps": ["...", "..."]}`

    const result = await generateWithGroq(prompt)

    const hasAnswer =
      result &&
      typeof result.answer === 'string' &&
      result.answer.trim().length > 0 &&
      !result.answer.startsWith('Analysis unavailable')

    return NextResponse.json({
      answer: hasAnswer ? result.answer : null,
      keyTakeaways: hasAnswer && Array.isArray(result.keyTakeaways) ? result.keyTakeaways : [],
      gaps: hasAnswer && Array.isArray(result.gaps) ? result.gaps : [],
      message: hasAnswer ? undefined : 'LLM synthesis unavailable — showing matching subgraph only.',
      matchedIds: matches.map((m) => m.id),
      subgraph: {
        entities: subgraphEntities.map((e) => ({
          id: e.id,
          type: e.type,
          label: e.label,
          content: e.content,
          jobId: e.jobId,
          origin: e.origin,
          matched: matchIds.has(e.id),
        })),
        edges: subgraphEdges.map((e) => ({
          id: e.id,
          fromId: e.fromId,
          toId: e.toId,
          type: e.type,
        })),
        sources,
      },
    })
  } catch (error) {
    console.error('Error querying research graph:', error)
    return NextResponse.json({ error: 'Failed to query research graph' }, { status: 500 })
  }
}
