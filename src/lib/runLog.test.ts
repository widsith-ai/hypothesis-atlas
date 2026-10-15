import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    runLogEntry: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    node: { updateMany: vi.fn() },
    source: { updateMany: vi.fn() },
  },
}))
vi.mock('./prisma', () => ({ prisma: prismaMock }))

import { logRunStep, attachRunLog, getRunLog } from './runLog'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logRunStep', () => {
  it('creates a run log entry and returns its id', async () => {
    prismaMock.runLogEntry.create.mockResolvedValue({ id: 'log-1' })
    const id = await logRunStep({ jobId: 'job-1', step: 'expand_query', prompt: 'p', model: 'm', seed: 42, toolsCalled: ['openalex.search'], output: { keywords: ['a'] } })
    expect(id).toBe('log-1')
    expect(prismaMock.runLogEntry.create).toHaveBeenCalledWith({
      data: {
        jobId: 'job-1',
        step: 'expand_query',
        prompt: 'p',
        model: 'm',
        seed: 42,
        toolsCalled: JSON.stringify(['openalex.search']),
        output: JSON.stringify({ keywords: ['a'] }),
      },
    })
  })

  it('omits toolsCalled when empty and serializes a string output as-is', async () => {
    prismaMock.runLogEntry.create.mockResolvedValue({ id: 'log-1' })
    await logRunStep({ jobId: 'job-1', step: 'build_root_node', output: 'raw text' })
    expect(prismaMock.runLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toolsCalled: null, output: 'raw text', prompt: null, model: null, seed: null }),
    })
  })

  it('truncates an overly long output', async () => {
    prismaMock.runLogEntry.create.mockResolvedValue({ id: 'log-1' })
    const huge = 'x'.repeat(10_000)
    await logRunStep({ jobId: 'job-1', step: 'x', output: huge })
    const call = prismaMock.runLogEntry.create.mock.calls[0][0]
    expect(call.data.output.length).toBe(8000)
  })
})

describe('attachRunLog', () => {
  it('stamps the given node ids and records them back on the entry', async () => {
    await attachRunLog('node', ['n1', 'n2'], 'log-1')
    expect(prismaMock.node.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['n1', 'n2'] } }, data: { runLogId: 'log-1' } })
    expect(prismaMock.runLogEntry.update).toHaveBeenCalledWith({ where: { id: 'log-1' }, data: { recordIdsJson: JSON.stringify(['n1', 'n2']) } })
  })

  it('stamps source ids when table is "source"', async () => {
    await attachRunLog('source', ['s1'], 'log-1')
    expect(prismaMock.source.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['s1'] } }, data: { runLogId: 'log-1' } })
  })

  it('does nothing for an empty record list', async () => {
    await attachRunLog('node', [], 'log-1')
    expect(prismaMock.node.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.runLogEntry.update).not.toHaveBeenCalled()
  })
})

describe('getRunLog', () => {
  it('parses toolsCalled and recordIds JSON back into arrays', async () => {
    prismaMock.runLogEntry.findMany.mockResolvedValue([
      {
        id: 'log-1', jobId: 'job-1', step: 'fetch_sources', prompt: null, model: null, seed: null,
        toolsCalled: JSON.stringify(['openalex.search', 'pubmed.search']),
        output: null,
        recordIdsJson: JSON.stringify(['s1', 's2']),
        createdAt: new Date('2026-01-01'),
      },
    ])
    const log = await getRunLog('job-1')
    expect(log).toHaveLength(1)
    expect(log[0].toolsCalled).toEqual(['openalex.search', 'pubmed.search'])
    expect(log[0].recordIds).toEqual(['s1', 's2'])
  })

  it('returns empty arrays for null JSON columns', async () => {
    prismaMock.runLogEntry.findMany.mockResolvedValue([
      { id: 'log-1', jobId: 'job-1', step: 'x', prompt: null, model: null, seed: null, toolsCalled: null, output: null, recordIdsJson: null, createdAt: new Date() },
    ])
    const log = await getRunLog('job-1')
    expect(log[0].toolsCalled).toEqual([])
    expect(log[0].recordIds).toEqual([])
  })

  it('tolerates malformed JSON without throwing', async () => {
    prismaMock.runLogEntry.findMany.mockResolvedValue([
      { id: 'log-1', jobId: 'job-1', step: 'x', prompt: null, model: null, seed: null, toolsCalled: '{not json', output: null, recordIdsJson: null, createdAt: new Date() },
    ])
    const log = await getRunLog('job-1')
    expect(log[0].toolsCalled).toEqual([])
  })
})
