import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { resolveWorkspaceId, canWriteGraphItem } from '@/lib/graphAccess'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.graphEdge.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)
    const workspaceId = resolveWorkspaceId(session?.user?.id)
    if (!canWriteGraphItem(existing.workspaceId, workspaceId)) {
      return NextResponse.json({ error: 'Not authorized to delete this edge' }, { status: 403 })
    }

    await prisma.graphEdge.delete({ where: { id: params.id } })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('Error deleting graph edge:', error)
    return NextResponse.json({ error: 'Failed to delete edge' }, { status: 500 })
  }
}
