import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    job: { findUnique: vi.fn(), findMany: vi.fn() },
    node: { findMany: vi.fn() },
    graphEntity: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    graphEdge: { upsert: vi.fn(), findMany: vi.fn() },
    entitySource: { upsert: vi.fn(), findMany: vi.fn() },
    progressEvent: { create: vi.fn() },
  },
}))

vi.mock('./prisma', () => ({ prisma: prismaMock }))

import { isEntityType, isEdgeType, syncJobGraph, dedupeGraph, ENTITY_TYPES, EDGE_TYPES } from './research-graph'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  prismaMock.progressEvent.create.mockResolvedValue({})
  prismaMock.graphEntity.deleteMany.mockResolvedValue({ count: 0 })
})

describe('isEntityType / isEdgeType', () => {
  it('accepts every known entity type', () => {
    for (const t of ENTITY_TYPES) expect(isEntityType(t)).toBe(true)
  })

  it('accepts every known edge type', () => {
    for (const t of EDGE_TYPES) expect(isEdgeType(t)).toBe(true)
  })

  it('rejects unknown or non-string values', () => {
    expect(isEntityType('bogus')).toBe(false)
    expect(isEntityType(42)).toBe(false)
    expect(isEntityType(undefined)).toBe(false)
    expect(isEdgeType('bogus')).toBe(false)
    expect(isEdgeType(null)).toBe(false)
  })
})

describe('syncJobGraph', () => {
  it('returns zero counts when the job does not exist', async () => {
    prismaMock.job.findUnique.mockResolvedValue(null)
    await expect(syncJobGraph('missing-job')).resolves.toEqual({ entities: 0, edges: 0 })
    expect(prismaMock.node.findMany).not.toHaveBeenCalled()
  })

  it('returns zero counts when the job has no nodes', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'topic', rootNodeId: null })
    prismaMock.node.findMany.mockResolvedValue([])
    await expect(syncJobGraph('job-1')).resolves.toEqual({ entities: 0, edges: 0 })
  })

  it('creates a topic entity and links methods/findings for a root-only job', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'topic', rootNodeId: 'node-1', userId: null })
    prismaMock.node.findMany.mockResolvedValue([
      {
        id: 'node-1',
        depth: 0,
        label: 'Autonomous Vehicles',
        summary: 'Root summary',
        methodsJson: JSON.stringify(['Simulation']),
        findingsJson: JSON.stringify(['Reduces accidents']),
        openProblemsJson: JSON.stringify([]),
        disagreementsJson: JSON.stringify([]),
        nodeSources: [{ sourceId: 'src-1', role: 'supporting' }],
      },
    ])
    prismaMock.graphEntity.findUnique.mockResolvedValue(null)
    prismaMock.graphEntity.create.mockImplementation(async ({ data }: any) => ({ id: `entity-${data.label}`, ...data }))
    prismaMock.graphEdge.upsert.mockResolvedValue({})
    prismaMock.entitySource.upsert.mockResolvedValue({})
    prismaMock.graphEntity.findMany.mockResolvedValue([])

    const result = await syncJobGraph('job-1')

    expect(result.entities).toBe(3) // topic + method + finding
    expect(result.edges).toBe(2) // uses_method + provides
    expect(prismaMock.graphEntity.create).toHaveBeenCalledTimes(3)
    expect(prismaMock.progressEvent.create).toHaveBeenCalled()
  })

  it('#54/V3.0.1: stamps every created entity and edge with the job owner\'s workspace, "default" for an anonymous job', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'topic', rootNodeId: 'node-1', userId: null })
    prismaMock.node.findMany.mockResolvedValue([
      { id: 'node-1', depth: 0, label: 'Topic', summary: 'Summary', methodsJson: null, findingsJson: null, openProblemsJson: null, disagreementsJson: null, nodeSources: [] },
    ])
    prismaMock.graphEntity.findUnique.mockResolvedValue(null)
    prismaMock.graphEntity.create.mockImplementation(async ({ data }: any) => ({ id: `entity-${data.label}`, ...data }))
    prismaMock.graphEntity.findMany.mockResolvedValue([])

    await syncJobGraph('job-1')

    expect(prismaMock.graphEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'default' }) })
    )
  })

  it('#54/V3.0.1: uses the job owner\'s user id as the workspace when the job is owned', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'topic', rootNodeId: 'node-1', userId: 'user-1' })
    prismaMock.node.findMany.mockResolvedValue([
      { id: 'node-1', depth: 0, label: 'Topic', summary: 'Summary', methodsJson: null, findingsJson: null, openProblemsJson: null, disagreementsJson: null, nodeSources: [] },
    ])
    prismaMock.graphEntity.findUnique.mockResolvedValue(null)
    prismaMock.graphEntity.create.mockImplementation(async ({ data }: any) => ({ id: `entity-${data.label}`, ...data }))
    prismaMock.graphEntity.findMany.mockResolvedValue([])

    await syncJobGraph('job-1')

    expect(prismaMock.graphEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'user-1' }) })
    )
    // The compound-unique lookup must be scoped to that same workspace, not a bare syncKey.
    expect(prismaMock.graphEntity.findUnique).toHaveBeenCalledWith({
      where: { workspaceId_syncKey: { workspaceId: 'user-1', syncKey: 'g:topic:topic' } },
    })
  })

  it('leaves an existing system-origin entity untouched when unchanged', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', topicQuery: 'topic', rootNodeId: 'node-1' })
    prismaMock.node.findMany.mockResolvedValue([
      {
        id: 'node-1',
        depth: 0,
        label: 'Topic Label',
        summary: 'Same summary',
        methodsJson: null,
        findingsJson: null,
        openProblemsJson: null,
        disagreementsJson: null,
        nodeSources: [],
      },
    ])
    const existing = { id: 'existing-1', origin: 'system', label: 'Topic Label', content: 'Same summary' }
    prismaMock.graphEntity.findUnique.mockResolvedValue(existing)
    prismaMock.graphEntity.findMany.mockResolvedValue([])

    await syncJobGraph('job-1')

    expect(prismaMock.graphEntity.create).not.toHaveBeenCalled()
    expect(prismaMock.graphEntity.update).not.toHaveBeenCalled()
  })
})

describe('dedupeGraph', () => {
  it('merges duplicate system-origin entities sharing a normalized label', async () => {
    const older = {
      id: 'e1',
      type: 'method',
      label: 'Simulation',
      content: null,
      origin: 'system',
      pinned: false,
      syncKey: 'job:method:simulation',
      workspaceId: 'default',
      createdAt: new Date('2024-01-01'),
    }
    const newer = {
      id: 'e2',
      type: 'method',
      label: 'simulation',
      content: 'extra detail',
      origin: 'system',
      pinned: true,
      syncKey: 'job:method:simulation-2',
      workspaceId: 'default',
      createdAt: new Date('2024-01-02'),
    }
    prismaMock.graphEntity.findMany.mockResolvedValue([older, newer])
    prismaMock.graphEdge.findMany.mockResolvedValue([])
    prismaMock.entitySource.findMany.mockResolvedValue([])
    prismaMock.graphEntity.update.mockResolvedValue({})

    const result = await dedupeGraph()

    expect(result.groups).toBe(1)
    expect(result.merged).toBe(1)
    expect(prismaMock.graphEntity.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['e2'] } } })
  })

  it('skips groups made up entirely of user-created entities', async () => {
    const a = { id: 'e1', type: 'note', label: 'dup', content: null, origin: 'user', pinned: false, syncKey: null, workspaceId: 'default', createdAt: new Date() }
    const b = { id: 'e2', type: 'method', label: 'dup', content: null, origin: 'user', pinned: false, syncKey: null, workspaceId: 'default', createdAt: new Date() }
    prismaMock.graphEntity.findMany.mockResolvedValue([a, b])

    const result = await dedupeGraph()

    expect(result.merged).toBe(0)
    expect(prismaMock.graphEntity.deleteMany).not.toHaveBeenCalled()
  })

  it("#54/V3.0.1: never merges two workspaces' entities sharing a type and label", async () => {
    const mine = { id: 'e1', type: 'method', label: 'Simulation', content: null, origin: 'system', pinned: false, syncKey: 'g:method:simulation', workspaceId: 'user-1', createdAt: new Date('2024-01-01') }
    const theirs = { id: 'e2', type: 'method', label: 'Simulation', content: null, origin: 'system', pinned: false, syncKey: 'g:method:simulation', workspaceId: 'user-2', createdAt: new Date('2024-01-02') }
    prismaMock.graphEntity.findMany.mockResolvedValue([mine, theirs])

    const result = await dedupeGraph()

    expect(result.groups).toBe(0)
    expect(result.merged).toBe(0)
    expect(prismaMock.graphEntity.deleteMany).not.toHaveBeenCalled()
  })

  it('#54/V3.0.1: an explicit workspaceId scopes the initial query', async () => {
    prismaMock.graphEntity.findMany.mockResolvedValue([])

    await dedupeGraph('user-1')

    expect(prismaMock.graphEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'user-1' } })
    )
  })

  it('normalizes a lone entity syncKey to the global scheme', async () => {
    const lone = {
      id: 'e1',
      type: 'gap',
      label: 'Unexplored area',
      content: null,
      origin: 'system',
      pinned: false,
      syncKey: 'job-scoped-key',
      workspaceId: 'default',
      createdAt: new Date(),
    }
    prismaMock.graphEntity.findMany.mockResolvedValue([lone])
    prismaMock.graphEntity.update.mockResolvedValue({})

    const result = await dedupeGraph()

    expect(result.normalized).toBe(1)
    expect(prismaMock.graphEntity.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { syncKey: 'g:gap:unexplored area' },
    })
  })
})
