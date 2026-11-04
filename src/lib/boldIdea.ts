// SPDX-License-Identifier: AGPL-3.0-only

import { getLLM } from './llm'

/**
 * "Try Something Bold" — tags unconstrained free-text research ideas with
 * 2-5 subject labels, which may span multiple domains (unlike the word
 * cloud's single fixed domain per word). This is the only step left here:
 * the idea no longer feeds an evidence-mapping Job (there used to be a
 * refineQuery() step producing a topicQuery for that), since Bold Idea's
 * own multi-agent pipeline (see lib/boldIdeaAgents.ts) is now the whole
 * result, not an on-ramp into a separate pipeline.
 */

const FALLBACK_TAG = 'General'

/**
 * Tags the idea with 2-5 subject labels, which may span multiple domains —
 * this is what makes a cross-disciplinary idea ("a new drug for Type 2
 * Diabetes" -> Pharmacology + Endocrinology + Drug Discovery) show up as
 * more than one tag, unlike the word cloud's single fixed domain per word.
 */
export async function tagSubjects(text: string): Promise<string[]> {
  const llm = getLLM()
  if (!llm) return [FALLBACK_TAG]
  try {
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      temperature: 0.2,
      // gpt-oss-120b is a reasoning model — its "reasoning" tokens are drawn
      // from the same max_tokens budget as the final "content", before it.
      // A tight budget (tried 60 first) sometimes left content truncated
      // mid-phrase because reasoning ate most of it. 300 leaves headroom.
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'Classify the research idea below into 2-5 short subject tags (e.g. "Pharmacology", ' +
            '"Endocrinology", "Drug Discovery", "Materials Science"). The idea may span multiple ' +
            'fields — list every field it genuinely touches, not just one. Respond with ONLY JSON: ' +
            '{"tags":["...", "..."]}.',
        },
        { role: 'user', content: text },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return [FALLBACK_TAG]
    const parsed = JSON.parse(match[0]) as { tags?: unknown }
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim()).filter(Boolean) : []
    return tags.length > 0 ? tags.slice(0, 5) : [FALLBACK_TAG]
  } catch {
    return [FALLBACK_TAG]
  }
}
