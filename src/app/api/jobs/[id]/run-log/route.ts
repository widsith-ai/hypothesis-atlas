import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { canAccessResource } from '@/lib/ownership'
import { getRunLog } from '@/lib/runLog'

// #58/V3.0.5: "a card per result showing what the AI did and what the human
// did" reads this — every agent step the run took, plus (per step) how many
// of the records it produced were later edited by a human (origin flipped
// to 'user' in the research graph — see #55).
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [job, session] = await Promise.all([
      prisma.job.findUnique({ where: { id: params.id }, select: { id: true, userId: true } }),
      getServerSession(authOptions),
    ])
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    if (!canAccessResource(job.userId, session?.user?.id)) {
      return NextResponse.json({ error: 'Not authorized to view this job' }, { status: 403 })
    }

    const [log, nodes, humanEditedEntities] = await Promise.all([
      getRunLog(params.id),
      prisma.node.findMany({ where: { jobId: params.id }, select: { id: true, label: true } }),
      prisma.graphEntity.findMany({ where: { jobId: params.id, origin: 'user' }, select: { label: true } }),
    ])

    const nodeLabelById = new Map(nodes.map((n) => [n.id, n.label]))
    const humanEditedLabels = new Set(humanEditedEntities.map((e) => e.label))

    return NextResponse.json({
      steps: log.map((entry) => ({
        ...entry,
        // Whether a record this step produced was later edited by a human
        // — a Node this step created turned into a GraphEntity (#55's
        // syncJobGraph, matched by label), and that entity's origin has
        // since flipped to 'user'.
        humanEdited: entry.recordIds.some((id) => {
          const label = nodeLabelById.get(id)
          return label !== undefined && humanEditedLabels.has(label)
        }),
      })),
      humanEditedCount: humanEditedEntities.length,
    })
  } catch (error) {
    console.error('Error fetching run log:', error)
    return NextResponse.json({ error: 'Failed to fetch run log' }, { status: 500 })
  }
}
