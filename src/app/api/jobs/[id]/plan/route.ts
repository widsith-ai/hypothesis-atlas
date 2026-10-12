// SPDX-License-Identifier: AGPL-3.0-only
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateAtlasPlan, buildPlanExportMarkdown, type PlanMode } from '@/lib/atlasPlan'

/**
 * Atlas Plan — #63. Replaces POST /api/jobs/[id]/ars-plan. Non-streaming,
 * structured JSON response instead of ARS's streamed chat text — see
 * lib/atlasPlan.ts for why this is a clean-room design, not a port.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({})) as {
    mode?: PlanMode
    selectedIdea?: { title?: string; problem_to_solve?: string; proposed_method?: string[] }
    instruction?: string
    referenceDoc?: { name: string; content: string }
  }
  const mode: PlanMode = body.mode === 'outline' ? 'outline' : 'plan'

  const job = await prisma.job.findUnique({ where: { id: params.id } })
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const [sources, top3] = await Promise.all([
    prisma.source.findMany({
      where: { jobId: params.id, reliabilityTier: 'peer_reviewed' },
      take: 12,
      orderBy: { createdAt: 'asc' },
      select: { title: true, snippet: true },
    }),
    prisma.top3Ideas.findUnique({ where: { jobId: params.id } }),
  ])

  const ideas = top3 ? JSON.parse(top3.ideasJson) : []
  const idea = body.selectedIdea ?? ideas[0] ?? null

  try {
    const plan = await generateAtlasPlan(mode, job.topicQuery, idea, sources, body.instruction?.trim() || null, body.referenceDoc ?? null)
    const exportMarkdown = plan.available ? buildPlanExportMarkdown(job.topicQuery, plan) : null
    return NextResponse.json({ plan, exportMarkdown })
  } catch (error) {
    console.error('Error generating Atlas Plan:', error)
    return NextResponse.json({ error: 'Failed to generate a plan' }, { status: 500 })
  }
}
