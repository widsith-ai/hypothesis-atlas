// SPDX-License-Identifier: AGPL-3.0-only

/**
 * #54 (V3.0.1): workspace + visibility access control for the research
 * graph — the piece that was entirely missing before ("no route under
 * /api/graph checks a session at all"). Mirrors the shape of lib/ownership.ts
 * (Job/BoldIdea), but graph entities aren't owned by a single userId; they
 * belong to a workspace and carry their own visibility.
 *
 * Workspace model (deliberately minimal — a full Workspace table with
 * membership is a bigger feature, not this issue's scope): one workspace
 * per signed-in user (workspaceId = their user id), and a single shared
 * "default" workspace for anonymous/self-hosted use. This preserves
 * today's single-tenant behavior exactly for anonymous callers, who have
 * no way to be told apart from each other anyway.
 */

export type GraphVisibility = 'private' | 'shared' | 'public'

export const DEFAULT_WORKSPACE_ID = 'default'

export function resolveWorkspaceId(sessionUserId: string | undefined | null): string {
  return sessionUserId || DEFAULT_WORKSPACE_ID
}

export function isGraphVisibility(v: unknown): v is GraphVisibility {
  return v === 'private' || v === 'shared' || v === 'public'
}

/** Read access for one entity: can this viewer see it? */
export function canViewGraphItem(
  itemWorkspaceId: string,
  visibility: string,
  viewerWorkspaceId: string,
  viewerAuthenticated: boolean
): boolean {
  if (itemWorkspaceId === viewerWorkspaceId) return true
  if (visibility === 'public') return true
  if (visibility === 'shared' && viewerAuthenticated) return true
  return false
}

/** Prisma `where` fragment for "everything this viewer can read" — the list/query-route equivalent of canViewGraphItem, for GraphEntity. */
export function graphVisibilityWhere(viewerWorkspaceId: string, viewerAuthenticated: boolean) {
  return {
    OR: [
      { workspaceId: viewerWorkspaceId },
      { visibility: 'public' as const },
      ...(viewerAuthenticated ? [{ visibility: 'shared' as const }] : []),
    ],
  }
}

/**
 * Write access (create/edit/delete) is always confined to the item's own
 * workspace, regardless of visibility — visibility only widens who can
 * *read*, never who can write. Used for both entities and edges.
 */
export function canWriteGraphItem(itemWorkspaceId: string, viewerWorkspaceId: string): boolean {
  return itemWorkspaceId === viewerWorkspaceId
}
