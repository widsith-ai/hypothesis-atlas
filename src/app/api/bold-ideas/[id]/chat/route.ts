// SPDX-License-Identifier: AGPL-3.0-only
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { streamGroqChat, ChatMessage } from '@/lib/groq'
import { hasLLM, LLM_NOT_CONFIGURED_MESSAGE } from '@/lib/llm'
import type { BoldIdeaAgentTrace } from '@/lib/boldIdeaAgents'

/**
 * Chat for a Bold Idea session — grounds answers in the trace already
 * produced by runBoldIdeaAgents() (candidates, papers, summary/gaps/next
 * steps), stored on the idea at creation time. This makes exactly one Groq
 * call per message; it never re-runs the Explorer/Literature/Critic/Paper
 * Analyzer pipeline, so chatting here doesn't duplicate those API calls.
 *
 * A bold idea has no Job row (see lib/boldIdeaAgents.ts), so this is a
 * separate endpoint from /api/jobs/[id]/assistant-chat rather than that
 * route with a fallback lookup — it would otherwise 404 against
 * prisma.job.findUnique for every bold idea message.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasLLM()) {
    return NextResponse.json(
      { error: LLM_NOT_CONFIGURED_MESSAGE },
      { status: 503 }
    )
  }

  const { messages } = await request.json()
  const chatMessages: ChatMessage[] = Array.isArray(messages) ? messages : []

  const idea = await prisma.boldIdea.findUnique({ where: { id: params.id } })
  if (!idea) return NextResponse.json({ error: 'Bold idea not found' }, { status: 404 })

  const tags = JSON.parse(idea.tagsJson) as string[]
  const trace: BoldIdeaAgentTrace | null = idea.agentTraceJson
    ? JSON.parse(idea.agentTraceJson)
    : null

  const candidateBlock = trace
    ? trace.candidates
        .map((c) => `- "${c.title}" (${c.verdict}): ${c.rationale} — ${c.critique}`)
        .join('\n')
    : 'None available.'

  const paperBlock = trace
    ? trace.papers
        .map((p) => `- "${p.title}" (${p.year}) — Method: ${p.method} | Summary: ${p.summary} | Gap: ${p.gap}`)
        .join('\n')
    : 'None available.'

  const systemPrompt = `You are Atlas, the embedded AI assistant inside Hypothesis Atlas, helping the researcher think through a "Bold Idea" exploration.

## Bold Idea
"${idea.text}"
**Tags:** ${tags.join(', ')}

## Multi-agent exploration already run for this idea
**Candidate directions:**
${candidateBlock}

**Papers found:**
${paperBlock}

**Overall summary:** ${trace?.overallSummary ?? 'Not available.'}
**Gap:** ${trace?.gaps ?? 'Not available.'}
**What can still be done:** ${trace?.nextSteps ?? 'Not available.'}

## Your Role
Help the researcher dig into this exploration: explain a candidate direction or paper in more depth, suggest how to close the stated gap, or help them decide what to try next. Ground every answer in the context above — cite specific candidates or papers by name. If something isn't covered by this context, say so honestly rather than inventing it. Keep answers concise (under 200 words unless a longer explanation is truly needed).`

  const stream = await streamGroqChat(
    chatMessages.length > 0
      ? chatMessages
      : [{ role: 'user', content: 'Please introduce yourself briefly.' }],
    systemPrompt
  )

  if (!stream) {
    return NextResponse.json({ error: 'Failed to start the assistant stream.' }, { status: 500 })
  }

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
