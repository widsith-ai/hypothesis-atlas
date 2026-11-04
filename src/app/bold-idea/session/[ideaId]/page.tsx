// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import AssistantChat from "@/components/AssistantChat";
import ChatMarkdown from "@/components/ChatMarkdown";
import type { CandidateVerdict, CriticVerdict, ExperimentDesign, PaperAnalysis, BoldIdeaAgentTrace } from "@/lib/boldIdeaAgents";
import type { Highlight } from "@/lib/boldIdeaKnowledge";
import AccountSlot from "@/components/AccountSlot";

interface BoldIdeaDetail {
  id: string;
  text: string;
  tags: string[];
  trace: BoldIdeaAgentTrace | null;
  experiment: ExperimentDesign | null;
  knowledge: Highlight[];
  canClaim?: boolean;
}

/**
 * Bold Idea's split-screen session view: chat on the left (opens with the
 * multi-agent synthesis — Summary / Gap / What we can still do), and a
 * canvas of collapsible phase sessions on the right:
 *   1. Information Finding — the idea/candidate/paper node tree, same
 *      layout language as KnowledgeTree (src/components/KnowledgeTree.tsx).
 *   2. Experiment — a concrete experiment design for whichever candidate
 *      direction the researcher picks, generated on demand (see
 *      lib/boldIdeaAgents.ts generateExperiment()).
 * Each session can be folded/unfolded independently, and "Move to
 * Experiment" folds Information Finding and reveals Experiment — but
 * neither is ever removed, so the researcher can always go back and forth
 * between phases rather than losing the earlier one.
 *
 * No embedded /job/[id] iframe and no Write Paper tab here — a bold idea is
 * a self-contained exploration, not an on-ramp into the Knowledge Tree
 * pipeline (it just borrows that pipeline's node-tree visual language).
 *
 * POST /api/bold-ideas now runs the whole multi-agent pipeline
 * synchronously, so the trace already exists by the time this page loads —
 * a single fetch on mount, no polling.
 */
const SPLIT_STORAGE_KEY = "bold-idea-split-pct";
const SPLIT_MIN = 24;
const SPLIT_MAX = 65;

export default function BoldIdeaSessionPage({ params }: { params: { ideaId: string } }) {
  const { ideaId } = params;
  const [idea, setIdea] = useState<BoldIdeaDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [leftPct, setLeftPct] = useState(38);

  // Which candidate is selected in the Information Finding tree — lifted up
  // here (rather than kept inside PaperTree) because "Move to Experiment"
  // needs to know which direction to design for.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [experiment, setExperiment] = useState<ExperimentDesign | null>(null);
  const [experimentRequested, setExperimentRequested] = useState(false);
  const [generatingExperiment, setGeneratingExperiment] = useState(false);
  const [knowledge, setKnowledge] = useState<Highlight[]>([]);
  const [collapsed, setCollapsed] = useState({ info: false, experiment: false, knowledge: false });
  const [claiming, setClaiming] = useState(false);

  const [claimError, setClaimError] = useState<string | null>(null);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch(`/api/bold-ideas/${ideaId}/claim`, { method: "POST" });
      if (res.ok) {
        setIdea((prev) => (prev ? { ...prev, canClaim: false } : prev));
      } else {
        const data = await res.json().catch(() => ({}));
        setClaimError(data.error ?? "Could not claim this idea.");
      }
    } catch {
      setClaimError("Could not reach the server.");
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    if (!claimError) return;
    const t = setTimeout(() => setClaimError(null), 5000);
    return () => clearTimeout(t);
  }, [claimError]);

  useEffect(() => {
    fetch(`/api/bold-ideas/${ideaId}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d: BoldIdeaDetail) => {
        setIdea(d);
        if (d.experiment) {
          setExperiment(d.experiment);
          setExperimentRequested(true);
        }
        setKnowledge(d.knowledge ?? []);
      })
      .catch(() => setNotFound(true));
  }, [ideaId]);

  // Restore a previously chosen split so the layout stays how the user left it.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
      if (saved && saved >= SPLIT_MIN && saved <= SPLIT_MAX) setLeftPct(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setLeftPct((pct) => {
        try {
          localStorage.setItem(SPLIT_STORAGE_KEY, String(pct));
        } catch {}
        return pct;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = () => {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const candidates = idea?.trace?.candidates ?? [];
  const selectedCandidate = candidates[selectedIndex];

  const toggleCollapsed = (section: "info" | "experiment" | "knowledge") =>
    setCollapsed((c) => ({ ...c, [section]: !c[section] }));

  const handleGenerateExperiment = async () => {
    if (!selectedCandidate) return;
    setExperimentRequested(true);
    setCollapsed((c) => ({ ...c, info: true, experiment: false }));
    setGeneratingExperiment(true);
    try {
      const res = await fetch(`/api/bold-ideas/${ideaId}/experiment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateTitle: selectedCandidate.title }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.experiment) setExperiment(data.experiment);
    } finally {
      setGeneratingExperiment(false);
    }
  };

  const handleSaveHighlight = async (text: string) => {
    try {
      const res = await fetch(`/api/bold-ideas/${ideaId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.highlights) setKnowledge(data.highlights);
    } catch (err) {
      console.error("Failed to save highlight:", err);
    }
  };

  const handleDeleteHighlight = async (highlightId: string) => {
    const previous = knowledge;
    setKnowledge((k) => k.filter((h) => h.id !== highlightId));
    try {
      const res = await fetch(`/api/bold-ideas/${ideaId}/knowledge/${highlightId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.highlights) {
        setKnowledge(data.highlights);
      } else {
        // Roll back the optimistic removal — the server never actually deleted it.
        setKnowledge(previous);
      }
    } catch (err) {
      console.error("Failed to delete highlight:", err);
      setKnowledge(previous);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="flex-shrink-0 h-14 px-4 sm:px-6 flex items-center justify-between border-b border-gray-200 bg-white relative z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/jobs"
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            ← My Research
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-bold text-gray-900 truncate">
            ✨ {idea?.text ?? "Bold Idea session"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {idea?.canClaim && (
            <div className="relative">
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                title="This idea was created anonymously — claim it to attach it to your account"
              >
                {claiming ? "Claiming…" : "Claim this idea"}
              </button>
              {claimError && (
                <div className="absolute top-full right-0 mt-1.5 w-56 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 shadow-md z-20">
                  {claimError}
                </div>
              )}
            </div>
          )}
          <Link
            href="/bold-idea"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
            style={{ background: "linear-gradient(135deg, #a87732, #9c3a26)" }}
          >
            + New Bold Idea
          </Link>
          <AccountSlot />
        </div>
      </header>

      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* Left: chat, opens with the multi-agent synthesis */}
        <div
          className="w-full lg:w-[var(--left-width)] min-w-0 bg-white flex flex-col"
          style={{ "--left-width": `${leftPct}%` } as CSSProperties}
        >
          {notFound ? (
            <div className="flex-1 flex items-center justify-center text-center px-8">
              <p className="text-sm text-gray-500">This bold idea could not be found.</p>
            </div>
          ) : idea === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" />
              </div>
              <p className="text-sm text-gray-500">Loading this exploration…</p>
            </div>
          ) : (
            <AssistantChat
              jobId={ideaId}
              endpoint={`/api/bold-ideas/${ideaId}/chat`}
              enableNotes={false}
              onHighlight={handleSaveHighlight}
              storageKey={`bold-idea-chat:${ideaId}`}
              welcome={{
                role: "assistant",
                content: idea.trace?.chatSummary ?? "No synthesis available for this idea.",
              }}
            />
          )}
        </div>

        {/* Drag to resize the split — desktop only, the right panel is hidden below lg anyway */}
        <div
          onMouseDown={startDrag}
          className="hidden lg:flex relative flex-shrink-0 w-2.5 cursor-col-resize items-center justify-center group"
        >
          <div className="w-px h-full bg-gray-200 group-hover:bg-purple-300 transition-colors" />
          <div className="absolute w-1 h-10 rounded-full bg-gray-300 group-hover:bg-purple-400 transition-colors" />
        </div>

        {/* Right: a canvas of foldable phase sessions — Information Finding, then Experiment once requested */}
        <div className="hidden lg:flex lg:flex-col flex-1 min-w-0 overflow-y-auto bg-gray-50 border-l border-gray-200">
          <SessionSection
            icon="🔎"
            title="Information Finding"
            subtitle={candidates.length > 0 ? `${candidates.length} directions` : undefined}
            collapsed={collapsed.info}
            onToggle={() => toggleCollapsed("info")}
          >
            <PaperTree
              ideaText={idea?.text ?? ""}
              candidates={candidates}
              loading={idea === null && !notFound}
              selected={selectedIndex}
              onSelect={setSelectedIndex}
            />
            {candidates.length > 0 && (
              <div className="max-w-4xl mx-auto px-8 pb-8 flex justify-end">
                <button
                  onClick={handleGenerateExperiment}
                  disabled={generatingExperiment}
                  className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg text-white bg-gray-900 hover:bg-gray-800 shadow-sm transition-colors disabled:opacity-50"
                >
                  🧪 Move to Experiment →
                </button>
              </div>
            )}
          </SessionSection>

          {experimentRequested && (
            <SessionSection
              icon="🧪"
              title="Experiment"
              subtitle={experiment ? `for ${experiment.candidateTitle}` : undefined}
              collapsed={collapsed.experiment}
              onToggle={() => toggleCollapsed("experiment")}
            >
              <div className="max-w-4xl mx-auto px-8 pb-8">
                {generatingExperiment ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-purple-500" />
                    <p className="text-xs text-gray-400">Designing an experiment for "{selectedCandidate?.title}"…</p>
                  </div>
                ) : experiment ? (
                  <>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <p className="text-xs text-gray-500">
                        Designed for: <span className="font-semibold text-gray-700">{experiment.candidateTitle}</span>
                      </p>
                      <button
                        onClick={handleGenerateExperiment}
                        disabled={!selectedCandidate}
                        className="flex-shrink-0 text-xs font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-40 transition-colors"
                      >
                        ↻ Regenerate for selected direction
                      </button>
                    </div>
                    {selectedCandidate && experiment.candidateTitle !== selectedCandidate.title && (
                      <div className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 mb-4">
                        This was designed for a different direction than the one currently selected in Information
                        Finding ("{selectedCandidate.title}"). Click regenerate to redesign for it.
                      </div>
                    )}
                    <div className="bg-white border border-gray-200 rounded-xl p-5">
                      <ChatMarkdown text={experiment.markdown} className="text-xs text-gray-800 leading-relaxed" />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-rose-500">Something went wrong generating this experiment. Try again.</p>
                )}
              </div>
            </SessionSection>
          )}

          <SessionSection
            icon="📌"
            title="Knowledge"
            subtitle={knowledge.length > 0 ? `${knowledge.length} saved` : undefined}
            collapsed={collapsed.knowledge}
            onToggle={() => toggleCollapsed("knowledge")}
          >
            <div className="max-w-4xl mx-auto px-8 pb-8">
              {knowledge.length === 0 ? (
                <p className="text-xs text-gray-400">
                  Nothing saved yet — highlight any text in the chat on the left and click "Save to Knowledge" to
                  keep it here.
                </p>
              ) : (
                <div className="space-y-3">
                  {knowledge.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                    >
                      <span className="text-gray-300 text-lg leading-none flex-shrink-0">"</span>
                      <p className="flex-1 text-xs text-gray-700 leading-relaxed">{h.text}</p>
                      <button
                        onClick={() => handleDeleteHighlight(h.id)}
                        className="flex-shrink-0 text-gray-300 hover:text-rose-500 transition-colors"
                        title="Remove"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SessionSection>
        </div>
      </div>
    </div>
  );
}

function SessionSection({
  icon,
  title,
  subtitle,
  collapsed,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-8 py-4 text-left hover:bg-gray-100/60 transition-colors sticky top-0 bg-gray-50 z-[1]"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">{icon}</span>
          <span className="text-sm font-bold text-gray-900 truncate">{title}</span>
          {subtitle && <span className="text-xs text-gray-400 flex-shrink-0">· {subtitle}</span>}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && children}
    </div>
  );
}

const VERDICT_MARK: Record<CriticVerdict, string> = {
  "well-supported": "✅",
  speculative: "🤔",
  contradicted: "❌",
};

const VERDICT_LABEL: Record<CriticVerdict, string> = {
  "well-supported": "Well-supported",
  speculative: "Speculative",
  contradicted: "Contradicted",
};

const VERDICT_STYLE: Record<CriticVerdict, { idle: string; idleBadge: string; selected: string; selectedBadge: string }> = {
  "well-supported": {
    idle: "bg-white border-gray-200 hover:border-emerald-300",
    idleBadge: "bg-emerald-50 text-emerald-700",
    selected: "bg-emerald-600 border-emerald-600 shadow-md",
    selectedBadge: "bg-emerald-700/40 text-white",
  },
  speculative: {
    idle: "bg-white border-gray-200 hover:border-amber-300",
    idleBadge: "bg-amber-50 text-amber-700",
    selected: "bg-amber-500 border-amber-500 shadow-md",
    selectedBadge: "bg-amber-600/40 text-white",
  },
  contradicted: {
    idle: "bg-white border-gray-200 hover:border-rose-300",
    idleBadge: "bg-rose-50 text-rose-700",
    selected: "bg-rose-600 border-rose-600 shadow-md",
    selectedBadge: "bg-rose-700/40 text-white",
  },
};

/** The selected candidate's session card — outer card tint and the inner critique/empty-state callout box, both color-matched to the candidate's verdict instead of unstyled floating text. */
const SESSION_CARD_STYLE: Record<CriticVerdict, string> = {
  "well-supported": "border-emerald-200 bg-emerald-50/40",
  speculative: "border-amber-200 bg-amber-50/40",
  contradicted: "border-rose-200 bg-rose-50/40",
};

const CALLOUT_STYLE: Record<CriticVerdict, string> = {
  "well-supported": "bg-emerald-100 border-emerald-200 text-emerald-800",
  speculative: "bg-amber-100 border-amber-200 text-amber-800",
  contradicted: "bg-rose-100 border-rose-200 text-rose-800",
};

/** Idea (root) -> candidate directions (children) -> each candidate's papers (grandchildren) — mirrors KnowledgeTree's parent/child pill-and-connector layout instead of a flat card grid. Selection is owned by the parent page (not local state) because "Move to Experiment" needs to know which candidate is picked. */
function PaperTree({
  ideaText,
  candidates,
  loading,
  selected,
  onSelect,
}: {
  ideaText: string;
  candidates: CandidateVerdict[];
  loading: boolean;
  selected: number;
  onSelect: (index: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-purple-500" />
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="flex items-center justify-center h-full px-8 text-center">
        <p className="text-sm text-gray-400">No candidate directions were found for this idea.</p>
      </div>
    );
  }

  // Older ideas were created before CandidateVerdict carried a `papers` field
  // (their agentTraceJson was serialized under the old shape) — default to
  // an empty list rather than let `active.papers` be undefined.
  const active = { ...candidates[selected], papers: candidates[selected]?.papers ?? [] };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Root node: the idea itself */}
      <div className="flex flex-col items-center">
        <div className="px-6 py-3 rounded-lg bg-gray-900 text-white text-sm font-semibold shadow-md text-center max-w-2xl leading-snug">
          {ideaText}
        </div>
        <div className="w-0.5 h-8 bg-gray-300 my-3" />

        {/* Child nodes: candidate directions — an even grid so different-length titles still line up, instead of flex-wrap's mismatched pill widths */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {candidates.map((c, i) => {
            const style = VERDICT_STYLE[c.verdict];
            const isSelected = i === selected;
            return (
              <button
                key={c.title}
                onClick={() => onSelect(i)}
                aria-pressed={isSelected}
                className={`flex flex-col items-start gap-1.5 w-full h-full px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  isSelected ? style.selected : style.idle
                }`}
              >
                <span
                  className={`text-sm font-semibold leading-snug ${isSelected ? "text-white" : "text-gray-900"}`}
                >
                  {c.title}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                    isSelected ? style.selectedBadge : style.idleBadge
                  }`}
                >
                  {VERDICT_MARK[c.verdict]} {VERDICT_LABEL[c.verdict]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected candidate's session: a large, color-matched card holding its critique and its own papers (grandchild nodes) — not floating unstyled text below the tree */}
      <div className="mt-6 flex flex-col items-center">
        <div className="w-0.5 h-8 bg-gray-300" />
        <div className={`w-full rounded-2xl border-2 p-6 ${SESSION_CARD_STYLE[active.verdict]}`}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="text-sm font-bold text-gray-900 leading-snug">{active.title}</h3>
            <span
              className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${CALLOUT_STYLE[active.verdict]}`}
            >
              {VERDICT_MARK[active.verdict]} {VERDICT_LABEL[active.verdict]}
            </span>
          </div>

          <div className={`text-xs rounded-lg border px-4 py-3 mb-5 leading-relaxed ${CALLOUT_STYLE[active.verdict]}`}>
            {active.critique}
          </div>

          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2.5">
            {active.papers.length === 0
              ? "Papers"
              : `${active.papers.length} paper${active.papers.length === 1 ? "" : "s"} found`}
          </p>

          {active.papers.length === 0 ? (
            <div className={`text-xs rounded-lg border px-4 py-3 leading-relaxed ${CALLOUT_STYLE[active.verdict]}`}>
              No papers found for this direction.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {active.papers.map((paper) => (
                <PaperNode key={paper.url || paper.title} paper={paper} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaperNode({ paper }: { paper: PaperAnalysis }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-purple-300 transition-all cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
    >
      <a
        href={paper.url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-semibold text-gray-900 hover:text-purple-700 hover:underline line-clamp-2"
      >
        {paper.title}
      </a>
      <p className="text-[11px] text-gray-400 mt-1">{paper.year}</p>

      {!hovered ? (
        <p className="text-[11px] text-gray-500 mt-2 line-clamp-2">{paper.summary}</p>
      ) : (
        <div className="mt-2 space-y-1.5 text-[11px]">
          <div>
            <span className="font-semibold text-purple-700">Method: </span>
            <span className="text-gray-700">{paper.method}</span>
          </div>
          <div>
            <span className="font-semibold text-pink-700">Summary: </span>
            <span className="text-gray-700">{paper.summary}</span>
          </div>
          <div>
            <span className="font-semibold text-orange-700">Gap: </span>
            <span className="text-gray-700">{paper.gap}</span>
          </div>
        </div>
      )}
    </div>
  );
}
