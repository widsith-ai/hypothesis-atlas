// SPDX-License-Identifier: AGPL-3.0-only
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  generateAtlasPlan,
  buildPlanExportMarkdown,
  groundPlanClaims,
  mergePlanSources,
  type PlanMode,
  type RawPlanClaim,
} from '@/lib/atlasPlan'

const MAX_RECHECK_CLAIMS = 10
const MAX_CLAIM_LENGTH = 1000

/**
 * Atlas Plan — #63. Replaces POST /api/jobs/[id]/ars-plan. Non-streaming,
 * structured JSON response instead of ARS's streamed chat text — see
 * lib/atlasPlan.ts for why this is a clean-room design, not a port.
 *
 * #64: `extraSources` carries the papers the researcher collected on the
 * Setup step, and `action: "ground"` re-checks claims the researcher edited
 * against the same source list without regenerating the plan.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({})) as {
    action?: 'generate' | 'ground'
    mode?: PlanMode
    selectedIdea?: { title?: string; problem_to_solve?: string; proposed_method?: string[] }
    instruction?: string
    referenceDoc?: { name: string; content: string }
    extraSources?: unknown
    claims?: unknown
  }
  const mode: PlanMode = body.mode === 'outline' ? 'outline' : 'plan'

  const job = await prisma.job.findUnique({ where: { id: params.id } })
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const [dbSources, top3] = await Promise.all([
    prisma.source.findMany({
      where: { jobId: params.id, reliabilityTier: 'peer_reviewed' },
      take: 12,
      orderBy: { createdAt: 'asc' },
      select: { title: true, snippet: true },
    }),
    prisma.top3Ideas.findUnique({ where: { jobId: params.id } }),
  ])
  const sources = mergePlanSources(dbSources, body.extraSources)

  if (body.action === 'ground') {
    const claims = parseClaims(body.claims)
    if (!claims.length) {
      return NextResponse.json({ error: 'No claims to check' }, { status: 400 })
    }
    try {
      return NextResponse.json({ claims: await groundPlanClaims(claims, sources) })
    } catch (error) {
      console.error('Error re-checking Atlas Plan claims:', error)
      return NextResponse.json({ error: 'Failed to check claims' }, { status: 500 })
    }
  }

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

function parseClaims(value: unknown): RawPlanClaim[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_RECHECK_CLAIMS).flatMap((item) => {
    const entry = item as Record<string, unknown> | null
    const text = typeof entry?.text === 'string' ? entry.text.trim().slice(0, MAX_CLAIM_LENGTH) : ''
    if (!text) return []
    const cited = Array.isArray(entry?.citedSourceTitles)
      ? (entry!.citedSourceTitles as unknown[]).filter((t): t is string => typeof t === 'string')
      : []
    return [{ text, citedSourceTitles: cited }]
  })
}
