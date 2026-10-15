import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { isEntityType } from '@/lib/research-graph'
import { resolveWorkspaceId, canWriteGraphItem } from '@/lib/graphAccess'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { type, label, content, pinned } = body ?? {}

    const existing = await prisma.graphEntity.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // #54/V3.0.1: editing is a write — confined to the entity's own workspace
    // regardless of how visible it is to this viewer (shared/public is read-only).
    const session = await getServerSession(authOptions)
    const workspaceId = resolveWorkspaceId(session?.user?.id)
    if (!canWriteGraphItem(existing.workspaceId, workspaceId)) {
      return NextResponse.json({ error: 'Not authorized to edit this entity' }, { status: 403 })
    }

    const data: Record<string, unknown> = {}

    if (type !== undefined) {
      if (!isEntityType(type)) {
        return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
      }
      data.type = type
    }

    if (label !== undefined) {
      const trimmed = typeof label === 'string' ? label.trim().slice(0, 200) : ''
      if (!trimmed) {
        return NextResponse.json({ error: 'Label cannot be empty' }, { status: 400 })
      }
      data.label = trimmed
    }

    if (content !== undefined) {
      data.content =
        typeof content === 'string' && content.trim() ? content.trim().slice(0, 4000) : null
    }

    if (pinned !== undefined && typeof pinned === 'boolean') {
      data.pinned = pinned
    }

    // Any semantic edit converts the entity to user-owned so re-syncs of the
    // originating run can never overwrite it.
    const semanticChange =
      (type !== undefined && type !== existing.type) ||
      (label !== undefined && data.label !== existing.label) ||
      (content !== undefined && data.content !== existing.content)
    if (semanticChange && existing.origin === 'system') {
      data.origin = 'user'
      data.producer = session?.user?.id ?? 'anonymous'
    }

    const entity = await prisma.graphEntity.update({ where: { id: params.id }, data })
    return NextResponse.json({ entity })
  } catch (error) {
    console.error('Error updating graph entity:', error)
    return NextResponse.json({ error: 'Failed to update entity' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.graphEntity.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)
    const workspaceId = resolveWorkspaceId(session?.user?.id)
    if (!canWriteGraphItem(existing.workspaceId, workspaceId)) {
      return NextResponse.json({ error: 'Not authorized to delete this entity' }, { status: 403 })
    }

    await prisma.graphEntity.delete({ where: { id: params.id } })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('Error deleting graph entity:', error)
    return NextResponse.json({ error: 'Failed to delete entity' }, { status: 500 })
  }
}
