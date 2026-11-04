// SPDX-License-Identifier: AGPL-3.0-only
import { NextRequest, NextResponse } from 'next/server'
import { createUserLLMClient, redactSecrets } from '@/lib/llm'
import { validateLLMConfig } from '@/lib/llmProviders'

export const dynamic = 'force-dynamic'

/**
 * #88/V4.8.1: "Test key". Makes one tiny call with the submitted
 * provider/model/key and reports success or the provider's error (with the
 * key scrubbed out). Nothing is stored or logged.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const result = validateLLMConfig(body ?? {})
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })

  const { config } = result
  try {
    const client = createUserLLMClient(config)
    const completion = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      max_tokens: 64,
      temperature: 0,
    })
    const reply = (completion.choices[0]?.message?.content ?? '').trim().slice(0, 40)
    return NextResponse.json({ ok: true, provider: config.provider, model: config.model, reply })
  } catch (err) {
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : undefined
    const message = redactSecrets(err instanceof Error ? err.message : 'Request failed', config.apiKey)
    return NextResponse.json({ ok: false, status, error: message }, { status: 200 })
  }
}
