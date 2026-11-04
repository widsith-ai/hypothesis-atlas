// SPDX-License-Identifier: AGPL-3.0-only
import { NextResponse } from 'next/server'
import { GROQ_MODEL } from '@/lib/groq'

export const dynamic = 'force-dynamic'

/**
 * #88/V4.8.1: what the Model & API key dialog needs to know about this
 * server — whether it has its own model key to fall back on. Never returns
 * key values.
 */
export async function GET() {
  return NextResponse.json({
    serverModel: process.env.GROQ_API_KEY ? { provider: 'groq', model: GROQ_MODEL } : null,
  })
}
