import { NextRequest, NextResponse } from 'next/server'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { prisma } from '@/lib/prisma'
import { groq } from '@/lib/groq'
import { populateNeo4jGraph } from '@/lib/neo4j-paper-graph'
import { syncJobGraph } from '@/lib/research-graph'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAuthRequired } from '@/lib/authConfig'
import { stripGlyphMappingArtifacts } from '@/lib/textExtraction'

export const maxDuration = 60

const MAX_CHARS = 24000

function fileBaseName(name: string): string {
  return name.replace(/\.(pdf|txt|md)$/i, '').replace(/[_-]+/g, ' ').trim()
}

function cleanText(raw: string): string {
  return stripGlyphMappingArtifacts(raw)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractPaperInsight(text: string, fallbackTitle: string) {
  const empty = {
    title: fallbackTitle,
    summary: text.slice(0, 500),
    methods: [] as string[],
    findings: [] as string[],
    disagreements: [] as string[],
    openProblems: [] as string[],
    subtopics: [] as { label: string; summary: string; findings: string[] }[],
  }

  if (!groq) return empty

  const prompt = `Analyze this academic paper and return a JSON object with exactly these fields:
{
  "title": "the paper title (short, no journal suffix)",
  "summary": "3-4 sentence overview of what the paper does and concludes",
  "methods": ["key methodology points, up to 4"],
  "findings": ["main results/findings, up to 5"],
  "disagreements": ["limitations or contested claims mentioned, up to 3 — empty array if none"],
  "openProblems": ["open problems or future work mentioned, up to 3 — empty array if none"],
  "subtopics": [
    { "label": "short subtopic name", "summary": "one sentence", "findings": ["up to 2 findings"] }
  ]
}
Return 3 to 5 subtopics that partition the paper's contributions. Ground every field strictly in the paper text.

=== PAPER START ===
${text.slice(0, MAX_CHARS)}${text.length > MAX_CHARS ? '\n… [truncated]' : ''}
=== PAPER END ===`

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are a precise paper analyzer. Respond with valid JSON only, grounded strictly in the provided paper text.',
        },
        { role: 'user', content: prompt },
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0.3,
      max_tokens: 3000,
    })

    const content = completion.choices[0]?.message?.content || ''
    const match = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
    const parsed = JSON.parse((match ? match[1] : content).trim())

    return {
      title: (parsed.title || fallbackTitle).toString().slice(0, 200),
      summary: (parsed.summary || empty.summary).toString(),
      methods: Array.isArray(parsed.methods) ? parsed.methods.map(String).slice(0, 4) : [],
      findings: Array.isArray(parsed.findings) ? parsed.findings.map(String).slice(0, 5) : [],
      disagreements: Array.isArray(parsed.disagreements)
        ? parsed.disagreements.map(String).slice(0, 3)
        : [],
      openProblems: Array.isArray(parsed.openProblems)
        ? parsed.openProblems.map(String).slice(0, 3)
        : [],
      subtopics: Array.isArray(parsed.subtopics)
        ? parsed.subtopics
            .filter((s: any) => s?.label)
            .slice(0, 5)
            .map((s: any) => ({
              label: String(s.label).slice(0, 80),
              summary: String(s.summary ?? ''),
              findings: Array.isArray(s.findings) ? s.findings.map(String).slice(0, 2) : [],
            }))
        : [],
    }
  } catch (err) {
    console.error('Paper insight extraction failed:', err)
    return empty
  }
}

export async function POST(request: NextRequest) {
  // #36/V3.6: same gate and owner stamp as POST /api/jobs. Checked before
  // parsing the upload so an anonymous request never reaches the LLM call.
  const session = await getServerSession(authOptions)
  if (isAuthRequired() && !session?.user?.id) {
    return NextResponse.json({ error: 'Sign in to start new research.' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Upload too large or malformed. Max 10 MB.' },
      { status: 413 }
    )
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  const isText = /\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/')

  if (!isPdf && !isText) {
    return NextResponse.json(
      { error: 'Unsupported file type. Upload a PDF, TXT, or MD file.' },
      { status: 400 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  let rawText: string

  try {
    rawText = isPdf ? (await pdfParse(bytes)).text : bytes.toString('utf-8')
  } catch (err) {
    console.error('Text extraction failed:', err)
    return NextResponse.json(
      { error: 'Could not extract text from this file. Scanned/image PDFs are not supported.' },
      { status: 422 }
    )
  }

  const text = cleanText(rawText)
  if (text.length < 200) {
    return NextResponse.json(
      { error: 'Too little text extracted from this file to start a session.' },
      { status: 422 }
    )
  }

  // Text-only extraction for the Peer Review page — no job created
  if (form.get('textOnly') === '1') {
    return NextResponse.json({ text, fileName: file.name })
  }

  const fallbackTitle = fileBaseName(file.name) || 'Uploaded Paper'
  const insight = await extractPaperInsight(text, fallbackTitle)

  const now = () => Date.now()

  const job = await prisma.job.create({
    data: { topicQuery: insight.title, status: 'processing', userId: session?.user?.id ?? null },
  })

  const skipped = 'Skipped — paper provided directly'
  await prisma.progressEvent.createMany({
    data: [
      {
        jobId: job.id,
        stage: 'init',
        status: 'completed',
        message: `Paper upload received — extracted ${text.length.toLocaleString()} characters from ${file.name}`,
        timestamp: now(),
      },
      { jobId: job.id, stage: 'expand_query', status: 'completed', message: skipped, timestamp: now() },
      {
        jobId: job.id,
        stage: 'fetch_papers',
        status: 'completed',
        count: 1,
        message: 'Using your uploaded paper as the evidence base',
        timestamp: now(),
      },
      { jobId: job.id, stage: 'fetch_datasets', status: 'completed', message: skipped, timestamp: now() },
      { jobId: job.id, stage: 'fetch_social', status: 'completed', message: skipped, timestamp: now() },
      {
        jobId: job.id,
        stage: 'rank_sources',
        status: 'completed',
        count: 1,
        message: 'Uploaded paper ranked as primary evidence (peer-reviewed tier)',
        timestamp: now(),
      },
    ],
  })

  const source = await prisma.source.create({
    data: {
      jobId: job.id,
      type: 'uploaded_paper',
      title: insight.title,
      snippet: text.slice(0, 1200),
      reliabilityTier: 'peer_reviewed',
    },
  })

  const rootNode = await prisma.node.create({
    data: {
      jobId: job.id,
      label: insight.title,
      summary: insight.summary,
      methodsJson: JSON.stringify(insight.methods),
      findingsJson: JSON.stringify(insight.findings),
      disagreementsJson: JSON.stringify(insight.disagreements),
      openProblemsJson: JSON.stringify(insight.openProblems),
      depth: 0,
      nodeSources: { create: { sourceId: source.id, role: 'primary' } },
    },
  })

  for (const sub of insight.subtopics) {
    const child = await prisma.node.create({
      data: {
        jobId: job.id,
        parentId: rootNode.id,
        label: sub.label,
        summary: sub.summary,
        findingsJson: JSON.stringify(sub.findings),
        depth: 1,
      },
    })
    await prisma.nodeSource.create({
      data: { nodeId: child.id, sourceId: source.id, role: 'supporting' },
    })
  }

  await prisma.job.update({
    where: { id: job.id },
    data: { status: 'completed', rootNodeId: rootNode.id },
  })

  await prisma.progressEvent.createMany({
    data: [
      {
        jobId: job.id,
        stage: 'build_root',
        status: 'completed',
        message: `Root topic created from paper: "${insight.title}"`,
        timestamp: now(),
      },
      {
        jobId: job.id,
        stage: 'build_children',
        status: 'completed',
        count: insight.subtopics.length,
        message: `${insight.subtopics.length} subtopics extracted from your paper`,
        timestamp: now(),
      },
      {
        jobId: job.id,
        stage: 'complete',
        status: 'completed',
        message: 'Session ready — explore the knowledge tree built from your paper',
        timestamp: now(),
      },
    ],
  })

  try {
    await populateNeo4jGraph(job.id)
  } catch (err) {
    console.warn('Neo4j population skipped for uploaded paper:', err)
  }

  try {
    await syncJobGraph(job.id)
  } catch (err) {
    console.warn('Research graph sync skipped for uploaded paper:', err)
  }

  return NextResponse.json({ jobId: job.id, title: insight.title })
}
