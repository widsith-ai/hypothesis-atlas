"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Outcome {
  id: string;
  label: string;
  result?: string;
  failureMode?: string | null;
  effect?: string | null;
  conditions?: string | null;
}

interface DeadHypothesis {
  id: string;
  label: string;
  content: string | null;
  status: "refuted" | "abandoned" | undefined;
  abandonedReason: string | null;
  outcomes: Outcome[];
  createdAt: string;
  updatedAt: string;
}

interface FilterOption {
  id: string;
  label: string;
}

const STATUS_COLORS: Record<string, string> = {
  refuted: "#b54a33",
  abandoned: "#6b6560",
};

// #56/V3.0.3: a dedicated view of negative results — refuted and abandoned
// hypotheses look identical to every open one in the main graph otherwise,
// which buries exactly the information "don't repeat this" needs to surface.
export default function GraveyardPage() {
  const [hypotheses, setHypotheses] = useState<DeadHypothesis[]>([]);
  const [methods, setMethods] = useState<FilterOption[]>([]);
  const [datasets, setDatasets] = useState<FilterOption[]>([]);
  const [methodFilter, setMethodFilter] = useState("");
  const [datasetFilter, setDatasetFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (methodFilter) params.set("method", methodFilter);
      if (datasetFilter) params.set("dataset", datasetFilter);
      const res = await fetch(`/api/graph/graveyard?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setHypotheses(data.hypotheses);
      setMethods(data.methods);
      setDatasets(data.datasets);
      setError("");
    } catch {
      setError("Failed to load the graveyard.");
    } finally {
      setLoading(false);
    }
  }, [methodFilter, datasetFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen ink-night text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Graveyard</h1>
            <p className="text-sm text-zinc-400 mt-1">Refuted and abandoned hypotheses — negative results, kept visible on purpose.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/graph" className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm hover:bg-zinc-800">Research Graph</Link>
            <Link href="/" className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm hover:bg-zinc-800">Home</Link>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">All methods</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <select
            value={datasetFilter}
            onChange={(e) => setDatasetFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">All datasets</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : hypotheses.length === 0 ? (
          <p className="text-sm text-zinc-400">Nothing here yet — no refuted or abandoned hypotheses match this filter.</p>
        ) : (
          <div className="space-y-3">
            {hypotheses.map((h) => (
              <div key={h.id} className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold leading-snug">{h.label}</p>
                  {h.status && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                      style={{ background: STATUS_COLORS[h.status] }}
                    >
                      {h.status}
                    </span>
                  )}
                </div>
                {h.content && <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{h.content}</p>}
                {h.abandonedReason && (
                  <p className="text-xs italic text-zinc-400 mt-2">Abandoned: {h.abandonedReason}</p>
                )}
                {h.outcomes.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Outcomes</p>
                    {h.outcomes.map((o) => (
                      <div key={o.id} className="text-xs text-zinc-300 rounded-lg bg-zinc-800/60 px-2 py-1.5">
                        <span className="font-semibold">{o.result}</span>
                        {o.failureMode && <span> — {o.failureMode}</span>}
                        {o.effect && <span className="text-zinc-500"> · effect: {o.effect}</span>}
                        {o.conditions && <span className="text-zinc-500"> · conditions: {o.conditions}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
