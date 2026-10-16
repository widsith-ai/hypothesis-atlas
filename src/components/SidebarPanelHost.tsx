"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PaperMap from "./PaperMap";
import NotebookTab from "./NotebookTab";
import ExperimentsPanel from "./ExperimentsPanel";
import PaperReviewPanel from "./PaperReviewPanel";

type PanelTab = "graph" | "experiments" | "papermap" | "notebook" | "review";

interface JobSummary {
  id: string;
  topicQuery: string;
  status: string;
}

interface GraphEntitySummary {
  id: string;
  type: string;
  label: string;
  updatedAt: string;
}

interface GraphSummary {
  stats: { entities: number; edges: number; byType: Record<string, number> };
  recent: GraphEntitySummary[];
}

const TABS: { id: PanelTab; label: string; needsJob: boolean }[] = [
  { id: "graph", label: "Research Graph", needsJob: false },
  { id: "experiments", label: "Experiments", needsJob: true },
  { id: "papermap", label: "Paper Map", needsJob: true },
  { id: "notebook", label: "Notebook", needsJob: true },
  { id: "review", label: "Peer Review", needsJob: false },
];

const TAB_STORAGE_KEY = "workspace-sidebar-tab";
const JOB_STORAGE_KEY = "workspace-sidebar-jobId";

const TYPE_COLOR: Record<string, string> = {
  topic: "#587380",
  hypothesis: "#76626b",
  method: "#4c777c",
  evidence: "#567d5e",
  gap: "#a87732",
  note: "#b54a33",
  outcome: "#3f6b4f",
  dataset: "#5a6a8c",
};

interface SidebarPanelHostProps {
  theme?: "dark" | "light" | "vibrant";
}

/**
 * #23/V4.3 — the Workspace page's right half: a tabbed host for the app's
 * other surfaces (Research Graph, Experiments, Paper Map, Notebook, Peer
 * Review), each embedded as-is rather than rebuilt. Research Graph and Peer
 * Review are job-agnostic and work immediately; Experiments/Paper
 * Map/Notebook are scoped to one research run, so this adds a run picker —
 * without it those three tabs would have nothing to point their jobId prop
 * at. Last-active tab and run selection both persist in localStorage.
 *
 * Experiments renders with an empty message transcript (it has nothing to
 * verify until there's been an experiment-design conversation for the
 * selected run) — real chat-driven population is #24's job (two-way
 * chat<->sidebar sync), not this one.
 */
export default function SidebarPanelHost({ theme = "light" }: SidebarPanelHostProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("graph");
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [graphSummary, setGraphSummary] = useState<GraphSummary | null>(null);
  const [graphError, setGraphError] = useState("");

  const dark = theme === "dark";
  const subText = dark ? "text-zinc-400" : "text-zinc-500";
  const tabActive = dark ? "border-indigo-400 text-white" : "border-indigo-500 text-zinc-900";
  const tabIdle = dark ? "border-transparent text-zinc-400 hover:text-zinc-200" : "border-transparent text-zinc-500 hover:text-zinc-800";
  const selectCls = dark
    ? "bg-zinc-800 border-zinc-600 text-zinc-100"
    : "bg-white border-gray-300 text-zinc-800";

  useEffect(() => {
    try {
      const savedTab = localStorage.getItem(TAB_STORAGE_KEY) as PanelTab | null;
      if (savedTab && TABS.some((t) => t.id === savedTab)) setActiveTab(savedTab);
      const savedJob = localStorage.getItem(JOB_STORAGE_KEY);
      if (savedJob) setJobId(savedJob);
    } catch {
      // Private browsing / storage disabled — just use the defaults.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch {}
  }, [activeTab]);

  useEffect(() => {
    if (!jobId) return;
    try {
      localStorage.setItem(JOB_STORAGE_KEY, jobId);
    } catch {}
  }, [jobId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/jobs?limit=50");
        const data = await res.json();
        const list: JobSummary[] = Array.isArray(data.jobs) ? data.jobs : [];
        setJobs(list);
        setJobId((current) => (current && list.some((j) => j.id === current) ? current : list[0]?.id ?? ""));
      } catch {
        // No connection / no jobs — job-scoped tabs fall back to the "pick a run" prompt.
      } finally {
        setLoadingJobs(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeTab !== "graph" || graphSummary) return;
    (async () => {
      try {
        const res = await fetch("/api/graph");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        const recent: GraphEntitySummary[] = [...data.entities]
          .sort((a: GraphEntitySummary, b: GraphEntitySummary) => (a.updatedAt < b.updatedAt ? 1 : -1))
          .slice(0, 8);
        setGraphSummary({ stats: data.stats, recent });
      } catch {
        setGraphError("Failed to load the research graph.");
      }
    })();
  }, [activeTab, graphSummary]);

  const selectedJob = jobs.find((j) => j.id === jobId) ?? null;

  const jobPicker = (
    <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0">
      <span className={`text-xs ${subText}`}>Run:</span>
      {loadingJobs ? (
        <span className={`text-xs ${subText}`}>Loading…</span>
      ) : jobs.length === 0 ? (
        <span className={`text-xs ${subText}`}>
          No research runs yet — <Link href="/explore" className="underline">start one</Link>.
        </span>
      ) : (
        <select
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className={`flex-1 min-w-0 rounded-lg border px-2 py-1 text-xs ${selectCls}`}
        >
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.topicQuery} {job.status !== "completed" ? `(${job.status})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const activeMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center gap-1 px-2 pt-2 border-b overflow-x-auto flex-shrink-0 ${dark ? "border-zinc-700" : "border-gray-200"}`}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id ? tabActive : tabIdle
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeMeta.needsJob && jobPicker}

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeMeta.needsJob && !selectedJob ? (
          <div className="h-full flex items-center justify-center p-6">
            <p className={`text-sm text-center ${subText}`}>
              {loadingJobs ? "Loading your research runs…" : "Pick a research run above to open this panel."}
            </p>
          </div>
        ) : activeTab === "graph" ? (
          <div className="h-full overflow-y-auto p-4">
            {graphError && <p className="text-sm text-red-500 mb-3">{graphError}</p>}
            {!graphSummary && !graphError && <p className={`text-sm ${subText}`}>Loading…</p>}
            {graphSummary && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className={`text-xs ${subText}`}>Across every research run</p>
                    <p className="text-sm font-semibold">
                      {graphSummary.stats.entities} entities · {graphSummary.stats.edges} edges
                    </p>
                  </div>
                  <Link href="/graph" className={`text-xs px-3 py-1.5 rounded-lg border ${dark ? "border-zinc-600 hover:bg-zinc-800" : "border-gray-300 hover:bg-gray-50"}`}>
                    Open full graph ↗
                  </Link>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {Object.entries(graphSummary.stats.byType).map(([type, count]) => (
                    <span
                      key={type}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ background: TYPE_COLOR[type] ?? "#6b7280" }}
                    >
                      {type} · {count}
                    </span>
                  ))}
                </div>
                <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${subText}`}>Recently updated</p>
                <div className="space-y-1.5">
                  {graphSummary.recent.map((e) => (
                    <div key={e.id} className={`text-xs rounded-lg px-2 py-1.5 ${dark ? "bg-zinc-800/60" : "bg-gray-50"}`}>
                      <span className="font-medium" style={{ color: TYPE_COLOR[e.type] ?? "#6b7280" }}>{e.type}</span>{" "}
                      {e.label}
                    </div>
                  ))}
                  {graphSummary.recent.length === 0 && <p className={`text-xs ${subText}`}>Nothing in the graph yet.</p>}
                </div>
              </>
            )}
          </div>
        ) : activeTab === "review" ? (
          <div className="h-full overflow-y-auto p-4">
            <PaperReviewPanel />
          </div>
        ) : activeTab === "papermap" && selectedJob ? (
          <PaperMap jobId={selectedJob.id} theme={theme} />
        ) : activeTab === "notebook" && selectedJob ? (
          <NotebookTab jobId={selectedJob.id} topic={selectedJob.topicQuery} theme={theme} />
        ) : activeTab === "experiments" && selectedJob ? (
          <div className="h-full overflow-y-auto p-4 space-y-3">
            <p className={`text-xs ${subText}`}>
              Populates once you&apos;ve had an experiment-design conversation for this run — full chat↔sidebar sync lands in a follow-up (#24).
            </p>
            <ExperimentsPanel jobId={selectedJob.id} messages={[]} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
