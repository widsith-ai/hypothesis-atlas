// SPDX-License-Identifier: AGPL-3.0-only
import { NextResponse } from 'next/server'
import { GROQ_MODEL } from '@/lib/groq'
import { getEdition, shouldOfferUserKeys } from '@/lib/edition'

export const dynamic = 'force-dynamic'

/**
 * #88/V4.8.1: what the Model & API key UI needs to know about this server —
 * whether it has its own model key to fall back on. #91: plus which edition
 * this is, and whether to actively offer users their own key. Never returns
 * key values.
 */
export async function GET() {
  const serverModel = process.env.GROQ_API_KEY ? { provider: 'groq', model: GROQ_MODEL } : null
  const edition = getEdition()
  return NextResponse.json({
    serverModel,
    edition,
    offerUserKeys: shouldOfferUserKeys(edition, serverModel !== null),
  })
}
