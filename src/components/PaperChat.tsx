// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useCallback, useEffect, useState } from "react";
import AssistantChat from "@/components/AssistantChat";
import { readSavedPlanMarkdown } from "@/components/AtlasPlan";
import { DEFAULT_PAPER_SKILL_ID, PAPER_SKILLS, getPaperSkill, type PaperChatContext } from "@/lib/paperSkills";

interface ResearchIdea {
  title: string;
  problem_to_solve: string;
  proposed_method: string[];
  next_3_steps: string[];
  field_context: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  skill?: string;
}

/**
 * #99: the Write Paper session's chat — one conversation for the whole paper,
 * on the left of the page, with paper skills (src/lib/paperSkills.ts) as
 * chips above the input. Each request carries the current Atlas Plan and the
 * papers collected on Setup, so every skill works from the researcher's own
 * material. The chosen skill is remembered per paper.
 */
export default function PaperChat({
  jobId,
  topicQuery,
  selectedIdea,
  collectedPapers,
  skill: controlledSkill,
  onSkillChange,
  onMessagesChange,
}: {
  jobId: string;
  topicQuery: string;
  selectedIdea?: ResearchIdea;
  collectedPapers: { title: string; venue?: string | null; year?: number | null }[];
  /** When set, the page drives the skill (e.g. Experiments → Experiment designer). */
  skill?: string;
  onSkillChange?: (skillId: string) => void;
  onMessagesChange?: (messages: Message[]) => void;
}) {
  const storageKey = `paper-skill:${jobId}`;
  const [localSkill, setLocalSkill] = useState<string>(DEFAULT_PAPER_SKILL_ID);
  const skillId = controlledSkill ?? localSkill;
  const skill = getPaperSkill(skillId);

  useEffect(() => {
    if (controlledSkill) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setLocalSkill(getPaperSkill(saved).id);
    } catch {
      /* storage blocked: start on the default skill */
    }
  }, [storageKey, controlledSkill]);

  const pick = (id: string) => {
    setLocalSkill(id);
    onSkillChange?.(id);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      /* storage blocked: the choice lasts for this page view */
    }
  };

  const getPaperContext = useCallback(
    (): PaperChatContext => ({
      planMarkdown: readSavedPlanMarkdown(jobId, selectedIdea?.title, topicQuery),
      collectedPapers,
    }),
    [jobId, selectedIdea?.title, topicQuery, collectedPapers],
  );

  const toolbar = (
    <div className="px-4 pt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">Paper skills</span>
      </div>
      <div role="radiogroup" aria-label="Paper skill" className="flex flex-wrap gap-1.5">
        {PAPER_SKILLS.map((s) => {
          const active = s.id === skill.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(s.id)}
              title={s.description}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span aria-hidden>{s.icon}</span>
              {s.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{skill.description}</p>
    </div>
  );

  return (
    <AssistantChat
      jobId={jobId}
      selectedIdea={selectedIdea}
      storageKey={`paper-chat:${jobId}`}
      skill={skill.id}
      getPaperContext={getPaperContext}
      toolbar={toolbar}
      starters={skill.starters}
      subtitle="Paper session · pick a skill below"
      welcome={{
        role: "assistant",
        content:
          "Hi! I'm Atlas, your paper-writing partner. I can see this session's evidence, your converged ideas, the papers you collect on **Setup** and your **Atlas Plan**.\n\nPick a **paper skill** below — literature review, critical reviewer, abstract & title, section drafting (Markdown or LaTeX), experiment design, or general writing help — then ask away, or tap a suggestion.",
      }}
      onMessagesChange={onMessagesChange}
    />
  );
}
