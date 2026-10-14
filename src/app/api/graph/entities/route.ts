import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { isEntityType, isEdgeType } from '@/lib/research-graph'
import { resolveWorkspaceId, canWriteGraphItem } from '@/lib/graphAccess'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, label, content, jobId, connectTo, edgeType } = body ?? {}

    if (!isEntityType(type)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }

    const trimmedLabel = typeof label === 'string' ? label.trim().slice(0, 200) : ''
    if (!trimmedLabel) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    }

    const trimmedContent =
      typeof content === 'string' && content.trim() ? content.trim().slice(0, 4000) : null

    // #54/V3.0.1: a manually created entity belongs to its creator's workspace
    // (the shared "default" one when anonymous), same as before accounts existed.
    const session = await getServerSession(authOptions)
    const workspaceId = resolveWorkspaceId(session?.user?.id)

    const entity = await prisma.graphEntity.create({
      data: {
        type,
        label: trimmedLabel,
        content: trimmedContent,
        jobId: typeof jobId === 'string' && jobId ? jobId : null,
        origin: 'user',
        workspaceId,
      },
    })

    if (connectTo && isEdgeType(edgeType)) {
      const target = await prisma.graphEntity.findUnique({ where: { id: connectTo } })
      // Connecting to another entity is still a write — confined to entities
      // already in this workspace, even if a shared/public one was readable.
      if (target && target.id !== entity.id && canWriteGraphItem(target.workspaceId, workspaceId)) {
        try {
          await prisma.graphEdge.create({
            data: {
              fromId: entity.id,
              toId: target.id,
              type: edgeType,
              origin: 'user',
              workspaceId,
            },
          })
        } catch (err) {
          if ((err as { code?: string }).code !== 'P2002') throw err
        }
      }
    }

    return NextResponse.json({ entity }, { status: 201 })
  } catch (error) {
    console.error('Error creating graph entity:', error)
    return NextResponse.json({ error: 'Failed to create entity' }, { status: 500 })
  }
}
