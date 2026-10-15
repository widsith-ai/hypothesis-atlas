import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { resolveWorkspaceId, canWriteGraphItem } from '@/lib/graphAccess'
import { isOutcomeResult, serializeOutcomeMetadata } from '@/lib/outcomes'

// #56/V3.0.3: records that a hypothesis was actually tested — the "outcome
// form" the graph UI submits to (result, failure mode, effect, conditions).
// Always creates an entity (never rejects on verification — there's nothing
// to verify here, this is the human reporting what happened) and a 'tests'
// edge (outcome -> hypothesis) in one call.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hypothesisId, label, result, failureMode, effect, conditions } = body ?? {}

    if (typeof hypothesisId !== 'string' || !hypothesisId) {
      return NextResponse.json({ error: 'hypothesisId is required' }, { status: 400 })
    }
    if (!isOutcomeResult(result)) {
      return NextResponse.json({ error: 'Invalid result' }, { status: 400 })
    }

    const hypothesis = await prisma.graphEntity.findUnique({ where: { id: hypothesisId } })
    if (!hypothesis || hypothesis.type !== 'hypothesis') {
      return NextResponse.json({ error: 'Hypothesis not found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)
    const workspaceId = resolveWorkspaceId(session?.user?.id)
    if (!canWriteGraphItem(hypothesis.workspaceId, workspaceId)) {
      return NextResponse.json({ error: 'Not authorized to record an outcome for this hypothesis' }, { status: 403 })
    }

    const trimmedLabel =
      typeof label === 'string' && label.trim() ? label.trim().slice(0, 200) : `Outcome: ${hypothesis.label}`.slice(0, 200)
    const producer = session?.user?.id ?? 'anonymous'

    const outcome = await prisma.graphEntity.create({
      data: {
        type: 'outcome',
        label: trimmedLabel,
        origin: 'user',
        workspaceId,
        producer,
        // #56/V3.0.3 task: "outcomes private by default, with one-click
        // sharing" — explicit here even though it matches GraphEntity's
        // own schema default, since that default is what makes sharing
        // later a deliberate one-field PATCH rather than the starting state.
        visibility: 'private',
        metadataJson: serializeOutcomeMetadata({
          result,
          failureMode: typeof failureMode === 'string' && failureMode.trim() ? failureMode.trim().slice(0, 1000) : null,
          effect: typeof effect === 'string' && effect.trim() ? effect.trim().slice(0, 1000) : null,
          conditions: typeof conditions === 'string' && conditions.trim() ? conditions.trim().slice(0, 1000) : null,
        }),
      },
    })

    const edge = await prisma.graphEdge.create({
      data: {
        fromId: outcome.id,
        toId: hypothesis.id,
        type: 'tests',
        origin: 'user',
        workspaceId,
        producer,
      },
    })

    return NextResponse.json({ outcome, edge }, { status: 201 })
  } catch (error) {
    console.error('Error creating outcome:', error)
    return NextResponse.json({ error: 'Failed to create outcome' }, { status: 500 })
  }
}
