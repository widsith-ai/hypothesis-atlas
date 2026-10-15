import { prisma } from './prisma'

// #58/V3.0.5 — run provenance. ProgressEvent already logs job-level stage
// events; this logs the actual agent steps within a run: the prompt sent,
// which model answered (and the seed it was given, if any — makes the call
// replayable), which tools/APIs were called, what came back, and which
// records it produced.

export interface RunStepInput {
  jobId: string
  step: string
  prompt?: string | null
  model?: string | null
  seed?: number | null
  toolsCalled?: string[]
  output?: unknown
}

export interface RunLogEntry {
  id: string
  jobId: string
  step: string
  prompt: string | null
  model: string | null
  seed: number | null
  toolsCalled: string[]
  output: string | null
  recordIds: string[]
  createdAt: Date
}

const MAX_OUTPUT_CHARS = 8000

function serializeOutput(output: unknown): string | null {
  if (output === undefined || output === null) return null
  const text = typeof output === 'string' ? output : JSON.stringify(output)
  return text.slice(0, MAX_OUTPUT_CHARS)
}

/** Logs one agent step and returns its id, for attachRunLog() to stamp onto the records it produced. */
export async function logRunStep(input: RunStepInput): Promise<string> {
  const entry = await prisma.runLogEntry.create({
    data: {
      jobId: input.jobId,
      step: input.step,
      prompt: input.prompt ?? null,
      model: input.model ?? null,
      seed: input.seed ?? null,
      toolsCalled: input.toolsCalled && input.toolsCalled.length > 0 ? JSON.stringify(input.toolsCalled) : null,
      output: serializeOutput(input.output),
    },
  })
  return entry.id
}

/** Stamps the given Node or Source rows with the run log entry that produced them, and records their ids back on the entry. */
export async function attachRunLog(table: 'node' | 'source', recordIds: string[], runLogId: string): Promise<void> {
  if (recordIds.length === 0) return
  if (table === 'node') {
    await prisma.node.updateMany({ where: { id: { in: recordIds } }, data: { runLogId } })
  } else {
    await prisma.source.updateMany({ where: { id: { in: recordIds } }, data: { runLogId } })
  }
  await prisma.runLogEntry.update({ where: { id: runLogId }, data: { recordIdsJson: JSON.stringify(recordIds) } })
}

export async function getRunLog(jobId: string): Promise<RunLogEntry[]> {
  const entries = await prisma.runLogEntry.findMany({ where: { jobId }, orderBy: { createdAt: 'asc' } })
  return entries.map((e) => ({
    id: e.id,
    jobId: e.jobId,
    step: e.step,
    prompt: e.prompt,
    model: e.model,
    seed: e.seed,
    toolsCalled: e.toolsCalled ? safeParseArray(e.toolsCalled) : [],
    output: e.output,
    recordIds: e.recordIdsJson ? safeParseArray(e.recordIdsJson) : [],
    createdAt: e.createdAt,
  }))
}

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
