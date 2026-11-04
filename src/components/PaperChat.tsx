// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * #105: shown as a ChatGPT-style chat (AssistantChat's "chatgpt" variant)
 * filling the left pane of the session; the skill picker lives inside the
 * composer, so switching skills never moves the conversation.
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

  const composerAccessory = <SkillMenu skillId={skill.id} onPick={pick} />;

  return (
    <AssistantChat
      jobId={jobId}
      selectedIdea={selectedIdea}
      storageKey={`paper-chat:${jobId}`}
      skill={skill.id}
      getPaperContext={getPaperContext}
      variant="chatgpt"
      title="Paper chat"
      composerAccessory={composerAccessory}
      starters={skill.starters}
      subtitle="One conversation for Setup, Plan and Experiments"
      welcome={{
        role: "assistant",
        content:
          "Hi! I'm Atlas, your paper-writing partner. I can see this session's evidence, your converged ideas, the papers you collect on **Setup** and your **Atlas Plan**.\n\nChoose a **skill** from the menu in the message box — literature review, critical reviewer, abstract & title, section drafting (Markdown or LaTeX), experiment design, or general writing help — then ask away, or start from a suggestion.",
      }}
      onMessagesChange={onMessagesChange}
    />
  );
}

/** #105: the paper-skill picker inside the composer — a compact button that opens a menu. */
function SkillMenu({ skillId, onPick }: { skillId: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const skill = getPaperSkill(skillId);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Menu pattern: focus moves into the menu, onto the selected skill.
    const active = PAPER_SKILLS.findIndex((s) => s.id === skillId);
    itemRefs.current[Math.max(active, 0)]?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, skillId]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") { e.preventDefault(); go(at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(at - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={skill.description}
        className="flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <span aria-hidden>{skill.icon}</span>
        <span className="truncate">{skill.label}</span>
        <svg className={`h-3 w-3 flex-none text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 15 6-6 6 6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Paper skills"
          onKeyDown={onMenuKeyDown}
          // Solid on purpose: a menu over the conversation must not inherit the Monet glass.
          style={{ backgroundColor: "rgb(251 251 248)", backdropFilter: "none", WebkitBackdropFilter: "none" }}
          className="absolute bottom-full left-0 z-30 mb-2 w-72 max-w-[calc(100vw-3rem)] rounded-2xl border border-gray-200 p-1.5 shadow-xl"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">Paper skills</p>
          {PAPER_SKILLS.map((s, idx) => {
            const active = s.id === skill.id;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                tabIndex={-1}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onPick(s.id);
                  close(true);
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${active ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                <span className="mt-0.5 text-base leading-none" aria-hidden>
                  {s.icon}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                    {s.label}
                    {active && <span className="text-[10px] font-medium text-emerald-700">· selected</span>}
                  </span>
                  <span className="block text-[11px] leading-snug text-gray-500">{s.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
