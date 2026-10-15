import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { canAccessResource } from '@/lib/ownership'
import { getRunLog } from '@/lib/runLog'

// #58/V3.0.5: "export a run as a reproducibility bundle: logs, model
// versions, random seeds, dataset versions" — everything needed to see
// (and, for the LLM steps, actually re-run with the same seed) exactly
// what a run did. Returned as a downloadable JSON file rather than a new
// page, since this is meant to be archived/attached, not browsed.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [job, session] = await Promise.all([
      prisma.job.findUnique({ where: { id: params.id } }),
      getServerSession(authOptions),
    ])
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    if (!canAccessResource(job.userId, session?.user?.id)) {
      return NextResponse.json({ error: 'Not authorized to export this job' }, { status: 403 })
    }

    const [runLog, sources, nodes] = await Promise.all([
      getRunLog(params.id),
      prisma.source.findMany({ where: { jobId: params.id } }),
      prisma.node.findMany({ where: { jobId: params.id } }),
    ])

    const bundle = {
      bundleVersion: 1,
      job: { id: job.id, topicQuery: job.topicQuery, status: job.status, createdAt: job.createdAt },
      // Every model + seed actually used, so an LLM step can be replayed.
      modelCalls: runLog
        .filter((entry) => entry.model)
        .map((entry) => ({ step: entry.step, model: entry.model, seed: entry.seed, prompt: entry.prompt })),
      runLog,
      // Dataset/paper versions — the exact external records this run pulled
      // in, each with the identifier and timestamp needed to refetch the
      // same version (or confirm it has since changed).
      datasetVersions: sources.map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        externalId: s.externalId,
        url: s.url,
        publishedAt: s.publishedAt,
        fetchedAt: s.createdAt,
        runLogId: s.runLogId,
      })),
      nodes: nodes.map((n) => ({ id: n.id, label: n.label, parentId: n.parentId, depth: n.depth, runLogId: n.runLogId })),
    }

    return NextResponse.json(bundle, {
      headers: { 'Content-Disposition': `attachment; filename="run-${params.id}-reproducibility.json"` },
    })
  } catch (error) {
    console.error('Error building reproducibility bundle:', error)
    return NextResponse.json({ error: 'Failed to build reproducibility bundle' }, { status: 500 })
  }
}
