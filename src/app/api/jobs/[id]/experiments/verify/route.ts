import { NextRequest, NextResponse } from 'next/server'
import { getLLM, hasLLM, LLM_NOT_CONFIGURED_MESSAGE } from '@/lib/llm'
import { create, all } from 'mathjs'

const math = create(all)

interface IncomingMessage {
  role: string
  content: string
}

interface RawClaim {
  claim?: string
  expression?: string
  expected?: string | number
}

interface ClaimResult {
  claim: string
  expression: string
  expected: string
  computed: number | null
  ok: boolean | null
  note?: string
}

function toAsciiMath(expr: string): string {
  // mathjs accepts ^ for power; strip LaTeX-isms that slip through
  return expr
    .replace(/\\times|\\cdot|\\ast/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\\sqrt(\d)/g, 'sqrt($1)')
    .replace(/\\left|\\right|\\,/g, '')
    .replace(/\^\{([^}]*)\}/g, '^($1)')
    .trim()
}

function closeEnough(a: number, b: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b))
  return Math.abs(a - b) <= 1e-6 * scale
}

async function extractClaims(transcript: string): Promise<RawClaim[]> {
  const llm = getLLM()
  if (!llm) return []
  for (let attempt = 0; attempt < 2; attempt++) {
    const extraction = await llm.client.chat.completions.create({
      model: llm.model,
      temperature: 0,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content:
            'Extract up to 5 quantitative claims from the experiment plan that can be CHECKED BY EVALUATING a plain math expression. Look especially at the "Expected Results" / "Expected improvements" section: it always contains rate calculations, sample-size products (replicates × conditions × timepoints), and differences (baseline vs. proposed). Convert any LaTeX (\\times, \\frac, ^{}, \\sqrt, aligned blocks) to ASCII math that JavaScript/mathjs can evaluate: + - * / ^ parentheses, sqrt(), e-notation like 3.79e-7. Only extract claims where both a numeric expression and its claimed value appear (e.g. "0.843 - 0.812 = 0.031"). Respond with ONLY JSON: {"claims":[{"claim":"short description","expression":"0.843 - 0.812","expected":"0.031"}]}',
        },
        { role: 'user', content: transcript },
      ],
    })

    const raw = extraction.choices[0]?.message?.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed.claims) && parsed.claims.length > 0) {
          return parsed.claims
        }
      } catch {
        // fall through to retry
      }
    }
  }
  return []
}

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

  const { messages } = (await request.json()) as { messages?: IncomingMessage[] }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  const transcript = messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-6)
    .map((m) => {
      const content = m.content
      const label = m.role === 'user' ? 'User' : 'Assistant'
      // Keep both ends of long plans: setup context at the top, expected results at the tail
      if (content.length > 3200) {
        return `${label}: ${content.slice(0, 800)}\n...[middle omitted]...\n${content.slice(-2400)}`
      }
      return `${label}: ${content.slice(0, 3000)}`
    })
    .join('\n\n')

  const claims = await extractClaims(transcript)

  const results: ClaimResult[] = claims.slice(0, 5).map((c) => {
    const claim = String(c.claim ?? '').trim() || 'Untitled claim'
    const expression = String(c.expression ?? '').trim()
    const expectedRaw = String(c.expected ?? '').trim()
    if (!expression || !expectedRaw) {
      return { claim, expression, expected: expectedRaw, computed: null, ok: null, note: 'Incomplete claim data' }
    }
    try {
      const computed = math.evaluate(toAsciiMath(expression)) as number
      if (typeof computed !== 'number' || !isFinite(computed)) {
        return { claim, expression, expected: expectedRaw, computed: null, ok: null, note: 'Expression did not produce a finite number' }
      }
      let expected: number
      try {
        expected = math.evaluate(toAsciiMath(expectedRaw)) as number
      } catch {
        expected = Number(expectedRaw)
      }
      if (typeof expected !== 'number' || !isFinite(expected)) {
        return { claim, expression, expected: expectedRaw, computed, ok: null, note: 'Expected value is not numeric' }
      }
      const ok = closeEnough(computed, expected)
      let note: string | undefined
      if (!ok) {
        try {
          const diff = math.simplify(`${toAsciiMath(expression)} - (${toAsciiMath(expectedRaw)})`)
          if (String(diff) === '0') {
            return { claim, expression, expected: expectedRaw, computed, ok: true, note: 'Symbolically equivalent (mathjs simplify)' }
          }
        } catch {
          // no symbolic fallback
        }
        note = 'Mismatch — check for rounding of intermediate values'
      }
      return { claim, expression, expected: expectedRaw, computed, ok, note }
    } catch {
      return { claim, expression, expected: expectedRaw, computed: null, ok: null, note: 'Could not evaluate expression' }
    }
  })

  return NextResponse.json({ results })
}
