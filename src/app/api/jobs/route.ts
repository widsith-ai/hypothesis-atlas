import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { addEvidenceMappingJob } from '@/lib/queue'
import { authOptions } from '@/lib/auth'
import { isAuthRequired } from '@/lib/authConfig'
import { visibleToUserWhere } from '@/lib/ownership'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // #36/V3.6 phase 4: the list route must agree with the single-job
    // route about what's visible, or an owned job is "private" when
    // fetched by id but still shows up here for everyone.
    const session = await getServerSession(authOptions)
    const where = visibleToUserWhere(session?.user?.id)

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          topicQuery: true,
          status: true,
          rootNodeId: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
          _count: {
            select: {
              sources: true,
              nodes: true,
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ])

    // #43/V3.2 ownership display: derived here so the client gets "is this
    // mine / is it unclaimed" without ever receiving another account's id.
    const viewerId = session?.user?.id
    const jobsWithOwnership = jobs.map(({ userId, ...job }) => ({
      ...job,
      isMine: !!viewerId && userId === viewerId,
      isUnclaimed: !!viewerId && userId === null,
    }))

    return NextResponse.json({
      jobs: jobsWithOwnership,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { topicQuery } = body

    if (!topicQuery || typeof topicQuery !== 'string') {
      return NextResponse.json(
        { error: 'topicQuery is required' },
        { status: 400 }
      )
    }

    // #36/V3.6 phase 2/3: stamp the owner when a session exists; require one
    // at all only on deployments that opt into it (REQUIRE_AUTH=true — the
    // hosted tier, not self-hosted). See lib/authConfig.ts.
    const session = await getServerSession(authOptions)
    if (isAuthRequired() && !session?.user?.id) {
      return NextResponse.json({ error: 'Sign in to start new research.' }, { status: 401 })
    }

    console.log('Creating job for topic:', topicQuery)
    const job = await prisma.job.create({
      data: {
        topicQuery,
        status: 'pending',
        userId: session?.user?.id ?? null,
      },
    })
    console.log('Job created:', job.id)

    console.log('Adding job to queue...')
    await addEvidenceMappingJob(job.id, topicQuery)
    console.log('Job added to queue')

    return NextResponse.json({ jobId: job.id })
  } catch (error) {
    console.error('Error creating job:', error)
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack')
    // Prisma can't connect (DB container down, wrong DATABASE_URL): say so,
    // rather than a generic failure the user can't act on.
    if (error instanceof Error && error.name === 'PrismaClientInitializationError') {
      return NextResponse.json(
        { error: "Couldn't start the run: the database is unavailable. Please try again shortly." },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    )
  }
}
