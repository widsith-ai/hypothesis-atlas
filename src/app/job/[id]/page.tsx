"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProgressTimeline from "@/components/ProgressTimeline";
import KnowledgeTree from "@/components/KnowledgeTree";
import NodeDetail from "@/components/NodeDetail";
import NotebookTab from "@/components/NotebookTab";
import PaperMap from "@/components/PaperMap";
import NotesPanel from "@/components/NotesPanel";
import NotesTab from "@/components/NotesTab";
import QuestionBot from "@/components/QuestionBot";
import InkSeal from "@/components/ink/InkSeal";
import RunProvenance from "@/components/RunProvenance";

interface Job {
  id: string;
  topicQuery: string;
  status: string;
  rootNodeId: string | null;
  canClaim?: boolean;
}

interface ProgressEvent {
  stage: string;
  status: string;
  message: string;
  count?: number;
  timestamp: number;
}

type Theme = "dark" | "light" | "vibrant";

const THEME_STYLES = {
  dark: {
    page: "ink-night text-white",
    pageSoft: "bg-zinc-900/90 border-zinc-800",
    pageMuted: "bg-zinc-900/80 border-zinc-800",
    progressSidebar: "bg-zinc-900/85 border-zinc-800",
    loadingCard: "bg-zinc-900/80 border border-zinc-700",
    loadingTitle: "text-zinc-100",
    loadingText: "text-zinc-400",
    emptyNodeCard: "bg-zinc-900/70 border-zinc-700",
    emptyNodeIcon: "text-zinc-500",
    emptyNodeTitle: "text-zinc-300",
    emptyNodeText: "text-zinc-500",
    backToExploreButton:
      "bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700",
    tabBar: "bg-zinc-900 border-zinc-800",
    tabActive: "border-indigo-400 text-indigo-300",
    tabIdle: "text-zinc-400 hover:text-zinc-200 hover:border-zinc-600",
    title: "text-indigo-200",
  },
  light: {
    page: "ink-paper text-zinc-900",
    pageSoft: "bg-white/90 border-gray-200",
    pageMuted: "bg-white/80 border-gray-200",
    progressSidebar: "bg-white/80 border-gray-200",
    loadingCard: "bg-white/80",
    loadingTitle: "text-gray-800",
    loadingText: "text-gray-600",
    emptyNodeCard: "bg-gray-50 border-gray-300",
    emptyNodeIcon: "text-gray-400",
    emptyNodeTitle: "text-gray-600",
    emptyNodeText: "text-gray-500",
    backToExploreButton:
      "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50",
    tabBar: "bg-white border-gray-200",
    tabActive: "border-blue-500 text-blue-600",
    tabIdle: "text-gray-500 hover:text-gray-700 hover:border-gray-300",
    title: "text-indigo-800",
  },
  vibrant: {
    page: "ink-jade text-zinc-900",
    pageSoft: "bg-white/80 border-rose-200",
    pageMuted: "bg-white/85 border-zinc-200",
    progressSidebar: "bg-white/85 border-rose-200",
    loadingCard: "bg-white/85 border border-rose-200",
    loadingTitle: "text-zinc-900",
    loadingText: "text-zinc-600",
    emptyNodeCard: "bg-white/80 border-rose-200",
    emptyNodeIcon: "text-zinc-400",
    emptyNodeTitle: "text-zinc-700",
    emptyNodeText: "text-zinc-500",
    backToExploreButton:
      "bg-white/90 border border-rose-300 text-zinc-700 hover:bg-white",
    tabBar: "bg-white/80 border-rose-200",
    tabActive: "border-fuchsia-500 text-fuchsia-700",
    tabIdle: "text-zinc-500 hover:text-zinc-700 hover:border-zinc-300",
    title: "text-fuchsia-700",
  },
} as const;

export default function JobPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"knowledge" | "notebook" | "papermap" | "notes" | "provenance">(
    "knowledge",
  );
  const [theme, setTheme] = useState<Theme>("light");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/claim`, { method: "POST" });
      if (res.ok) {
        setJob((prev) => (prev ? { ...prev, canClaim: false } : prev));
      } else {
        const data = await res.json().catch(() => ({}));
        setClaimError(data.error ?? "Could not claim this research.");
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
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam && ["knowledge", "notebook", "papermap", "notes", "provenance"].includes(tabParam)) {
      setActiveTab(tabParam as "knowledge" | "notebook" | "papermap" | "notes" | "provenance");
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved && ["dark", "light", "vibrant"].includes(saved)) {
      setTheme(saved);
    }
  }, []);

  const t = THEME_STYLES[theme];

  useEffect(() => {
    const fetchJob = () => {
      fetch(`/api/jobs/${jobId}`)
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          // The API returns { error } with a non-2xx status (e.g. 404 for a
          // deleted/invalid job id) — that object is truthy, so without this
          // check it used to pass straight through to setJob() and crash
          // later on job.id.slice() with no id on the error shape.
          if (!res.ok || !data?.id) {
            setJobError(data?.error ?? "Job not found");
            return;
          }
          // Clear a stale error from an earlier transient failure — this
          // poll succeeded, so a prior non-2xx response (e.g. a race right
          // after job creation) shouldn't permanently lock the page into
          // the error view.
          setJobError(null);
          setJob(data);
          // Only set selectedNodeId if it hasn't been set yet
          if (data.rootNodeId && selectedNodeId === null) {
            setSelectedNodeId(data.rootNodeId);
          }
        })
        .catch(console.error);
    };

    fetchJob();

    const eventSource = new EventSource(`/api/jobs/${jobId}/events`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEvents((prev) => [...prev, data]);

      if (data.stage === "build_root" && data.status === "completed") {
        fetchJob();
      }

      if (data.stage === "complete" && data.status === "completed") {
        fetchJob();
      }
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, selectedNodeId]);

  if (jobError) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${t.page}`}
      >
        <div className="text-center max-w-sm px-6">
          <p className="text-lg font-semibold text-gray-700">{jobError}</p>
          <p className="text-sm text-gray-500 mt-2">
            This research job may have been deleted, or the link is incorrect.
          </p>
          <Link
            href="/jobs"
            className="inline-block mt-5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
          >
            ← Back to My Research
          </Link>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${t.page}`}
      >
        <div className="text-center">
          <div className="relative mb-6">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 mx-auto"></div>
            <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-blue-600 mx-auto absolute top-0 left-1/2 -ml-10"></div>
          </div>
          <p className="text-lg font-semibold text-gray-700">
            Loading job details...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${t.page} transition-all duration-500`}>
      <header
        className={`${t.pageSoft} backdrop-blur-sm border-b px-6 py-5 shadow-sm`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <InkSeal text="HA" size={40} />
            <div>
              <h1 className={`text-2xl font-bold ${t.title}`}>
                {job.topicQuery}
              </h1>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                ID: {job.id.slice(0, 12)}...
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {job.canClaim && (
              <div className="relative">
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  title="This research was created anonymously — claim it to attach it to your account"
                >
                  {claiming ? "Claiming…" : "Claim this research"}
                </button>
                {claimError && (
                  <div className="absolute top-full right-0 mt-1.5 w-56 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 shadow-md z-20">
                    {claimError}
                  </div>
                )}
              </div>
            )}
            <Link
              href="/jobs"
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${t.backToExploreButton}`}
            >
              ← My Research
            </Link>
            <Link
              href="/explore"
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${t.backToExploreButton}`}
            >
              Word Cloud
            </Link>
            <span
              className={`px-4 py-2 rounded-lg text-sm font-semibold shadow-sm ${
                job.status === "completed"
                  ? "bg-green-100 text-green-800 border border-green-200"
                  : job.status === "processing"
                    ? "bg-blue-100 text-blue-800 border border-blue-200 animate-pulse"
                    : job.status === "failed"
                      ? "bg-red-100 text-red-800 border border-red-200"
                      : "bg-gray-100 text-gray-800 border border-gray-200"
              }`}
            >
              {job.status === "processing" && (
                <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mr-2 animate-ping"></span>
              )}
              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className={`${t.tabBar} border-b`}>
        <div className="px-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("knowledge")}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "knowledge"
                  ? t.tabActive
                  : `border-transparent ${t.tabIdle}`
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Knowledge Tree
              </div>
            </button>
            <button
              onClick={() => setActiveTab("notebook")}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "notebook"
                  ? t.tabActive
                  : `border-transparent ${t.tabIdle}`
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Topic Workspace
              </div>
            </button>
            <button
              onClick={() => setActiveTab("papermap")}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "papermap"
                  ? t.tabActive
                  : `border-transparent ${t.tabIdle}`
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Paper Map
              </div>
            </button>

            <button
              onClick={() => setActiveTab("notes")}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "notes"
                  ? t.tabActive
                  : `border-transparent ${t.tabIdle}`
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Notes
              </div>
            </button>

            <button
              onClick={() => setActiveTab("provenance")}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "provenance"
                  ? t.tabActive
                  : `border-transparent ${t.tabIdle}`
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Run Provenance
              </div>
            </button>

            <Link
              href={`/job/${jobId}/paper`}
              className="ml-4 my-auto py-2 px-4 rounded-lg font-semibold text-sm flex items-center gap-2 shadow-sm"
              style={{ background: "linear-gradient(to right, #455c68, #5f4e56)", color: "#fbf8f1" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Write Paper
            </Link>
          </nav>
        </div>
      </div>

      <div className="flex h-[calc(100vh-89px-49px)]">
        {activeTab === "knowledge" ? (
          <>
            <div
              className={`w-80 ${t.progressSidebar} backdrop-blur-sm border-r overflow-y-auto shadow-sm`}
            >
              <ProgressTimeline events={events} theme={theme} />
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {job.rootNodeId ? (
                <KnowledgeTree
                  rootNodeId={job.rootNodeId}
                  selectedNodeId={selectedNodeId}
                  onNodeSelect={setSelectedNodeId}
                  events={events}
                  jobId={jobId}
                  topic={job.topicQuery}
                  theme={theme}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div
                    className={`text-center ${t.loadingCard} backdrop-blur-sm rounded-2xl p-12 shadow-lg`}
                  >
                    <div className="relative mb-6">
                      <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 mx-auto"></div>
                      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-600 mx-auto absolute top-0 left-1/2 -ml-8"></div>
                    </div>
                    <p
                      className={`text-lg font-semibold mb-2 ${t.loadingTitle}`}
                    >
                      Building Knowledge Tree
                    </p>
                    <p className={`text-sm ${t.loadingText}`}>
                      Analyzing sources and creating nodes...
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div
              className={`w-96 ${t.pageMuted} backdrop-blur-sm border-l overflow-y-auto shadow-sm`}
            >
              {selectedNodeId ? (
                <NodeDetail nodeId={selectedNodeId} theme={theme} />
              ) : (
                <div className="p-8 text-center">
                  <div
                    className={`rounded-xl p-8 border-2 border-dashed ${t.emptyNodeCard}`}
                  >
                    <svg
                      className={`w-16 h-16 mx-auto mb-4 ${t.emptyNodeIcon}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className={`font-medium ${t.emptyNodeTitle}`}>
                      Select a node to view details
                    </p>
                    <p className={`text-sm mt-2 ${t.emptyNodeText}`}>
                      Click any node in the knowledge tree
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : activeTab === "notebook" ? (
          <NotebookTab jobId={jobId} topic={job.topicQuery} theme={theme} />
        ) : activeTab === "notes" ? (
          <NotesTab jobId={jobId} topic={job.topicQuery} theme={theme} />
        ) : activeTab === "provenance" ? (
          <RunProvenance jobId={jobId} theme={theme} />
        ) : (
          <PaperMap jobId={jobId} theme={theme} />
        )}
      </div>

      {/* Floating notes button — hidden on the Notes tab since it's fully visible there */}
      <NotesPanel jobId={jobId} topic={job.topicQuery} theme={theme} hidden={activeTab === "notes"} />
      <QuestionBot jobId={jobId} topic={job.topicQuery} />
    </div>
  );
}
