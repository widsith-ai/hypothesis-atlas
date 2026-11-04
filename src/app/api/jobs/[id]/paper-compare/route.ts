import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLLMPreferringServerAnthropic } from '@/lib/llm'

interface KnowledgeNodeRow {
  nodeId: string
  node: { label: string }
}

interface SourceWithNodes {
  id: string
  title: string
  venue: string | null
  snippet: string | null
  nodeSources: KnowledgeNodeRow[]
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as { paperAId?: string; paperBId?: string }
    const { paperAId, paperBId } = body

    if (!paperAId || !paperBId) {
      return NextResponse.json(
        { error: 'paperAId and paperBId are required' },
        { status: 400 }
      )
    }

    // Fetch both papers with their knowledge nodes
    const [sourceA, sourceB] = await Promise.all([
      prisma.source.findUnique({
        where: { id: paperAId },
        include: {
          nodeSources: {
            include: { node: true },
          },
        },
      }),
      prisma.source.findUnique({
        where: { id: paperBId },
        include: {
          nodeSources: {
            include: { node: true },
          },
        },
      }),
    ])

    if (!sourceA || !sourceB) {
      return NextResponse.json({ error: 'One or both papers not found' }, { status: 404 })
    }

    const typedA = sourceA as unknown as SourceWithNodes
    const typedB = sourceB as unknown as SourceWithNodes

    // #88: the user's own key (any provider) if sent, else the server's
    // Anthropic key as before, else the non-LLM fallback below.
    const llm = getLLMPreferringServerAnthropic()
    if (llm) {
      const knowledgeAreasA = typedA.nodeSources
        .map((ns: KnowledgeNodeRow) => ns.node.label)
        .join(', ') || 'N/A'
      const knowledgeAreasB = typedB.nodeSources
        .map((ns: KnowledgeNodeRow) => ns.node.label)
        .join(', ') || 'N/A'

      const userMessage = `Paper A:
Title: ${typedA.title}
Venue: ${typedA.venue ?? 'Unknown'}
Snippet: ${typedA.snippet ?? 'No abstract available'}
Knowledge Areas: ${knowledgeAreasA}

Paper B:
Title: ${typedB.title}
Venue: ${typedB.venue ?? 'Unknown'}
Snippet: ${typedB.snippet ?? 'No abstract available'}
Knowledge Areas: ${knowledgeAreasB}`

      const systemPrompt = `You are an academic research analyst. Compare two papers clearly and concisely.

Produce EXACTLY this JSON structure (no markdown, no explanation outside JSON):
{
  "approachComparison": {
    "summary": "one sentence",
    "paperA": "2-3 sentences on Paper A's method/approach",
    "paperB": "2-3 sentences on Paper B's method/approach",
    "keyDifference": "one sentence on the core methodological difference"
  },
  "gapAnalysis": {
    "paperAGap": "2-3 sentences on what Paper A leaves unanswered",
    "paperBGap": "2-3 sentences on what Paper B leaves unanswered",
    "combinedOpportunity": "1-2 sentences on what combining insights from both could unlock"
  }
}`

      const response = await llm.client.chat.completions.create({
        model: llm.model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      })

      const rawText = response.choices[0]?.message?.content ?? ''

      // Strip potential markdown fences
      const jsonText = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim()

      const parsed = JSON.parse(jsonText)
      return NextResponse.json(parsed)
    }

    // Fallback: compute overlap without Claude
    const nodeIdsA = new Set(typedA.nodeSources.map((ns: KnowledgeNodeRow) => ns.nodeId))
    const sharedNodes = typedB.nodeSources.filter((ns: KnowledgeNodeRow) =>
      nodeIdsA.has(ns.nodeId)
    )
    const sharedLabels = sharedNodes.map((ns: KnowledgeNodeRow) => ns.node.label).join(', ') || 'none identified'
    const overlapCount = sharedNodes.length

    const fallback = {
      approachComparison: {
        summary: `These two papers share ${overlapCount} knowledge node(s), suggesting ${
          overlapCount > 3 ? 'significant' : overlapCount > 0 ? 'some' : 'little'
        } methodological overlap.`,
        paperA: `"${typedA.title}" covers ${typedA.nodeSources.length} knowledge areas. Venue: ${typedA.venue ?? 'Unknown'}.`,
        paperB: `"${typedB.title}" covers ${typedB.nodeSources.length} knowledge areas. Venue: ${typedB.venue ?? 'Unknown'}.`,
        keyDifference:
          overlapCount === 0
            ? 'The papers address entirely different knowledge domains with no shared nodes.'
            : `Both papers engage with: ${sharedLabels}.`,
      },
      gapAnalysis: {
        paperAGap: `Paper A has ${typedA.nodeSources.length - overlapCount} unique knowledge nodes not covered by Paper B, representing potential gaps from Paper B's perspective.`,
        paperBGap: `Paper B has ${typedB.nodeSources.length - overlapCount} unique knowledge nodes not covered by Paper A, representing potential gaps from Paper A's perspective.`,
        combinedOpportunity:
          overlapCount > 0
            ? `Combining insights around the shared areas (${sharedLabels}) could bridge methodological differences and open new research directions.`
            : 'Integrating these two non-overlapping perspectives could produce a novel cross-domain synthesis.',
      },
    }

    return NextResponse.json(fallback)
  } catch (error) {
    console.error('Error comparing papers:', error)
    return NextResponse.json({ error: 'Failed to compare papers' }, { status: 500 })
  }
}
