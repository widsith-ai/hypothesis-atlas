import { randomInt } from 'crypto'
import { prisma } from '../lib/prisma'
import { emitProgressEvent } from '../lib/events'
import { searchOpenAlex, reconstructAbstract } from '../lib/apis/openalex'
import { searchPubMed } from '../lib/apis/pubmed'
import { searchGEO } from '../lib/apis/geo'
import { searchSocialSignals } from '../lib/apis/social'
import { generateWithGroq, GROQ_MODEL } from '../lib/groq'
import { populateNeo4jGraph } from '../lib/neo4j-paper-graph'
import { syncJobGraph } from '../lib/research-graph'
import { logRunStep, attachRunLog } from '../lib/runLog'

// #58/V3.0.5: a fresh seed per agent step, actually sent to the model (see
// generateWithGroq) and logged alongside it — makes the exact call replayable.
function newSeed(): number {
  return randomInt(0, 2 ** 31 - 1)
}

export async function processEvidenceMapping(data: { jobId: string; topicQuery: string }) {
  const { jobId, topicQuery } = data

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'processing' },
    })

    await emitProgressEvent({
      jobId,
      stage: 'init',
      status: 'started',
      message: 'Starting evidence mapping pipeline',
      timestamp: Date.now(),
    })

    const expandedKeywords = await expandQuery(jobId, topicQuery)
    const allSources = await fetchAllSources(jobId, topicQuery, expandedKeywords)
    const rankedSources = await rankAndDedupe(jobId, allSources)
    const rootNode = await buildRootNode(jobId, topicQuery, rankedSources)
    await buildChildNodes(jobId, topicQuery, rootNode.id, rankedSources)
    await populateNeo4jGraph(jobId)
    await syncJobGraph(jobId)

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'completed' },
    })

    await emitProgressEvent({
      jobId,
      stage: 'complete',
      status: 'completed',
      message: 'Evidence mapping completed successfully',
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('Evidence mapping error:', error)
    
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed' },
    })

    await emitProgressEvent({
      jobId,
      stage: 'error',
      status: 'error',
      message: `Pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
    })
  }
}

async function expandQuery(jobId: string, query: string): Promise<string[]> {
  await emitProgressEvent({
    jobId,
    stage: 'expand_query',
    status: 'started',
    message: 'Expanding query with related keywords',
    timestamp: Date.now(),
  })

  const prompt = `Given the research topic "${query}", generate 8-12 related keywords, synonyms, and specific subtopics that would help find relevant scientific papers. Return as JSON: {"keywords": ["keyword1", "keyword2", ...]}`
  const seed = newSeed()
  const result = await generateWithGroq(prompt, undefined, undefined, seed)
  const keywords = result.keywords || [query]

  await logRunStep({ jobId, step: 'expand_query', prompt, model: GROQ_MODEL, seed, output: result })

  await emitProgressEvent({
    jobId,
    stage: 'expand_query',
    status: 'completed',
    message: `Generated ${keywords.length} related keywords`,
    count: keywords.length,
    timestamp: Date.now(),
  })

  return keywords
}

async function fetchAllSources(jobId: string, query: string, keywords: string[]) {
  const allSources: any[] = []

  await emitProgressEvent({
    jobId,
    stage: 'fetch_papers',
    status: 'started',
    message: 'Searching OpenAlex and PubMed for papers',
    timestamp: Date.now(),
  })

  const openAlexWorks = await searchOpenAlex(query, 20)
  for (const work of openAlexWorks) {
    const authors = work.authorships?.map(a => a.author.display_name).slice(0, 5) || []
    const abstract = reconstructAbstract(work.abstract_inverted_index)

    const source = await prisma.source.create({
      data: {
        jobId,
        type: 'paper',
        title: work.title || 'Untitled',
        url: work.doi ? `https://doi.org/${work.doi}` : work.id,
        publishedAt: work.publication_date ? new Date(work.publication_date) : null,
        authorsJson: JSON.stringify(authors),
        venue: work.primary_location?.source?.display_name || '',
        snippet: abstract,
        externalId: work.id,
        reliabilityTier: mapOpenAlexType(work.type),
      },
    })
    allSources.push(source)
  }

  const pubmedArticles = await searchPubMed(query, 15)
  for (const article of pubmedArticles) {
    const source = await prisma.source.create({
      data: {
        jobId,
        type: 'paper',
        title: article.title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
        publishedAt: article.pubDate ? new Date(`${article.pubDate}-01-01`) : null,
        authorsJson: JSON.stringify(article.authors),
        venue: article.journal,
        snippet: article.abstract,
        externalId: article.pmid,
        reliabilityTier: mapPubMedType(article.pubType),
      },
    })
    allSources.push(source)
  }

  await emitProgressEvent({
    jobId,
    stage: 'fetch_papers',
    status: 'completed',
    message: `Found ${allSources.length} papers`,
    count: allSources.length,
    timestamp: Date.now(),
  })

  {
    const paperLog = await logRunStep({
      jobId,
      step: 'fetch_sources',
      toolsCalled: ['openalex.search', 'pubmed.search'],
      output: { query, openAlexCount: openAlexWorks.length, pubmedCount: pubmedArticles.length },
    })
    await attachRunLog('source', allSources.map((s) => s.id), paperLog)
  }

  await emitProgressEvent({
    jobId,
    stage: 'fetch_datasets',
    status: 'started',
    message: 'Searching GEO for datasets',
    timestamp: Date.now(),
  })

  const geoDatasets = await searchGEO(query, 10)
  for (const dataset of geoDatasets) {
    const source = await prisma.source.create({
      data: {
        jobId,
        type: 'dataset',
        title: dataset.title,
        url: `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${dataset.accession}`,
        publishedAt: dataset.submissionDate ? new Date(dataset.submissionDate) : null,
        authorsJson: null,
        venue: 'GEO',
        snippet: dataset.summary,
        externalId: dataset.accession,
        reliabilityTier: 'dataset',
      },
    })
    allSources.push(source)
  }

  await emitProgressEvent({
    jobId,
    stage: 'fetch_datasets',
    status: 'completed',
    message: `Found ${geoDatasets.length} datasets`,
    count: geoDatasets.length,
    timestamp: Date.now(),
  })

  {
    const datasetSourceIds = allSources.slice(allSources.length - geoDatasets.length).map((s) => s.id)
    const datasetLog = await logRunStep({
      jobId,
      step: 'fetch_sources',
      toolsCalled: ['geo.search'],
      output: { query, geoCount: geoDatasets.length },
    })
    await attachRunLog('source', datasetSourceIds, datasetLog)
  }

  await emitProgressEvent({
    jobId,
    stage: 'fetch_social',
    status: 'started',
    message: 'Gathering social signals (GitHub, Twitter)',
    timestamp: Date.now(),
  })

  const socialSignals = await searchSocialSignals(query, 5)
  for (const signal of socialSignals) {
    const source = await prisma.source.create({
      data: {
        jobId,
        type: 'social',
        title: signal.title,
        url: signal.url,
        publishedAt: new Date(signal.date),
        authorsJson: JSON.stringify([signal.author]),
        venue: signal.platform,
        snippet: signal.snippet,
        externalId: signal.id,
        reliabilityTier: 'social_signal',
      },
    })
    allSources.push(source)
  }

  await emitProgressEvent({
    jobId,
    stage: 'fetch_social',
    status: 'completed',
    message: `Found ${socialSignals.length} social signals`,
    count: socialSignals.length,
    timestamp: Date.now(),
  })

  {
    const socialSourceIds = allSources.slice(allSources.length - socialSignals.length).map((s) => s.id)
    const socialLog = await logRunStep({
      jobId,
      step: 'fetch_sources',
      toolsCalled: ['social.search'],
      output: { query, socialCount: socialSignals.length },
    })
    await attachRunLog('source', socialSourceIds, socialLog)
  }

  return allSources
}

async function rankAndDedupe(jobId: string, sources: any[]) {
  await emitProgressEvent({
    jobId,
    stage: 'rank_sources',
    status: 'started',
    message: 'Ranking and deduplicating sources',
    timestamp: Date.now(),
  })

  const tierScores: Record<string, number> = {
    peer_reviewed: 100,
    review: 95,
    conference: 80,
    preprint: 60,
    book: 70,
    dissertation: 50,
    report: 55,
    dataset: 80,
    social_signal: 30,
  }

  const recencyScore = (date: Date | null) => {
    if (!date) return 0
    const ageYears = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365)
    return Math.max(0, 50 - ageYears * 5)
  }

  const scored = sources.map(s => ({
    ...s,
    score: tierScores[s.reliabilityTier] + recencyScore(s.publishedAt),
  }))

  scored.sort((a, b) => b.score - a.score)

  const seen = new Set<string>()
  const deduped = scored.filter(s => {
    const key = s.title.toLowerCase().slice(0, 50)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  emitProgressEvent({
    jobId,
    stage: 'rank_sources',
    status: 'completed',
    message: `Ranked ${deduped.length} unique sources`,
    count: deduped.length,
    timestamp: Date.now(),
  })

  return deduped.slice(0, 50)
}

async function buildRootNode(jobId: string, query: string, sources: any[]) {
  await emitProgressEvent({
    jobId,
    stage: 'build_root',
    status: 'started',
    message: 'Building root knowledge node',
    timestamp: Date.now(),
  })

  const sourceSummaries = sources.slice(0, 20).map(s => ({
    title: s.title,
    snippet: s.snippet?.slice(0, 200),
    tier: s.reliabilityTier,
  }))

  const prompt = `Analyze this research topic: "${query}"

Based on these sources:
${JSON.stringify(sourceSummaries, null, 2)}

You MUST respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "summary": "2-3 sentence overview of the field and current state of research",
  "methods": ["key experimental method 1", "key experimental method 2", "key experimental method 3"],
  "findings": ["major finding 1", "major finding 2", "major finding 3"],
  "disagreements": ["scientific debate 1", "conflicting result 1"],
  "openProblems": ["unsolved challenge 1", "research gap 1", "future direction 1"]
}

Provide at least 3 items for methods, findings, and openProblems. Include disagreements if sources show conflicting views.`

  const seed = newSeed()
  const analysis = await generateWithGroq(prompt, undefined, undefined, seed)

  const node = await prisma.node.create({
    data: {
      jobId,
      parentId: null,
      label: query,
      summary: analysis.summary || `Overview of ${query} research`,
      methodsJson: JSON.stringify(analysis.methods || []),
      findingsJson: JSON.stringify(analysis.findings || []),
      disagreementsJson: JSON.stringify(analysis.disagreements || []),
      openProblemsJson: JSON.stringify(analysis.openProblems || []),
    },
  })

  const rootLog = await logRunStep({ jobId, step: 'build_root_node', prompt, model: GROQ_MODEL, seed, output: analysis })
  await attachRunLog('node', [node.id], rootLog)

  for (const source of sources.slice(0, 15)) {
    await prisma.nodeSource.create({
      data: {
        nodeId: node.id,
        sourceId: source.id,
        role: source.reliabilityTier === 'social_signal' ? 'signal' : 'supporting',
      },
    })
  }

  await prisma.job.update({
    where: { id: jobId },
    data: { rootNodeId: node.id },
  })

  await emitProgressEvent({
    jobId,
    stage: 'build_root',
    status: 'completed',
    message: 'Root node created',
    timestamp: Date.now(),
  })

  return node
}

async function buildChildNodes(jobId: string, query: string, parentId: string, sources: any[]) {
  await emitProgressEvent({
    jobId,
    stage: 'build_children',
    status: 'started',
    message: 'Building child nodes for subtopics',
    timestamp: Date.now(),
  })

  const sourceSummaries = sources.slice(0, 20).map(s => s.title)

  const prompt = `Based on these research papers about "${query}":
${sourceSummaries.join('\n')}

Identify 4-6 distinct subtopics that are directly and closely related to "${query}". Each subtopic should be a well-recognized area within this field — not a generic or loosely connected category. Return as JSON:
{
  "subtopics": [
    {"label": "Subtopic 1", "description": "Brief description of how it relates to ${query}"},
    {"label": "Subtopic 2", "description": "Brief description of how it relates to ${query}"},
    ...
  ]
}`

  const subtopicsSeed = newSeed()
  const result = await generateWithGroq(prompt, undefined, undefined, subtopicsSeed)
  const subtopics = result.subtopics || []
  await logRunStep({ jobId, step: 'identify_subtopics', prompt, model: GROQ_MODEL, seed: subtopicsSeed, output: result })

  for (const subtopic of subtopics.slice(0, 6)) {
    const childPrompt = `Analyze the subtopic "${subtopic.label}" (${subtopic.description}) in the context of "${query}" research.

You MUST respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "summary": "2-3 sentence overview of this specific subtopic",
  "methods": ["specific method 1", "specific method 2", "specific method 3"],
  "findings": ["key finding 1", "key finding 2", "key finding 3"],
  "openProblems": ["challenge 1", "research gap 1", "future direction 1"]
}

Provide at least 3 items for each array.`
    const childSeed = newSeed()
    const childAnalysis = await generateWithGroq(childPrompt, undefined, undefined, childSeed)

    const childNode = await prisma.node.create({
      data: {
        jobId,
        parentId,
        label: subtopic.label,
        summary: childAnalysis.summary || subtopic.description,
        methodsJson: JSON.stringify(childAnalysis.methods || []),
        findingsJson: JSON.stringify(childAnalysis.findings || []),
        disagreementsJson: JSON.stringify([]),
        openProblemsJson: JSON.stringify(childAnalysis.openProblems || []),
      },
    })

    const childLog = await logRunStep({ jobId, step: 'build_child_node', prompt: childPrompt, model: GROQ_MODEL, seed: childSeed, output: childAnalysis })
    await attachRunLog('node', [childNode.id], childLog)

    const relevantSources = sources.slice(0, 10)
    for (const source of relevantSources) {
      await prisma.nodeSource.create({
        data: {
          nodeId: childNode.id,
          sourceId: source.id,
          role: 'supporting',
        },
      })
    }
  }

  await emitProgressEvent({
    jobId,
    stage: 'build_children',
    status: 'completed',
    message: `Created ${subtopics.length} child nodes`,
    count: subtopics.length,
    timestamp: Date.now(),
  })
}

// Export function to build children for any node (for multi-layer trees)
export async function buildChildrenForNode(
  jobId: string,
  parentNodeId: string,
  parentLabel: string,
  depth: number
) {
  try {
    await emitProgressEvent({
      jobId,
      stage: 'build_children',
      status: 'started',
      message: `Building children for ${parentLabel}`,
      timestamp: Date.now(),
    })

    // Get sources associated with the parent node
    const parentNode = await prisma.node.findUnique({
      where: { id: parentNodeId },
      include: {
        nodeSources: {
          include: { source: true },
        },
      },
    })

    if (!parentNode) {
      throw new Error('Parent node not found')
    }

    const sources = parentNode.nodeSources.map((ns: any) => ns.source)
    const sourceTitles = sources.slice(0, 15).map((s: any) => s.title)

    const prompt = `Based on the research topic "${parentLabel}" and these papers:
${sourceTitles.join('\n')}

Identify 3-5 distinct subtopics that are directly and closely related to "${parentLabel}". Each subtopic should be a well-recognized area within this field — not a generic or loosely connected category. Return as JSON:
{
  "subtopics": [
    {"label": "Subtopic 1", "description": "Brief description of how it relates to ${parentLabel}"},
    {"label": "Subtopic 2", "description": "Brief description of how it relates to ${parentLabel}"},
    ...
  ]
}`

    const subtopicsSeed = newSeed()
    const result = await generateWithGroq(prompt, undefined, undefined, subtopicsSeed)
    const subtopics = result.subtopics || []
    await logRunStep({ jobId, step: 'identify_subtopics', prompt, model: GROQ_MODEL, seed: subtopicsSeed, output: result })

    for (const subtopic of subtopics.slice(0, 5)) {
      const childPrompt = `Analyze the subtopic "${subtopic.label}" (${subtopic.description}) in the context of "${parentLabel}".

You MUST respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "summary": "2-3 sentence overview of this specific subtopic",
  "methods": ["specific method 1", "specific method 2"],
  "findings": ["key finding 1", "key finding 2"],
  "openProblems": ["challenge 1", "research gap 1"]
}

Provide at least 2 items for each array.`
      const childSeed = newSeed()
      const childAnalysis = await generateWithGroq(childPrompt, undefined, undefined, childSeed)

      const childNode = await prisma.node.create({
        data: {
          jobId,
          parentId: parentNodeId,
          label: subtopic.label,
          summary: childAnalysis.summary || subtopic.description,
          methodsJson: JSON.stringify(childAnalysis.methods || []),
          findingsJson: JSON.stringify(childAnalysis.findings || []),
          disagreementsJson: JSON.stringify([]),
          openProblemsJson: JSON.stringify(childAnalysis.openProblems || []),
          depth,
        },
      })

      const childLog = await logRunStep({ jobId, step: 'build_child_node', prompt: childPrompt, model: GROQ_MODEL, seed: childSeed, output: childAnalysis })
      await attachRunLog('node', [childNode.id], childLog)
    }

    await emitProgressEvent({
      jobId,
      stage: 'build_children',
      status: 'completed',
      message: `Created ${subtopics.length} child nodes for ${parentLabel}`,
      count: subtopics.length,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('Error building child nodes:', error)
    await emitProgressEvent({
      jobId,
      stage: 'build_children',
      status: 'error',
      message: `Failed to build children: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
    })
  }
}

function mapPubMedType(pubType: string): string {
  const t = pubType?.toLowerCase() || ''
  if (t.includes('review') || t.includes('systematic review') || t.includes('meta-analysis')) return 'review'
  if (t.includes('congress') || t.includes('conference')) return 'conference'
  if (t.includes('preprint')) return 'preprint'
  if (t.includes('book') || t.includes('chapter')) return 'book'
  return 'peer_reviewed'
}

function mapOpenAlexType(type: string): string {
  switch (type?.toLowerCase()) {
    case 'article':
      return 'peer_reviewed'
    case 'review':
      return 'review'
    case 'conference-paper':
    case 'proceedings-article':
      return 'conference'
    case 'preprint':
      return 'preprint'
    case 'book':
    case 'book-chapter':
    case 'edited-book':
    case 'monograph':
      return 'book'
    case 'dissertation':
      return 'dissertation'
    case 'dataset':
      return 'dataset'
    case 'report':
    case 'policy-document':
      return 'report'
    case 'editorial':
    case 'letter':
    case 'paratext':
    case 'other':
      return 'other'
    default:
      return 'peer_reviewed'
  }
}
