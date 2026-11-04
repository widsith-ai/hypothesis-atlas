"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AccountSlot from "@/components/AccountSlot";

interface Job {
  id: string;
  topicQuery: string;
  status: string;
  rootNodeId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { sources: number; nodes: number };
  isMine?: boolean;
  isUnclaimed?: boolean;
}

interface BoldIdea {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
  hasTrace: boolean;
  isMine?: boolean;
  isUnclaimed?: boolean;
}

/** #43/V3.2 ownership display: "Yours" for the signed-in user's own items, "Unclaimed" for anonymous work they could claim. Nothing is shown to signed-out viewers — ownership only means something once there's an account to compare against. */
function OwnershipBadge({ isMine, isUnclaimed }: { isMine?: boolean; isUnclaimed?: boolean }) {
  if (isMine) {
    return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0">Yours</span>;
  }
  if (isUnclaimed) {
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">Unclaimed</span>;
  }
  return null;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-800 border border-green-200",
  processing: "bg-blue-100 text-blue-800 border border-blue-200",
  failed: "bg-red-100 text-red-800 border border-red-200",
  pending: "bg-gray-100 text-gray-600 border border-gray-200",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function JobsPage() {
  const [tab, setTab] = useState<"jobs" | "bold">("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ideas, setIdeas] = useState<BoldIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    // Fetched independently, not Promise.all'd — a failure in one list
    // (e.g. the newer bold-ideas endpoint) shouldn't blank out the other,
    // previously-working one.
    Promise.allSettled([
      fetch("/api/jobs?limit=50").then((r) => r.json()),
      fetch("/api/bold-ideas?limit=50").then((r) => r.json()),
    ])
      .then(([jobsResult, ideasResult]) => {
        if (jobsResult.status === "fulfilled") setJobs(jobsResult.value.jobs ?? []);
        else console.error(jobsResult.reason);
        if (ideasResult.status === "fulfilled") setIdeas(ideasResult.value.ideas ?? []);
        else console.error(ideasResult.reason);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this research job? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteIdea = async (id: string) => {
    if (!confirm("Delete this bold idea and its research run? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await fetch(`/api/bold-ideas/${id}`, { method: "DELETE" });
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen ink-paper">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/explore"
              className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Word Cloud
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="font-bold text-gray-900">My Research</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/explore"
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all"
            >
              + New Topic
            </Link>
            <AccountSlot />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("jobs")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === "jobs" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Research Jobs
          </button>
          <button
            onClick={() => setTab("bold")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
              tab === "bold" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span>✨</span>
            Bold Idea
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : tab === "jobs" ? (
          jobs.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-500 mb-4">No research jobs yet.</p>
              <Link
                href="/explore"
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
              >
                Start exploring →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">{jobs.length} research job{jobs.length !== 1 ? "s" : ""}</p>
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold text-gray-900 text-base truncate">
                          {job.topicQuery}
                        </h2>
                        <OwnershipBadge isMine={job.isMine} isUnclaimed={job.isUnclaimed} />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_STYLES[job.status] ?? STATUS_STYLES.pending}`}>
                          {job.status === "processing" && (
                            <span className="inline-block w-1.5 h-1.5 bg-blue-600 rounded-full mr-1 animate-ping align-middle" />
                          )}
                          {job.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span>{timeAgo(job.createdAt)}</span>
                        <span>·</span>
                        <span>{job._count.sources} sources</span>
                        <span>·</span>
                        <span>{job._count.nodes} nodes</span>
                        <span>·</span>
                        <span className="font-mono text-gray-300">{job.id.slice(0, 10)}…</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={`/job/${job.id}`}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                      >
                        View Research
                      </Link>
                      <Link
                        href={`/job/${job.id}/paper`}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                        style={{ background: "linear-gradient(to right, #455c68, #5f4e56)", color: "#fbf8f1" }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Write Paper
                      </Link>
                      <button
                        onClick={() => handleDelete(job.id)}
                        disabled={deleting === job.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete job"
                      >
                        {deleting === job.id ? (
                          <div className="animate-spin h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : ideas.length === 0 ? (
          <div className="text-center py-24">
            <span className="text-5xl">✨</span>
            <p className="text-gray-500 mt-4 mb-4">No bold ideas yet.</p>
            <Link
              href="/bold-idea"
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #a87732, #9c3a26)" }}
            >
              Try Something Bold →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-4">{ideas.length} bold idea{ideas.length !== 1 ? "s" : ""}</p>
            {ideas.map((idea) => {
              return (
                <div
                  key={idea.id}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <OwnershipBadge isMine={idea.isMine} isUnclaimed={idea.isUnclaimed} />
                      </div>
                      <p className="text-gray-900 text-sm leading-relaxed">{idea.text}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {idea.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-pink-50 text-pink-700"
                          >
                            {tag}
                          </span>
                        ))}
                        {idea.hasTrace ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800 border border-green-200">
                            Ready
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            Pending
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{timeAgo(idea.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {idea.hasTrace && (
                        <Link
                          href={`/bold-idea/session/${idea.id}`}
                          className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                        >
                          View Research
                        </Link>
                      )}
                      <button
                        onClick={() => handleDeleteIdea(idea.id)}
                        disabled={deleting === idea.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete bold idea"
                      >
                        {deleting === idea.id ? (
                          <div className="animate-spin h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
