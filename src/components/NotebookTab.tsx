"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  NotebookPage,
  NotebookMessage,
  CandidateTopic,
  ResearchIdea,
} from "@/lib/notebook-types";
import { appendNote, loadNotes } from "@/lib/notes";
import PageList from "./PageList";
import MarkdownEditor from "./MarkdownEditor";
import ChatPanel from "./ChatPanel";
import CandidateTopics from "./CandidateTopics";
import SuggestedTopics from "./SuggestedTopics";

interface NotebookTabProps {
  jobId: string;
  topic?: string;
  theme?: "dark" | "light" | "vibrant";
}

interface SuggestedTopic {
  label: string;
  evidence?: string;
}

export default function NotebookTab({
  jobId,
  topic = "",
  theme = "light",
}: NotebookTabProps) {
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [currentPage, setCurrentPage] = useState<NotebookPage | null>(null);
  const [messages, setMessages] = useState<NotebookMessage[]>([]);
  const [candidates, setCandidates] = useState<CandidateTopic[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [top3Ideas, setTop3Ideas] = useState<ResearchIdea[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [activePanel, setActivePanel] = useState<"pages" | "candidates">(
    "pages",
  );
  const [suggestedTopics, setSuggestedTopics] = useState<SuggestedTopic[]>([]);
  const [savedInsight, setSavedInsight] = useState(false);
  const [savedChat, setSavedChat] = useState(false);
  const [noteCount, setNoteCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refreshCount = () => {
      loadNotes(jobId)
        .then((notes) => { if (!cancelled) setNoteCount(notes.length); })
        .catch(() => {});
    };
    refreshCount();
    window.addEventListener("atlas:notes-update", refreshCount);
    return () => {
      cancelled = true;
      window.removeEventListener("atlas:notes-update", refreshCount);
    };
  }, [jobId]);

  const isDark = theme === "dark";
  const isVibrant = theme === "vibrant";

  const shell = isDark
    ? "bg-zinc-900 border-zinc-800"
    : isVibrant
      ? "bg-white/85 border-rose-200"
      : "bg-white border-gray-200";

  const tabActive = isDark
    ? "text-indigo-300 border-b-2 border-indigo-400 bg-indigo-500/10"
    : isVibrant
      ? "text-fuchsia-700 border-b-2 border-fuchsia-500 bg-fuchsia-50"
      : "text-blue-600 border-b-2 border-blue-600 bg-blue-50";

  const tabIdle = isDark
    ? "text-zinc-400 hover:text-zinc-200"
    : "text-gray-600 hover:text-gray-900";

  const selectedTopicLabels = candidates
    .filter((c) => selectedCandidates.includes(c.id))
    .map((c) => c.label);

  const activeTopicLabels = candidates
    .filter((c) => c.status === "active")
    .map((c) => c.label);

  const notesPages = pages.filter((page) => page.content.trim().length > 0);

  const hasExportableContent =
    notesPages.length > 0 ||
    activeTopicLabels.length > 0 ||
    selectedTopicLabels.length > 0 ||
    (top3Ideas?.length ?? 0) > 0;

  useEffect(() => {
    loadPages();
    loadMessages();
    loadCandidates();
    loadTop3Ideas();
  }, [jobId]);

  const loadPages = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/notebook/pages`);
      if (response.ok) {
        const pagesData = await response.json();
        setPages(pagesData);
        if (pagesData.length > 0 && !currentPage) {
          setCurrentPage(pagesData[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load pages:", error);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/notebook/messages`);
      if (response.ok) {
        const messagesData = await response.json();
        setMessages(messagesData);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const loadCandidates = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/candidates`);
      if (response.ok) {
        const candidatesData = await response.json();
        setCandidates(candidatesData);
      }
    } catch (error) {
      console.error("Failed to load candidates:", error);
    }
  };

  const loadTop3Ideas = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/converge`);
      if (response.ok) {
        const data = await response.json();
        setTop3Ideas(data.ideas);
      }
    } catch (error) {
      console.error("Failed to load top 3 ideas:", error);
    }
  };

  const handleCreatePage = async (title: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/notebook/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || `Page ${pages.length + 1}`,
          content: "",
        }),
      });

      if (response.ok) {
        const newPage = await response.json();
        setPages([...pages, newPage]);
        setCurrentPage(newPage);
      }
    } catch (error) {
      console.error("Failed to create page:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportMarkdown = () => {
    if (!hasExportableContent) return;

    const generatedAt = new Date().toISOString();
    const ideaSection =
      top3Ideas && top3Ideas.length > 0
        ? top3Ideas
            .map(
              (idea, index) => `### ${index + 1}. ${idea.title}

**Problem Statement**
${idea.problem_to_solve}

**Proposed Method**
${idea.proposed_method.map((method) => `- ${method}`).join("\n")}

**Next Steps**
${idea.next_3_steps.map((step) => `- ${step}`).join("\n")}
`,
            )
            .join("\n")
        : "_No converged ideas yet._";

    const notesSection =
      notesPages.length > 0
        ? notesPages
            .map((page) => `### ${page.title}\n\n${page.content.trim()}\n`)
            .join("\n")
        : "_No notebook notes yet._";

    const markdown = `# Hypothesis Atlas Brainstorm Export

Generated: ${generatedAt}
Job ID: ${jobId}

## Topic Pack (for Claude / ChatGPT)

### Selected Topics
${selectedTopicLabels.length > 0 ? selectedTopicLabels.map((topic) => `- ${topic}`).join("\n") : "_No selected topics yet._"}

### Candidate Topics
${activeTopicLabels.length > 0 ? activeTopicLabels.map((topic) => `- ${topic}`).join("\n") : "_No candidate topics yet._"}

## Research Ideas

${ideaSection}

## Notes

${notesSection}
`;

    const baseName =
      selectedTopicLabels[0] || activeTopicLabels[0] || "atlas-brainstorm";
    const safeName = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const fileName = `${safeName || "atlas-brainstorm"}.md`;

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSavePage = async (content: string) => {
    if (!currentPage) return;

    try {
      const response = await fetch(`/api/notebook/pages/${currentPage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        const updatedPage = await response.json();
        setPages(pages.map((p) => (p.id === updatedPage.id ? updatedPage : p)));
        setCurrentPage(updatedPage);
      }
    } catch (error) {
      console.error("Failed to save page:", error);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    try {
      const response = await fetch(`/api/notebook/pages/${pageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setPages(pages.filter((p) => p.id !== pageId));
        if (currentPage?.id === pageId) {
          setCurrentPage(pages.find((p) => p.id !== pageId) || null);
        }
      }
    } catch (error) {
      console.error("Failed to delete page:", error);
    }
  };

  const handleSendMessage = async (message: string) => {
    setIsChatting(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/notebook/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: currentPage?.id,
          message,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages([...messages, data.userMessage, data.assistantMessage]);

        // Update suggested topics from chat response
        if (data.suggestedTopics && data.suggestedTopics.length > 0) {
          setSuggestedTopics(data.suggestedTopics);
          loadCandidates();
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsChatting(false);
    }
  };

  const handleSuggestedTopicClick = async (label: string) => {
    await handleAddCandidate(label);
  };

  const handleAddCandidate = async (label: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });

      if (response.ok) {
        const newCandidate = await response.json();
        setCandidates([...candidates, newCandidate]);
      }
    } catch (error) {
      console.error("Failed to add candidate:", error);
    }
  };

  const handleArchiveCandidate = async (candidateId: string) => {
    try {
      // For now, we'll just remove from local state
      // In a real implementation, you'd update the status via API
      setCandidates(candidates.filter((c) => c.id !== candidateId));
      setSelectedCandidates(
        selectedCandidates.filter((id) => id !== candidateId),
      );
    } catch (error) {
      console.error("Failed to archive candidate:", error);
    }
  };

  const handleConverge = async () => {
    if (selectedCandidates.length === 0) return;

    setIsLoading(true);
    try {
      const selectedLabels = candidates
        .filter((c) => selectedCandidates.includes(c.id))
        .map((c) => c.label);

      const response = await fetch(`/api/jobs/${jobId}/converge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTopics: selectedLabels }),
      });

      if (response.ok) {
        const data = await response.json();
        setTop3Ideas(data.ideas);
      }
    } catch (error) {
      console.error("Failed to converge:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Save last AI message to notes
  const handleSaveChatToNotes = () => {
    const lastAI = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAI) return;
    appendNote(jobId, {
      type: "insight",
      title: "Topic Copilot Insight",
      content: lastAI.content,
    });
    setSavedChat(true);
    setTimeout(() => setSavedChat(false), 2000);
  };

  return (
    <div className="flex h-full w-full">
      {/* Left Sidebar — Topics only */}
      <div className={`w-80 border-r flex flex-col ${shell}`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-zinc-800" : "border-gray-200"}`}>
          <span className={`text-sm font-semibold ${isDark ? "text-zinc-200" : "text-gray-800"}`}>
            Topics ({candidates.filter((c) => c.status === "active").length})
          </span>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <CandidateTopics
              candidates={candidates}
              selectedCandidates={selectedCandidates}
              onSelectionChange={setSelectedCandidates}
              onAddCandidate={handleAddCandidate}
              onArchiveCandidate={handleArchiveCandidate}
              isLoading={isLoading}
              theme={theme}
            />
          </div>

          {suggestedTopics.length > 0 && (
            <SuggestedTopics
              topics={suggestedTopics}
              onTopicClick={handleSuggestedTopicClick}
              theme={theme}
            />
          )}

          {/* Session notes mini-widget */}
          <div className={`border-t px-4 py-3 flex-shrink-0 ${isDark ? "border-zinc-800" : "border-gray-200"}`}>
            <div className={`rounded-xl p-3 ${isDark ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-indigo-50 border border-indigo-100"}`}>
              <p className="text-xs font-semibold text-indigo-500 mb-1">Session Notes</p>
              <p className={`text-xs ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                {noteCount} {noteCount === 1 ? "entry" : "entries"} saved
              </p>
              <p className={`text-xs mt-1 ${isDark ? "text-zinc-500" : "text-gray-400"}`}>
                See the <strong>Notes</strong> tab to view &amp; add
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main panel — Topic Copilot chat or Top 3 Ideas */}
      <div className={`flex-1 flex flex-col ${isDark ? "bg-zinc-950" : ""}`}>

        {/* ── Inline action toolbar (only in chat mode) ── */}
        {!top3Ideas && (
          <div className={`flex items-center justify-end gap-2 px-4 py-2 border-b flex-shrink-0 ${isDark ? "border-zinc-800 bg-zinc-900" : "border-gray-100 bg-white"}`}>
            {messages.some((m) => m.role === "assistant") && (
              <button
                onClick={handleSaveChatToNotes}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                style={{ background: savedChat ? "#567d5e" : "linear-gradient(to right, #455c68, #5f4e56)", color: "#fbf8f1" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {savedChat ? "✓ Saved" : "Save to Notes"}
              </button>
            )}
            {selectedCandidates.length > 0 && (
              <button
                onClick={handleConverge}
                disabled={isLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: "linear-gradient(to right, #455c68, #5f4e56)" }}
              >
                {isLoading ? (
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                {isLoading ? "Converging…" : `Converge (${selectedCandidates.length})`}
              </button>
            )}
            <button
              onClick={handleExportMarkdown}
              disabled={!hasExportableContent}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${isDark ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export .md
            </button>
            <Link
              href={`/job/${jobId}/paper`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              style={{ background: "linear-gradient(to right, #455c68, #5f4e56)", color: "#fbf8f1" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Write Paper
            </Link>
          </div>
        )}

        {/* ── Content area ── */}
        <div className="flex-1 overflow-hidden">
        {top3Ideas ? (
          <div
            className={`h-full overflow-y-auto p-4 ${isDark ? "bg-zinc-900" : isVibrant ? "bg-white/90" : "bg-white"}`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900">
                Top 3 Research Ideas
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!top3Ideas) return;
                    const content = top3Ideas.map((idea, i) =>
                      `### ${i + 1}. ${idea.title}\n**Problem:** ${idea.problem_to_solve}\n**Method:** ${idea.proposed_method.join("; ")}\n**Next Steps:** ${idea.next_3_steps.join("; ")}`
                    ).join("\n\n");
                    appendNote(jobId, {
                      type: "insight",
                      title: "Top 3 Research Ideas",
                      content,
                    });
                    setSavedInsight(true);
                    setTimeout(() => setSavedInsight(false), 2000);
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-opacity"
                  style={{ background: "linear-gradient(to right, #455c68, #5f4e56)", color: "#fbf8f1" }}
                >
                  {savedInsight ? "✓ Saved" : "Save to Notes"}
                </button>
                <button
                  onClick={handleExportMarkdown}
                  disabled={!hasExportableContent}
                  className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Export .md
                </button>
                <button
                  onClick={() => setTop3Ideas(null)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  ← Back to chat
                </button>
              </div>
            </div>

            {/* Write Paper CTA */}
            <Link
              href={`/job/${jobId}/paper`}
              className="flex items-center gap-3 mb-5 p-3 rounded-xl transition-all shadow-md"
              style={{ background: "linear-gradient(to right, #455c68, #5f4e56)", color: "#fbf8f1" }}
            >
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight">Write Paper with Atlas Plan</p>
                <p className="text-xs text-indigo-200 leading-tight">Draft a contribution, claims, and an outline</p>
              </div>
              <svg className="w-4 h-4 ml-auto flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <div className="space-y-4">
              {top3Ideas.map((idea, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {index + 1}. {idea.title}
                  </h4>

                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Field:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {idea.field_context.map((field, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="font-medium text-gray-700">
                        Problem:
                      </span>
                      <p className="text-gray-600 mt-1">
                        {idea.problem_to_solve}
                      </p>
                    </div>

                    <div>
                      <span className="font-medium text-gray-700">Method:</span>
                      <ul className="list-disc list-inside text-gray-600 mt-1">
                        {idea.proposed_method.map((method, i) => (
                          <li key={i}>{method}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <span className="font-medium text-gray-700">
                        Next Steps:
                      </span>
                      <ol className="list-decimal list-inside text-gray-600 mt-1">
                        {idea.next_3_steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    {(idea.citations.papers.length > 0 ||
                      idea.citations.datasets.length > 0) && (
                      <div>
                        <span className="font-medium text-gray-700">
                          Sources:
                        </span>
                        <div className="mt-1 space-y-1">
                          {idea.citations.papers.length > 0 && (
                            <div className="text-xs text-gray-600">
                              Papers: {idea.citations.papers.join(", ")}
                            </div>
                          )}
                          {idea.citations.datasets.length > 0 && (
                            <div className="text-xs text-gray-600">
                              Datasets: {idea.citations.datasets.join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isChatting}
            theme={theme}
          />
        )}
        </div>
      </div>
    </div>
  );
}
