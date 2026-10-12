"use client";

import { useEffect, useState } from "react";

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

interface AtlasPlanProps {
  jobId: string;
  selectedIdea?: ResearchIdea;
  referenceDoc?: ReferenceDoc;
}

type PlanMode = "plan" | "outline";

interface GroundedPlanClaim {
  text: string;
  citedSourceTitles: string[];
  citationsVerified: boolean;
  grounding: { status: "grounded" | "unsupported" | "contradicted" | "unavailable"; confidence: number | null };
}

interface AtlasPlanResult {
  mode: PlanMode;
  contributionStatement: string | null;
  claims: GroundedPlanClaim[];
  methodAndDataPlan: string | null;
  threatsToValidity: string[];
  outline: string[];
  available: boolean;
}

interface CachedPlan {
  mode: PlanMode;
  plan: AtlasPlanResult;
  exportMarkdown: string | null;
  savedAt: number;
}

/** #63 (V3.0.0.1): the Atlas-native replacement for ARSPlanChat.tsx. A results view, not a chat — Atlas Plan drafts directly from the hypothesis and its sources rather than interrogating the researcher turn by turn. */
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

export default function AtlasPlan({ jobId, selectedIdea, referenceDoc }: AtlasPlanProps) {
  const cacheKey = makeCacheKey(jobId, selectedIdea?.title);

  const [mode, setMode] = useState<PlanMode>("plan");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedPlan | null>(null);

  useEffect(() => {
    setResult(loadCached(cacheKey));
  }, [cacheKey]);

  const generate = async (requestedMode: PlanMode) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: requestedMode, selectedIdea, instruction: instruction.trim() || undefined, referenceDoc }),
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
      const cached: CachedPlan = { mode: requestedMode, plan: data.plan, exportMarkdown: data.exportMarkdown, savedAt: Date.now() };
      setResult(cached);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cached));
      } catch {}
    } catch {
      setError("Could not reach the planning assistant. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyExport = () => {
    if (result?.exportMarkdown) navigator.clipboard.writeText(result.exportMarkdown).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">Atlas Plan</span>
          {selectedIdea && (
            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full truncate max-w-xs">
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
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed mb-4">
              Atlas Plan drafts a contribution statement, claims to support, an evidence map grounded in
              your peer-reviewed sources, a method plan, and an outline — directly, in one pass.
            </p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Optional: anything specific to focus the plan on"
              rows={2}
              className="w-full max-w-md resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={() => generate(mode)}
              className="px-6 py-2.5 rounded-xl font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              {mode === "plan" ? "Draft the plan" : "Draft the outline"}
            </button>
          </div>
        )}

        {loading && <p className="text-sm text-gray-400 text-center py-10">Drafting…</p>}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {result && !loading && (
          <div className="space-y-5 max-w-2xl">
            {result.plan.contributionStatement && (
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Contribution</h4>
                <p className="text-sm text-gray-800">{result.plan.contributionStatement}</p>
              </section>
            )}

            {result.plan.claims.length > 0 && (
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Claims to support</h4>
                <ul className="space-y-2">
                  {result.plan.claims.map((c, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-start gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${BADGE_STYLE[c.grounding.status]}`}>
                          {c.grounding.status}
                        </span>
                        <span className="text-gray-800">{c.text}</span>
                      </div>
                      {c.citedSourceTitles.length > 0 && (
                        <p className="text-xs text-gray-400 ml-[52px] mt-0.5">
                          {c.citedSourceTitles.join("; ")}
                          {!c.citationsVerified && " (a cited title wasn't in the source list — verify manually)"}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.plan.methodAndDataPlan && (
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Method and data plan</h4>
                <p className="text-sm text-gray-800">{result.plan.methodAndDataPlan}</p>
              </section>
            )}

            {result.plan.threatsToValidity.length > 0 && (
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Threats to validity</h4>
                <ul className="list-disc ml-5 text-sm text-gray-800 space-y-0.5">
                  {result.plan.threatsToValidity.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </section>
            )}

            {result.plan.outline.length > 0 && (
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Outline</h4>
                <ol className="list-decimal ml-5 text-sm text-gray-800 space-y-0.5">
                  {result.plan.outline.map((o, i) => <li key={i}>{o}</li>)}
                </ol>
              </section>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCopyExport}
                disabled={!result.exportMarkdown}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Copy as Markdown
              </button>
              <button
                onClick={() => { setResult(null); setError(null); }}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Draft again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
