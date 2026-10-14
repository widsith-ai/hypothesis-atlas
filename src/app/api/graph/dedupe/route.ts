import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dedupeGraph } from '@/lib/research-graph'
import { resolveWorkspaceId } from '@/lib/graphAccess'

export async function POST() {
  try {
    // #54/V3.0.1: scoped to the caller's own workspace — previously this
    // triggered a dedupe pass across every tenant's data, callable by anyone.
    const session = await getServerSession(authOptions)
    const workspaceId = resolveWorkspaceId(session?.user?.id)
    const result = await dedupeGraph(workspaceId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error deduplicating research graph:', error)
    return NextResponse.json({ error: 'Failed to deduplicate research graph' }, { status: 500 })
  }
}
