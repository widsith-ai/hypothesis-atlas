import { NextRequest, NextResponse } from 'next/server'
import { groq, streamGroqChat, type ChatMessage } from '@/lib/groq'

// #22/V4.2: the Workspace page's chat pane isn't scoped to one research run
// the way /api/jobs/[id]/assistant-chat is — it's the entrance, before any
// run has necessarily been picked. This is the same Groq-backed streaming
// assistant, just without a Job to ground answers in; once a run is active
// in the sidebar (see #23/#24), a future pass can thread that context in.
const SYSTEM_PROMPT = `You are Atlas, the embedded AI assistant inside Hypothesis Atlas, a multi-domain evidence-mapping research platform.

You're talking to the researcher from the Workspace page — the app's chat-first entrance, before they've necessarily opened a specific research run. Help them get oriented: explain what the platform can do (evidence mapping, the persistent research graph, Atlas Plan for paper writing, peer review, experiment verification), answer general research questions, and point them toward starting a new run or opening an existing one when that's the right next step. Be concise and practical.

When the user asks you to remember, save, or note something, end your reply with a final line starting with "📝" followed by the note content — but mention that notes only save once a research run is open (this chat has no run to attach a note to yet).`

export async function POST(request: NextRequest) {
  if (!groq) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY is not configured. Add it to your .env.local file.' },
      { status: 503 }
    )
  }

  const { messages } = await request.json()
  const chatMessages: ChatMessage[] = Array.isArray(messages) ? messages : []

  const stream = await streamGroqChat(
    chatMessages.length > 0 ? chatMessages : [{ role: 'user', content: 'Please introduce yourself briefly.' }],
    SYSTEM_PROMPT
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
