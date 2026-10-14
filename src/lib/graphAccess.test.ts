import { describe, it, expect } from 'vitest'
import { resolveWorkspaceId, isGraphVisibility, canViewGraphItem, graphVisibilityWhere, canWriteGraphItem, DEFAULT_WORKSPACE_ID } from './graphAccess'

describe('resolveWorkspaceId', () => {
  it('uses the session user id when signed in', () => {
    expect(resolveWorkspaceId('user-1')).toBe('user-1')
  })

  it('falls back to the shared default workspace when anonymous', () => {
    expect(resolveWorkspaceId(null)).toBe(DEFAULT_WORKSPACE_ID)
    expect(resolveWorkspaceId(undefined)).toBe(DEFAULT_WORKSPACE_ID)
    expect(resolveWorkspaceId('')).toBe(DEFAULT_WORKSPACE_ID)
  })
})

describe('isGraphVisibility', () => {
  it('accepts the three known values', () => {
    expect(isGraphVisibility('private')).toBe(true)
    expect(isGraphVisibility('shared')).toBe(true)
    expect(isGraphVisibility('public')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isGraphVisibility('bogus')).toBe(false)
    expect(isGraphVisibility(undefined)).toBe(false)
    expect(isGraphVisibility(42)).toBe(false)
  })
})

describe('canViewGraphItem', () => {
  it('always allows a viewer to see their own workspace, any visibility', () => {
    expect(canViewGraphItem('user-1', 'private', 'user-1', true)).toBe(true)
    expect(canViewGraphItem('default', 'private', 'default', false)).toBe(true)
  })

  it('denies a private item outside the owning workspace', () => {
    expect(canViewGraphItem('user-1', 'private', 'user-2', true)).toBe(false)
    expect(canViewGraphItem('user-1', 'private', 'default', false)).toBe(false)
  })

  it('allows a shared item to any signed-in viewer, but not anonymous', () => {
    expect(canViewGraphItem('user-1', 'shared', 'user-2', true)).toBe(true)
    expect(canViewGraphItem('user-1', 'shared', 'default', false)).toBe(false)
  })

  it('allows a public item to anyone, signed in or not', () => {
    expect(canViewGraphItem('user-1', 'public', 'user-2', true)).toBe(true)
    expect(canViewGraphItem('user-1', 'public', 'default', false)).toBe(true)
  })
})

describe('graphVisibilityWhere', () => {
  it('only includes the viewer\'s own workspace and public items when anonymous', () => {
    expect(graphVisibilityWhere('default', false)).toEqual({
      OR: [{ workspaceId: 'default' }, { visibility: 'public' }],
    })
  })

  it('also includes shared items when the viewer is signed in', () => {
    expect(graphVisibilityWhere('user-1', true)).toEqual({
      OR: [{ workspaceId: 'user-1' }, { visibility: 'public' }, { visibility: 'shared' }],
    })
  })
})

describe('canWriteGraphItem', () => {
  it('allows writes only within the item\'s own workspace, regardless of how visible it is elsewhere', () => {
    expect(canWriteGraphItem('user-1', 'user-1')).toBe(true)
    expect(canWriteGraphItem('user-1', 'user-2')).toBe(false)
    expect(canWriteGraphItem('default', 'user-1')).toBe(false)
  })
})
