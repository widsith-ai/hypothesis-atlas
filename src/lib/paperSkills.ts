// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Paper skills (#99): the modes the Write Paper chat can work in.
 *
 * A skill is a plug-in for the chat: it changes what the assistant does,
 * not what it knows. Every skill gets the same session context — topic,
 * converged ideas, the run's peer-reviewed sources and, when the page sends
 * them, the current Atlas Plan and the papers collected on Setup (see
 * buildPaperContext / app/api/jobs/[id]/assistant-chat). The skill adds its
 * own role and rules on top.
 *
 * To add a skill, add one entry to PAPER_SKILLS. Nothing else needs to change:
 * the chat shows it as a chip, the API picks up its instructions, and the
 * registry tests check its shape. Instructions are original to Atlas.
 *
 * Shared by server (prompt) and client (chips, starters), so it holds no
 * secrets and imports nothing server-only.
 */

export interface PaperSkill {
  /** Stable id, sent to the API and stored with each reply. Kebab-case. */
  id: string;
  /** Chip label. */
  label: string;
  /** One emoji, shown on the chip and on replies. */
  icon: string;
  /** One line: what the skill does. Shown under the chips. */
  description: string;
  /** The skill's role and rules, appended to the session context in the system prompt. */
  instructions: string;
  /** Two or three one-click prompts shown when the skill is selected. */
  starters: string[];
}

export const PAPER_SKILLS: readonly PaperSkill[] = [
  {
    id: "writing",
    label: "Writing assistant",
    icon: "✍️",
    description: "Clarifies concepts, structures arguments and suggests phrasing, grounded in your evidence.",
    instructions:
      "You are the writing assistant working alongside the Atlas Plan tool. Help the researcher finish their paper: clarify concepts, suggest phrasings, structure arguments, explain methods from the literature, and challenge weak reasoning. Ground your help in the session context — cite specific papers or findings by name. Be concise and practical.",
    starters: [
      "Help me sharpen the main argument of this paper.",
      "Explain the key method from the papers in plain terms.",
      "What is the weakest step in my reasoning so far?",
    ],
  },
  {
    id: "literature-review",
    label: "Literature review",
    icon: "📚",
    description: "Synthesizes a related-work section from this run's papers, citing each one.",
    instructions: `You are the literature-review writer for this paper. Synthesize the related work from the session's sources (and any papers collected on Setup) into prose a reader can follow.

Rules:
1. **Organise by theme, not by paper.** Group the work into 2–4 themes (approaches, findings, or open debates) and give each a short heading.
2. **Cite only papers in the session context**, by title (and venue/year when given), e.g. "(*Title*, Venue 2024)". Never invent a paper, author, year or result. If the context is too thin for a theme, say so and name what to search for.
3. **Compare, don't list.** For each theme say what the papers agree on, where they disagree, and what they leave open.
4. **End with the gap**: a short paragraph that names what this research adds, tied to the converged ideas or the plan's contribution when present.
5. Keep it to roughly 300–600 words unless asked for more.`,
    starters: [
      "Draft the related-work section from this run's papers.",
      "Group the papers into themes and show how they disagree.",
      "Which gap in the literature does my idea fill?",
    ],
  },
  {
    id: "critical-reviewer",
    label: "Critical reviewer",
    icon: "🧐",
    description: "Plays a tough pre-submission reviewer: weak claims, missing baselines, overreach — with fixes.",
    instructions: `You are a rigorous, fair peer reviewer reading this work before submission. Your job is to find what a real reviewer would reject it for, while there is still time to fix it.

Review against the session context, and especially the Atlas Plan's claims and evidence when present. Structure every review as:
1. **Summary** — one or two sentences on what the paper claims.
2. **Major concerns** — numbered. For each: the claim or section, why it is weak (unsupported, contradicted by a cited paper, overreaching, missing a baseline or ablation, unclear method, threat to validity), and a **concrete fix**.
3. **Minor issues** — wording, clarity, presentation.
4. **Questions for the authors** — what you would ask in a review.
5. **Verdict** — accept / minor revision / major revision / reject, with one line of justification.

Be specific: quote or name the claim you are criticising, and cite session papers by title when they contradict or support it. Do not invent evidence. If the plan is missing, review whatever the researcher pastes or describes, and say what you could not check.`,
    starters: [
      "Review my plan as a tough reviewer would.",
      "Which of my claims are the least supported?",
      "What baselines or ablations would a reviewer ask for?",
    ],
  },
  {
    id: "abstract-title",
    label: "Abstract & title",
    icon: "🏷️",
    description: "Drafts and tightens the abstract, title options and keywords from your plan and evidence.",
    instructions: `You write and tighten the paper's front matter: abstract, title and keywords.

- **Abstract**: 150–250 words, one paragraph, in this order: context and problem → gap → what this work does (method) → key result or expected result → why it matters. Use only results the session context supports; label expected or planned results as such ("we expect…", "we propose…"). Never invent numbers.
- **Title**: offer 3–5 options in different styles (descriptive, result-first, question, "X for Y"), each under ~15 words, and say which you recommend and why.
- **Keywords**: 4–6, ordered from most to least specific.

When the researcher pastes a draft, edit it rather than rewriting from scratch, and show what you changed in one short list.`,
    starters: [
      "Draft an abstract and five title options from my plan.",
      "Tighten this abstract to under 200 words: ",
      "Suggest keywords for this paper.",
    ],
  },
  {
    id: "section-drafting",
    label: "LaTeX & section drafting",
    icon: "📝",
    description: "Turns outline points into full section prose — Introduction, Method, Results — in Markdown or LaTeX.",
    instructions: `You draft full sections of the paper from the plan's outline and the session evidence.

- Ask which section to draft if it is not clear; otherwise draft the one requested (Introduction, Related Work, Method, Experiments, Results, Discussion, Conclusion).
- Follow the plan's outline and contribution when present. Write academic prose: clear topic sentences, one idea per paragraph, transitions between them.
- Cite session papers by title where a claim needs support. Mark anything that needs a citation you do not have as **[citation needed]**, and anything that needs a result not yet obtained as **[result TBD]**. Never invent results, numbers or references.
- **Format**: Markdown by default. When the researcher asks for LaTeX, return a single fenced \`latex\` block using \\section{}, \\subsection{}, \\cite{key} with a suggested key per paper (e.g. \\cite{smith2024}), equation environments for math, and no preamble unless asked.
- After the draft, list in one or two lines what the researcher still needs to supply.`,
    starters: [
      "Draft the Introduction from my outline.",
      "Write the Method section in LaTeX.",
      "Turn my outline into a full Discussion section.",
    ],
  },
  {
    id: "experiment",
    label: "Experiment designer",
    icon: "🧪",
    description: "Turns an idea into a runnable experiment with checkable numbers — feeds Verify plan.",
    instructions: `You are the experiment designer for this research session. Help the researcher turn their selected idea into a concrete, runnable experiment plan. Ground every suggestion in the session context — cite specific papers, datasets, and methods discovered above by name.

Structure your plans around:
1. **Hypothesis** — the precise falsifiable claim being tested.
2. **Variables** — independent, dependent, and controlled, with concrete values.
3. **Method** — datasets/benchmarks from the session evidence and the exact procedure.
4. **Baselines** — comparison methods from the mapped literature, with the numbers they report.
5. **Metrics** — what you measure and the math behind each metric (write the equations in LaTeX: $...$ inline or $$...$$ display).
6. **Expected results** — concrete quantitative predictions. ALWAYS state the key expected results as plain arithmetic expressions that can be checked (e.g. "expected accuracy gain: 0.843 - 0.812 = 0.031"), and include the equations in LaTeX form as well. When you give an expected value, write the expression that produces it so the verification step can evaluate it.

Be concrete and quantitative. Prefer real numbers (from the papers above, or clearly-labeled assumptions) over vague claims.`,
    starters: [
      "Design an experiment to test my selected idea.",
      "Which baselines and metrics should I use?",
      "Give me expected results I can verify.",
    ],
  },
];

export const DEFAULT_PAPER_SKILL_ID = "writing";

/** The skill with this id, or the default skill for an unknown/missing id. */
export function getPaperSkill(id: string | null | undefined): PaperSkill {
  return PAPER_SKILLS.find((s) => s.id === id) ?? PAPER_SKILLS.find((s) => s.id === DEFAULT_PAPER_SKILL_ID)!;
}

/**
 * Which skill answers a request. Older callers send only `persona`
 * ("writing" / "experiment"); the Write Paper chat sends `skill`. The
 * question-bot persona ("ask") is not a paper skill — it returns null and the
 * route keeps its own instructions.
 */
export function skillForRequest(persona: unknown, skill: unknown): PaperSkill | null {
  if (persona === "ask") return null;
  if (typeof skill === "string" && skill) return getPaperSkill(skill);
  return getPaperSkill(persona === "experiment" ? "experiment" : DEFAULT_PAPER_SKILL_ID);
}

/** Context the Write Paper page sends with each chat request (all optional, length-capped by the server). */
export interface PaperChatContext {
  /** The current Atlas Plan as Markdown (buildPlanExportMarkdown). */
  planMarkdown?: string;
  /** Papers collected on the Setup step. */
  collectedPapers?: { title: string; venue?: string | null; year?: number | null }[];
}

export const MAX_PLAN_CHARS = 8000;
export const MAX_COLLECTED_PAPERS = 15;

/**
 * Formats the page-supplied context for the system prompt. Untrusted input:
 * everything is coerced to strings and capped, so a huge or malformed body
 * can't blow up the prompt.
 */
export function buildPaperContext(raw: unknown): string {
  const ctx = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const parts: string[] = [];

  const papers = Array.isArray(ctx.collectedPapers) ? ctx.collectedPapers.slice(0, MAX_COLLECTED_PAPERS) : [];
  const paperLines = papers
    .map((p) => {
      const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim().slice(0, 300) : "";
      if (!title) return null;
      const venue = typeof o.venue === "string" && o.venue.trim() ? o.venue.trim().slice(0, 120) : null;
      const year = typeof o.year === "number" && Number.isFinite(o.year) ? Math.round(o.year) : null;
      const meta = [venue, year].filter(Boolean).join(" ");
      return `• ${title}${meta ? ` (${meta})` : ""}`;
    })
    .filter((l): l is string => Boolean(l));
  if (paperLines.length) parts.push(`**Papers the researcher collected on Setup:**\n${paperLines.join("\n")}`);

  const plan = typeof ctx.planMarkdown === "string" ? ctx.planMarkdown.trim() : "";
  if (plan) {
    const capped = plan.length > MAX_PLAN_CHARS ? `${plan.slice(0, MAX_PLAN_CHARS)}\n…(plan truncated)` : plan;
    parts.push(`**Current Atlas Plan (the researcher's working plan — treat as their draft, not as verified fact):**\n${capped}`);
  }

  return parts.join("\n\n");
}
