"use client";

import { useEffect, useState } from "react";

interface RunLogStep {
  id: string;
  step: string;
  prompt: string | null;
  model: string | null;
  seed: number | null;
  toolsCalled: string[];
  output: string | null;
  recordIds: string[];
  createdAt: string;
  humanEdited: boolean;
}

interface RunProvenanceProps {
  jobId: string;
  theme?: "dark" | "light" | "vibrant";
}

const STEP_LABELS: Record<string, string> = {
  expand_query: "Expanded the query into related keywords",
  fetch_sources: "Fetched sources",
  identify_subtopics: "Identified subtopics",
  build_root_node: "Built the root knowledge node",
  build_child_node: "Built a subtopic node",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// #58/V3.0.5: "a card per result showing what the AI did and what the human
// did" — one card per logged agent step: the prompt/model/tools on the AI
// side, and whether a human has since edited what it produced.
export default function RunProvenance({ jobId, theme = "light" }: RunProvenanceProps) {
  const [steps, setSteps] = useState<RunLogStep[]>([]);
  const [humanEditedCount, setHumanEditedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dark = theme === "dark";
  const cardBg = dark ? "bg-zinc-900 border-zinc-700" : "bg-white border-gray-200";
  const subText = dark ? "text-zinc-400" : "text-gray-500";
  const textColor = dark ? "text-zinc-100" : "text-gray-900";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/run-log`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) {
          setSteps(data.steps);
          setHumanEditedCount(data.humanEditedCount);
        }
      } catch {
        if (!cancelled) setError("Failed to load run provenance.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <div className={`flex-1 overflow-y-auto p-8 ${textColor}`}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Run provenance</h2>
          <a
            href={`/api/jobs/${jobId}/reproducibility-bundle`}
            download
            className={`text-xs px-3 py-1.5 rounded-lg border ${dark ? "border-zinc-700 hover:bg-zinc-800" : "border-gray-300 hover:bg-gray-50"}`}
          >
            Export reproducibility bundle
          </a>
        </div>
        <p className={`text-sm mb-6 ${subText}`}>
          Every agent step this run took — what it was asked, what model answered, and what it produced.
          {humanEditedCount > 0 && ` ${humanEditedCount} record(s) from this run have since been edited by a human.`}
        </p>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
        {loading ? (
          <p className={`text-sm ${subText}`}>Loading…</p>
        ) : steps.length === 0 ? (
          <p className={`text-sm ${subText}`}>No run log yet — older runs predate this feature.</p>
        ) : (
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.id} className={`rounded-xl border p-4 ${cardBg}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{STEP_LABELS[step.step] ?? step.step}</p>
                    <p className={`text-xs ${subText}`}>{formatTime(step.createdAt)}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white`} style={{ background: "#4c777c" }}>
                      AI
                    </span>
                    {step.humanEdited && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: "#76626b" }}>
                        human-edited since
                      </span>
                    )}
                  </div>
                </div>

                <div className={`mt-2 text-xs ${subText} space-y-0.5`}>
                  {step.model && <p>Model: {step.model}{step.seed !== null ? ` (seed ${step.seed})` : ""}</p>}
                  {step.toolsCalled.length > 0 && <p>Tools called: {step.toolsCalled.join(", ")}</p>}
                  {step.recordIds.length > 0 && <p>Records produced: {step.recordIds.length}</p>}
                </div>

                {step.prompt && (
                  <button
                    onClick={() => setExpandedId(expandedId === step.id ? null : step.id)}
                    className={`mt-2 text-xs underline ${subText}`}
                  >
                    {expandedId === step.id ? "Hide prompt" : "Show prompt"}
                  </button>
                )}
                {expandedId === step.id && step.prompt && (
                  <pre className={`mt-2 text-xs whitespace-pre-wrap rounded-lg p-2 ${dark ? "bg-zinc-800" : "bg-gray-50"}`}>
                    {step.prompt}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
