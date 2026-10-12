import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { groq, streamGroqChat, ChatMessage } from '@/lib/groq'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!groq) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY is not configured. Add it to your .env.local file.' },
      { status: 503 }
    )
  }

  const { messages, persona } = await request.json()
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
  const isExperiment = persona === 'experiment'

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

## Your Role
${
  isQuestionBot
    ? `You are the user's question bot for this research session. Answer their questions about the topic, the evidence, the knowledge tree, and the papers above. Ground every answer in the session context — cite specific papers or findings by name. If the answer is not in the context, say so honestly instead of inventing facts. Keep answers concise (under 200 words unless a longer explanation is truly needed).`
    : isExperiment
    ? `You are the experiment designer for this research session. Help the researcher turn their selected idea into a concrete, runnable experiment plan. Ground every suggestion in the session context — cite specific papers, datasets, and methods discovered above by name.

Structure your plans around:
1. **Hypothesis** — the precise falsifiable claim being tested.
2. **Variables** — independent, dependent, and controlled, with concrete values.
3. **Method** — datasets/benchmarks from the session evidence and the exact procedure.
4. **Baselines** — comparison methods from the mapped literature, with the numbers they report.
5. **Metrics** — what you measure and the math behind each metric (write the equations in LaTeX: $...$ inline or $$...$$ display).
6. **Expected results** — concrete quantitative predictions. ALWAYS state the key expected results as plain arithmetic expressions that can be checked (e.g. "expected accuracy gain: 0.843 - 0.812 = 0.031"), and include the equations in LaTeX form as well. When you give an expected value, write the expression that produces it so the verification step can evaluate it.

Be concrete and quantitative. Prefer real numbers (from the papers above, or clearly-labeled assumptions) over vague claims.`
    : `You are the writing assistant working alongside the Atlas Plan tool. Help the researcher finish their paper: clarify concepts, suggest phrasings, structure arguments, explain methods from the literature, and challenge weak reasoning. Ground your help in the session context — cite specific papers or findings by name. Be concise and practical.`
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
