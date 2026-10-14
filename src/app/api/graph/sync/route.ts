import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { syncJobGraph, syncAllJobs } from '@/lib/research-graph'

export async function POST(request: NextRequest) {
  try {
    let jobId: string | undefined
    try {
      const body = await request.json()
      jobId = typeof body?.jobId === 'string' && body.jobId ? body.jobId : undefined
    } catch {
      // Empty body is fine — sync everything (the viewer's own jobs — see below).
    }

    // #54/V3.0.1: triggering a sync is a write (it creates/updates graph
    // rows), so — like every other graph write — it's confined to jobs the
    // viewer owns (or, if anonymous, jobs that are themselves unowned).
    const session = await getServerSession(authOptions)
    const viewerId = session?.user?.id ?? null

    if (jobId) {
      const job = await prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } })
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      if (job.userId !== viewerId) {
        return NextResponse.json({ error: 'Not authorized to sync this job' }, { status: 403 })
      }
      const result = await syncJobGraph(jobId)
      return NextResponse.json({ jobId, ...result })
    }

    const result = await syncAllJobs({ userId: viewerId })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error syncing research graph:', error)
    return NextResponse.json({ error: 'Failed to sync research graph' }, { status: 500 })
  }
}
