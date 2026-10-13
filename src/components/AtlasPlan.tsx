"use client";

import { useEffect, useState } from "react";
import {
  buildPlanExportMarkdown,
  type AtlasPlan as AtlasPlanResult,
  type GroundedPlanClaim,
  type PlanMode,
} from "@/lib/atlasPlanExport";

interface ResearchIdea {
  title: string;
  problem_to_solve: string;
  proposed_method: string[];
  next_3_steps: string[];
  field_context: string[];
}

interface ReferenceDoc {
  name: string;
  content: string;
}

export interface PlanSource {
  title: string;
  snippet: string | null;
}

interface AtlasPlanProps {
  jobId: string;
  topicQuery: string;
  selectedIdea?: ResearchIdea;
  referenceDoc?: ReferenceDoc;
  /** #64: papers the researcher collected on the Setup step, planned and grounded alongside the job's own sources. */
  extraSources?: PlanSource[];
}

interface CachedPlan {
  mode: PlanMode;
  plan: AtlasPlanResult;
  savedAt: number;
}

/** A claim while it's being edited, tagged with which original claim (if any) it came from — see startEditing/finishEditing. */
type DraftClaim = GroundedPlanClaim & { _origIndex?: number };
type DraftPlan = Omit<AtlasPlanResult, "claims"> & { claims: DraftClaim[] };

/** #63 (V3.0.0.1): the Atlas-native replacement for ARSPlanChat.tsx. A results view, not a chat — Atlas Plan drafts directly from the hypothesis and its sources rather than interrogating the researcher turn by turn. #64 (V3.0.0.2): every section is editable, and each claim shows the passages it was checked against. */
function makeCacheKey(jobId: string, ideaTitle?: string): string {
  const slug = (ideaTitle ?? "default").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return `atlas-plan:${jobId}:${slug}`;
}

function loadCached(key: string): CachedPlan | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CachedPlan) : null;
  } catch {
    return null;
  }
}

const BADGE_STYLE: Record<GroundedPlanClaim["grounding"]["status"], string> = {
  grounded: "bg-green-50 text-green-700 border-green-200",
  unsupported: "bg-amber-50 text-amber-700 border-amber-200",
  contradicted: "bg-red-50 text-red-700 border-red-200",
  unavailable: "bg-gray-50 text-gray-500 border-gray-200",
};
const EDITED_BADGE_STYLE = "bg-sky-50 text-sky-700 border-sky-200";

const METHOD_LABEL: Record<GroundedPlanClaim["grounding"]["method"], string> = {
  overlap: "text overlap",
  nli: "NLI model",
  llm_judge: "LLM judge",
  unavailable: "no checker available",
};

const FIELD_CLASS =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-gray-900 mb-2">{children}</h3>;
}

/** A list of short strings, editable as one input per line. */
function EditableList({
  items,
  editing,
  ordered,
  onChange,
  addLabel,
}: {
  items: string[];
  editing: boolean;
  ordered?: boolean;
  onChange: (items: string[]) => void;
  addLabel: string;
}) {
  if (!editing) {
    const ListTag = ordered ? "ol" : "ul";
    return (
      <ListTag className={`${ordered ? "list-decimal" : "list-disc"} ml-5 text-sm text-gray-800 space-y-0.5`}>
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ListTag>
    );
  }
  return (
    <div className="space-y-1.5">
      {items.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{ordered ? `${i + 1}.` : "•"}</span>
          <input
            value={t}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className={FIELD_CLASS}
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-xs text-gray-400 hover:text-red-600 flex-shrink-0"
            aria-label="Remove"
          >
            Remove
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ""])} className="text-xs font-semibold text-indigo-700 hover:underline ml-6">
        + {addLabel}
      </button>
    </div>
  );
}

export default function AtlasPlan({ jobId, topicQuery, selectedIdea, referenceDoc, extraSources = [] }: AtlasPlanProps) {
  const cacheKey = makeCacheKey(jobId, selectedIdea?.title);

  const [mode, setMode] = useState<PlanMode>("plan");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedPlan | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftPlan | null>(null);
  const [openEvidence, setOpenEvidence] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setResult(loadCached(cacheKey));
    setEditing(false);
    setDraft(null);
  }, [cacheKey]);

  const save = (plan: AtlasPlanResult, planMode: PlanMode) => {
    const cached: CachedPlan = { mode: planMode, plan, savedAt: Date.now() };
    setResult(cached);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cached));
    } catch {}
  };

  const generate = async (requestedMode: PlanMode) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: requestedMode, selectedIdea, instruction: instruction.trim() || undefined, referenceDoc, extraSources }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not generate a plan.");
        return;
      }
      if (!data.plan.available) {
        setError("Planning assistant unavailable — GROQ_API_KEY is not configured.");
        return;
      }
      save(data.plan, requestedMode);
    } catch {
      setError("Could not reach the planning assistant. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    if (!result) return;
    const cloned = structuredClone(result.plan);
    // Tag each claim with its origin index before anything is edited, so finishEditing can
    // tell "this is claim #2, maybe retyped" from "this is a new claim that happens to read
    // the same as claim #2" — structuredClone breaks object identity, and matching by text
    // alone would hand a new/changed claim someone else's stale grounding on a collision.
    cloned.claims = cloned.claims.map((c, i) => ({ ...c, _origIndex: i }));
    setDraft(cloned);
    setOpenEvidence(null);
    setEditing(true);
  };

  const finishEditing = () => {
    if (!result || !draft) return;
    const before = result.plan.claims;
    const claims = draft.claims
      .filter((c) => c.text.trim())
      .map((c) => {
        const { _origIndex, ...rest } = c as DraftClaim;
        const original = typeof _origIndex === "number" ? before[_origIndex] : undefined;
        // A claim whose text changed no longer matches the passages it was checked against.
        return original && original.text === rest.text.trim() ? original : { ...rest, text: rest.text.trim(), edited: true, evidence: [] };
      });
    save(
      {
        ...draft,
        contributionStatement: draft.contributionStatement?.trim() || null,
        methodAndDataPlan: draft.methodAndDataPlan?.trim() || null,
        threatsToValidity: draft.threatsToValidity.map((t) => t.trim()).filter(Boolean),
        outline: draft.outline.map((o) => o.trim()).filter(Boolean),
        claims,
      },
      result.mode
    );
    setEditing(false);
    setDraft(null);
  };

  // Must match MAX_RECHECK_CLAIMS in api/jobs/[id]/plan/route.ts — the server truncates a
  // single request to this many claims, so more than this needs multiple requests or claims
  // past the cap silently stay "edited – not re-checked" with no indication anything was cut.
  const RECHECK_BATCH_SIZE = 10;

  const recheckEdited = async () => {
    if (!result) return;
    const editedIndexes = result.plan.claims.flatMap((c, i) => (c.edited ? [i] : []));
    if (!editedIndexes.length) return;
    setChecking(true);
    setError(null);
    try {
      const claims = [...result.plan.claims];
      for (let start = 0; start < editedIndexes.length; start += RECHECK_BATCH_SIZE) {
        const batch = editedIndexes.slice(start, start + RECHECK_BATCH_SIZE);
        const res = await fetch(`/api/jobs/${jobId}/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ground",
            extraSources,
            claims: batch.map((i) => claims[i]),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data.claims)) {
          // Keep whatever batches already succeeded instead of discarding them.
          save({ ...result.plan, claims }, result.mode);
          setError(data.error ?? "Could not re-check the edited claims.");
          return;
        }
        batch.forEach((claimIndex, k) => {
          if (data.claims[k]) claims[claimIndex] = data.claims[k];
        });
      }
      save({ ...result.plan, claims }, result.mode);
    } catch {
      setError("Could not reach the planning assistant. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const handleCopyExport = () => {
    if (!result) return;
    navigator.clipboard
      .writeText(buildPlanExportMarkdown(topicQuery, result.plan))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const plan = editing && draft ? draft : result?.plan ?? null;
  const updateDraft = (patch: Partial<DraftPlan>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const editedCount = result?.plan.claims.filter((c) => c.edited).length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 flex-shrink-0">Atlas Plan</h2>
          {selectedIdea && (
            <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full truncate max-w-xs">
              {selectedIdea.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(["plan", "outline"] as PlanMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                mode === m ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {m === "plan" ? "Full plan" : "Quick outline"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!result && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed mb-2">
              Atlas Plan drafts a contribution statement, claims to support, an evidence map grounded in
              your sources, a method plan, and an outline — directly, in one pass.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {extraSources.length > 0
                ? `Uses this job's peer-reviewed sources plus the ${extraSources.length} paper${extraSources.length === 1 ? "" : "s"} you collected in Setup.`
                : "Uses this job's peer-reviewed sources. Collect more papers in Setup to plan with them too."}
            </p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Optional: anything specific to focus the plan on"
              rows={2}
              className="w-full max-w-md resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={() => generate(mode)}
              className="px-6 py-2.5 font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              {mode === "plan" ? "Draft the plan" : "Draft the outline"}
            </button>
          </div>
        )}

        {loading && <p className="text-sm text-gray-400 text-center py-10">Drafting…</p>}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {result && plan && !loading && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <button onClick={finishEditing} className="text-xs font-semibold px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700">
                    Save edits
                  </button>
                  <button
                    onClick={() => { setEditing(false); setDraft(null); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startEditing}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Edit plan
                  </button>
                  {editedCount > 0 && (
                    <button
                      onClick={recheckEdited}
                      disabled={checking}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                    >
                      {checking ? "Checking…" : `Re-check ${editedCount} edited claim${editedCount === 1 ? "" : "s"}`}
                    </button>
                  )}
                  <button
                    onClick={handleCopyExport}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    {copied ? "Copied!" : "Copy as Markdown"}
                  </button>
                  <button
                    onClick={() => { setResult(null); setError(null); }}
                    className="text-xs text-gray-400 hover:text-red-600 ml-auto"
                  >
                    Draft again
                  </button>
                </>
              )}
            </div>

            {(plan.contributionStatement !== null || editing) && result.mode === "plan" && (
              <section>
                <SectionHeading>Contribution</SectionHeading>
                {editing ? (
                  <textarea
                    value={plan.contributionStatement ?? ""}
                    onChange={(e) => updateDraft({ contributionStatement: e.target.value })}
                    rows={3}
                    className={FIELD_CLASS}
                  />
                ) : (
                  <p className="text-sm text-gray-800 leading-relaxed">{plan.contributionStatement}</p>
                )}
              </section>
            )}

            {(plan.claims.length > 0 || editing) && (
              <>
                <div className="ink-divider" />
                <section>
                  <SectionHeading>Claims to support</SectionHeading>
                  <ul className="space-y-3">
                    {plan.claims.map((c, i) => (
                      <li key={i} className="text-sm">
                        {editing ? (
                          <div className="flex items-start gap-2">
                            <textarea
                              value={c.text}
                              onChange={(e) => updateDraft({ claims: plan.claims.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                              rows={2}
                              className={FIELD_CLASS}
                            />
                            <button
                              onClick={() => updateDraft({ claims: plan.claims.filter((_, j) => j !== i) })}
                              className="text-xs text-gray-400 hover:text-red-600 flex-shrink-0 mt-2"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start gap-2">
                              <button
                                onClick={() => setOpenEvidence(openEvidence === i ? null : i)}
                                disabled={c.edited}
                                title={c.edited ? "Edited after it was checked — re-check to see the evidence" : "Show the passages this claim was checked against"}
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${
                                  c.edited ? EDITED_BADGE_STYLE : BADGE_STYLE[c.grounding.status]
                                } ${c.edited ? "cursor-default" : "hover:opacity-80"}`}
                              >
                                {c.edited ? "edited – not re-checked" : `${c.grounding.status} ${openEvidence === i ? "▴" : "▾"}`}
                              </button>
                              <span className="text-gray-800">{c.text}</span>
                            </div>
                            {c.citedSourceTitles.length > 0 && (
                              <p className="text-xs text-gray-500 mt-1 ml-1">
                                Cites: {c.citedSourceTitles.join("; ")}
                                {!c.citationsVerified && " (a cited title wasn't in the source list — verify manually)"}
                              </p>
                            )}
                            {openEvidence === i && !c.edited && (
                              <div className="mt-2 ml-1 pl-3 border-l-2 border-gray-200 space-y-2">
                                <p className="text-[11px] text-gray-500">
                                  Decided by {METHOD_LABEL[c.grounding.method]}
                                  {c.grounding.confidence !== null && ` · confidence ${Math.round(c.grounding.confidence * 100)}%`}
                                </p>
                                {c.evidence && c.evidence.length > 0 ? (
                                  c.evidence.map((ev, k) => (
                                    <blockquote key={k} className="text-xs text-gray-700 leading-relaxed">
                                      “{ev.text}”
                                      {ev.sourceTitle && <span className="block text-[11px] text-gray-500 mt-0.5">— {ev.sourceTitle}</span>}
                                    </blockquote>
                                  ))
                                ) : (
                                  <p className="text-xs text-gray-500">
                                    {c.evidence ? "No passage in the sources matched this claim." : "Passages weren't recorded for this plan — draft again to see them."}
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {editing && (
                    <button
                      onClick={() =>
                        updateDraft({
                          claims: [
                            ...plan.claims,
                            { text: "", citedSourceTitles: [], citationsVerified: true, grounding: { status: "unavailable", confidence: null, method: "unavailable", overlapScore: 0 } },
                          ],
                        })
                      }
                      className="text-xs font-semibold text-indigo-700 hover:underline mt-2"
                    >
                      + Add claim
                    </button>
                  )}
                </section>
              </>
            )}

            {(plan.methodAndDataPlan !== null || editing) && result.mode === "plan" && (
              <>
                <div className="ink-divider" />
                <section>
                  <SectionHeading>Method and data plan</SectionHeading>
                  {editing ? (
                    <textarea
                      value={plan.methodAndDataPlan ?? ""}
                      onChange={(e) => updateDraft({ methodAndDataPlan: e.target.value })}
                      rows={4}
                      className={FIELD_CLASS}
                    />
                  ) : (
                    <p className="text-sm text-gray-800 leading-relaxed">{plan.methodAndDataPlan}</p>
                  )}
                </section>
              </>
            )}

            {(plan.threatsToValidity.length > 0 || (editing && result.mode === "plan")) && (
              <>
                <div className="ink-divider" />
                <section>
                  <SectionHeading>Threats to validity</SectionHeading>
                  <EditableList
                    items={plan.threatsToValidity}
                    editing={editing}
                    onChange={(threatsToValidity) => updateDraft({ threatsToValidity })}
                    addLabel="Add threat"
                  />
                </section>
              </>
            )}

            {(plan.outline.length > 0 || editing) && (
              <>
                <div className="ink-divider" />
                <section>
                  <SectionHeading>Outline</SectionHeading>
                  <EditableList
                    items={plan.outline}
                    editing={editing}
                    ordered
                    onChange={(outline) => updateDraft({ outline })}
                    addLabel="Add section"
                  />
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
