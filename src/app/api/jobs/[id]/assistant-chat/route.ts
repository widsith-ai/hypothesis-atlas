import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { streamGroqChat, ChatMessage } from '@/lib/groq'
import { hasLLM, LLM_NOT_CONFIGURED_MESSAGE } from '@/lib/llm'
import { buildPaperContext, skillForRequest } from '@/lib/paperSkills'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!hasLLM()) {
    return NextResponse.json(
      { error: LLM_NOT_CONFIGURED_MESSAGE },
      { status: 503 }
    )
  }

  const { messages, persona, skill: skillId, paperContext } = await request.json()
  const chatMessages: ChatMessage[] = Array.isArray(messages) ? messages : []

  const job = await prisma.job.findUnique({ where: { id: params.id } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const sources = await prisma.source.findMany({
    where: { jobId: params.id, reliabilityTier: 'peer_reviewed' },
    take: 12,
    orderBy: { createdAt: 'asc' },
  })

  const top3 = await prisma.top3Ideas.findUnique({ where: { jobId: params.id } })
  const ideas = top3 ? JSON.parse(top3.ideasJson) : []

  const rootNode = job.rootNodeId
    ? await prisma.node.findUnique({ where: { id: job.rootNodeId } })
    : null

  const litContext = sources
    .map(
      (s) =>
        `• ${s.title}${s.venue ? ` (${s.venue})` : ''}${
          s.snippet ? ` — ${s.snippet.slice(0, 200)}` : ''
        }`
    )
    .join('\n')

  const isQuestionBot = persona === 'ask'
  // #99: the Write Paper chat picks a paper skill; older callers send a persona.
  const skill = skillForRequest(persona, skillId)
  const pageContext = buildPaperContext(paperContext)

  const systemPrompt = `You are Atlas, the embedded AI assistant inside Hypothesis Atlas, an evidence-mapping research platform.

## Research Session Context
**Topic:** ${job.topicQuery}
${rootNode ? `**Research overview:** ${rootNode.summary}` : ''}
${
  ideas.length > 0
    ? `**Converged research ideas:**
${ideas
  .slice(0, 3)
  .map(
    (i: any, n: number) =>
      `${n + 1}. ${i.title}${i.problem_to_solve ? ` — ${i.problem_to_solve}` : ''}`
  )
  .join('\n')}`
    : ''
}

**Key literature discovered (peer-reviewed):**
${litContext || 'None available yet.'}
${pageContext ? `\n${pageContext}\n` : ''}
## Your Role
${
  isQuestionBot
    ? `You are the user's question bot for this research session. Answer their questions about the topic, the evidence, the knowledge tree, and the papers above. Ground every answer in the session context — cite specific papers or findings by name. If the answer is not in the context, say so honestly instead of inventing facts. Keep answers concise (under 200 words unless a longer explanation is truly needed).`
    : `**Skill: ${skill!.label}.** ${skill!.instructions}`
}

## Note-Taking Skill
When the user asks you to remember, save, or note something (e.g. "remember that...", "save this...", "note:"), end your reply with a final line that starts with "📝" followed by the note content (a short title, then a dash, then 1-3 sentences). The UI auto-saves anything after 📝 into the user's research notes.`

  const stream = await streamGroqChat(
    chatMessages.length > 0
      ? chatMessages
      : [{ role: 'user', content: 'Please introduce yourself briefly.' }],
    systemPrompt
  )

  if (!stream) {
    return NextResponse.json(
      { error: 'Failed to start the assistant stream.' },
      { status: 500 }
    )
  }

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
