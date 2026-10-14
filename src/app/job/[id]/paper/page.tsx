"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import AtlasPlan from "@/components/AtlasPlan";
import AssistantChat from "@/components/AssistantChat";
import ExperimentsPanel from "@/components/ExperimentsPanel";
import NotesPanel from "@/components/NotesPanel";
import PaperMapPicker from "@/components/PaperMapPicker";
import PaperQuizPanel from "@/components/PaperQuizPanel";
import { REL_COLOR, REL_FALLBACK, TIER_COLOR } from "@/components/PaperMap";
import InkSeal from "@/components/ink/InkSeal";
import { resolveStep, STEPS, type Step } from "./steps";

interface ResearchIdea {
  title: string;
  problem_to_solve: string;
  proposed_method: string[];
  next_3_steps: string[];
  field_context: string[];
}

import { Suspense } from "react";

function PaperPipelineInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const jobId = params.id as string;

  const urlStep = resolveStep(searchParams.get("step"));
  // Server and first client render must match — always start from the URL (or "setup").
  // The cached step is applied after mount in the effect below to avoid SSR hydration mismatch.
  const [step, setStep] = useState<Step>(urlStep ?? "setup");

  // Restore last visited step from cache after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (urlStep) return;
    try {
      const s = resolveStep(localStorage.getItem(`paper-step:${jobId}`));
      if (s) setStep(s);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Persist step only on page unload (refresh/close) — writing during mount races
  // with the restore effect under React StrictMode's double effect invocation.
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);
  const [experimentMessages, setExperimentMessages] = useState<{ role: string; content: string }[]>([]);
  const [topicQuery, setTopicQuery] = useState("");
  const [ideas, setIdeas] = useState<ResearchIdea[]>([]);
  const [ideasSource, setIdeasSource] = useState<"loading" | "converged" | "tree" | "topic">("loading");
  const [selectedIdeaIndex, setSelectedIdeaIndex] = useState(0);
  const [exportContext, setExportContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [referenceDoc, setReferenceDoc] = useState<{ name: string; content: string } | null>(null);
  const [refDocExpanded, setRefDocExpanded] = useState(false);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch latest papers section
  interface FetchedPaper {
    id: string; title: string; authors: string[]; venue: string;
    year: string; abstract: string; url: string; source: "openalex" | "pubmed" | "map";
    mapTier?: string;
  }
  const [paperSearchDesc, setPaperSearchDesc] = useState("");
  const [paperResults, setPaperResults] = useState<FetchedPaper[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [paperSearchDone, setPaperSearchDone] = useState(false);

  // Paper map import
  interface MapNode {
    id: string; title: string; url: string | null; venue: string | null;
    authors: string[]; snippet: string | null; publishedAt: string | null;
    reliabilityTier: string;
  }
  interface MapLink {
    source: string; target: string;
    relationships: { type: string; sharedAuthors: string[]; count: number }[];
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mapNodes, setMapNodes] = useState<MapNode[]>([]);
  const [mapLinks, setMapLinks] = useState<MapLink[]>([]);

  // Load paper map data (nodes + typed relationships) while on the setup step
  useEffect(() => {
    if (step !== "setup") return;
    fetch(`/api/jobs/${jobId}/paper-map`)
      .then((r) => r.json())
      .then((d) => {
        setMapNodes(Array.isArray(d.nodes) ? d.nodes : []);
        setMapLinks(Array.isArray(d.links) ? d.links : []);
      })
      .catch(() => {});
  }, [step, jobId]);

  // Persist the session paper list on unload, alongside the step (see stepRef above)
  const paperResultsRef = useRef(paperResults);
  useEffect(() => { paperResultsRef.current = paperResults; }, [paperResults]);
  useEffect(() => {
    const save = () => {
      try {
        if (paperResultsRef.current.length > 0) {
          localStorage.setItem(`paper-results:${jobId}`, JSON.stringify(paperResultsRef.current));
        }
      } catch {}
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [jobId]);

  // Persist reference doc in localStorage per job
  useEffect(() => {
    const saved = localStorage.getItem(`ref-doc:${jobId}`);
    if (saved) { try { setReferenceDoc(JSON.parse(saved)); } catch {} }
  }, [jobId]);

  // Restore generated paper artifacts + idea selection from cache on refresh
  useEffect(() => {
    try {
      const cachedContext = localStorage.getItem(`paper-context:${jobId}`);
      if (cachedContext) setExportContext(cachedContext);
      const cachedIndex = localStorage.getItem(`paper-selected-idea:${jobId}`);
      if (cachedIndex !== null) setSelectedIdeaIndex(Number(cachedIndex));
      const cachedPapers = localStorage.getItem(`paper-results:${jobId}`);
      if (cachedPapers) {
        const parsed = JSON.parse(cachedPapers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPaperResults(parsed);
          setPaperSearchDone(true);
        }
      }
    } catch {}
  }, [jobId]);

  const handleRefDocLoad = (name: string, content: string) => {
    const doc = { name, content };
    setReferenceDoc(doc);
    setRefDocExpanded(true);
    localStorage.setItem(`ref-doc:${jobId}`, JSON.stringify(doc));
  };

  const handleRefDocClear = () => {
    setReferenceDoc(null);
    setRefDocExpanded(false);
    localStorage.removeItem(`ref-doc:${jobId}`);
  };

  const handleFetchPapers = async () => {
    const desc = paperSearchDesc.trim();
    if (!desc) return;
    setLoadingPapers(true);
    setPaperSearchDone(false);
    try {
      const res = await fetch(`/api/jobs/${jobId}/search-papers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
      const data = await res.json();
      setPaperResults(data.papers ?? []);
      setPaperSearchDone(true);
    } catch {
      setPaperResults([]);
      setPaperSearchDone(true);
    } finally {
      setLoadingPapers(false);
    }
  };

  const handleImportFromMap = (ids: string[]) => {
    const existingIds = new Set(paperResults.map((p) => p.id));
    const existingTitles = new Set(paperResults.map((p) => p.title.trim().toLowerCase()));
    const imported: FetchedPaper[] = [];
    for (const id of ids) {
      const node = mapNodes.find((n) => n.id === id);
      if (!node) continue;
      const titleKey = node.title.trim().toLowerCase();
      if (existingIds.has(id) || existingTitles.has(titleKey)) continue;
      imported.push({
        id: node.id,
        title: node.title,
        authors: node.authors ?? [],
        venue: node.venue ?? "",
        year: node.publishedAt ? String(new Date(node.publishedAt).getFullYear()) : "",
        abstract: node.snippet ?? "",
        url: node.url ?? "",
        source: "map",
        mapTier: node.reliabilityTier,
      });
    }
    if (imported.length > 0) {
      setPaperResults((prev) => [...prev, ...imported]);
      setPaperSearchDone(true);
    }
    setPickerOpen(false);
  };

  // Typed paper-map relationships between a paper and other papers in this session's list
  const relationshipsFor = (paper: FetchedPaper) => {
    const out: { type: string; other: FetchedPaper }[] = [];
    for (const l of mapLinks) {
      const otherId = l.source === paper.id ? l.target : l.target === paper.id ? l.source : null;
      if (!otherId) continue;
      const other = paperResults.find((p) => p.id === otherId);
      if (!other) continue;
      for (const r of l.relationships) out.push({ type: r.type, other });
    }
    return out;
  };

  const handleRefFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleRefDocLoad(file.name, ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = "";
  };

  useEffect(() => {
    const load = async () => {
      const [jobRes, convergeRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}`).then((r) => r.json()),
        fetch(`/api/jobs/${jobId}/converge`).then((r) => r.json()).catch(() => ({ ideas: [] })),
      ]);

      setTopicQuery(jobRes.topicQuery ?? "");
      setPaperSearchDesc((prev) => prev || jobRes.topicQuery || "");
      const convergedIdeas: ResearchIdea[] = convergeRes.ideas ?? [];

      if (convergedIdeas.length > 0) {
        setIdeas(convergedIdeas);
        setIdeasSource("converged");
        return;
      }

      // Fall back to knowledge tree child nodes
      if (jobRes.rootNodeId) {
        try {
          const nodeRes = await fetch(`/api/nodes/${jobRes.rootNodeId}`).then((r) => r.json());
          if (nodeRes.children && nodeRes.children.length > 0) {
            const treeIdeas: ResearchIdea[] = nodeRes.children.map((child: { label: string; summary?: string }) => ({
              title: child.label,
              problem_to_solve: child.summary || `Exploring ${child.label} in the context of ${jobRes.topicQuery}`,
              proposed_method: ["Literature review", "Evidence synthesis", "Critical analysis"],
              next_3_steps: [
                "Define the core research question",
                "Survey and synthesize the evidence",
                "Structure the paper argument",
              ],
              field_context: [],
            }));
            setIdeas(treeIdeas);
            setIdeasSource("tree");
            return;
          }
        } catch {}
      }

      // Last resort: use the job topic itself
      setIdeas([{
        title: jobRes.topicQuery,
        problem_to_solve: `A focused research paper examining the key questions and evidence around "${jobRes.topicQuery}".`,
        proposed_method: ["Systematic literature review", "Evidence synthesis", "Critical analysis"],
        next_3_steps: [
          "Define the core research question",
          "Survey the evidence base",
          "Structure the paper argument",
        ],
        field_context: [],
      }]);
      setIdeasSource("topic");
    };

    load().catch(console.error);
  }, [jobId]);

  const generateContext = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/paper-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "context" }),
      });
      const data = await res.json();
      setExportContext(data.exportContext ?? "");
      try { if (data.exportContext) localStorage.setItem(`paper-context:${jobId}`, data.exportContext); } catch {}
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const idea = ideas[selectedIdeaIndex];

  return (
    <div className="min-h-screen ink-paper">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/job/${jobId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Link>
            <span className="text-gray-200">|</span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #587380, #5f4e56)" }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-semibold text-gray-800 text-sm">Paper Pipeline</span>
            </div>
            <span className="text-gray-200">|</span>
            <Link
              href={`/job/${jobId}?tab=knowledge`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200"
            >
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Knowledge Tree
            </Link>
            <Link
              href={`/job/${jobId}?tab=notebook`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200"
            >
              <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Ideas & Notebook
            </Link>
          </div>
          <p className="text-xs text-gray-400 truncate max-w-xs">{topicQuery}</p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Step tabs + Quiz button */}
        <div className="flex items-center justify-between mb-8">
          <nav className="flex items-center gap-2" aria-label="Paper pipeline steps">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                {i > 0 && <div className="ink-divider w-10" aria-hidden />}
                <button
                  onClick={() => setStep(s.id)}
                  aria-current={step === s.id ? "step" : undefined}
                  className={`flex items-center gap-2 px-2 py-1 transition-opacity ${
                    step === s.id ? "opacity-100" : "opacity-55 hover:opacity-90"
                  }`}
                >
                  <InkSeal text={String(i + 1)} size={30} className={step === s.id ? "" : "grayscale"} />
                  <span className={`font-display text-lg ${step === s.id ? "text-gray-900 font-semibold" : "text-gray-600"}`}>
                    {s.label}
                  </span>
                </button>
              </div>
            ))}
          </nav>
          <PaperQuizPanel jobId={jobId} idea={idea ?? null} inline />
        </div>

        {/* ─── Step 1: Setup — pick the idea and collect papers ─── */}
        {step === "setup" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Select Your Paper Topic</h2>
                <p className="text-sm text-gray-500 mb-3">
                  {ideasSource === "converged"
                    ? "Choose one of your AI-generated research ideas. All context from this job will be imported automatically."
                    : ideasSource === "tree"
                    ? "Showing topics from your knowledge tree — pick one to focus your paper on."
                    : ideasSource === "topic"
                    ? "Using your research topic directly as the paper focus."
                    : "Loading topics…"}
                </p>

                {/* Banner when not using converged ideas */}
                {(ideasSource === "tree" || ideasSource === "topic") && (
                  <div className="mb-4 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      For richer, AI-generated paper ideas, open the{" "}
                      <Link href={`/job/${jobId}?tab=notebook`} className="font-semibold underline">
                        Notebook tab
                      </Link>{" "}
                      and run <strong>Converge to Top 3</strong>. You can still write a great paper with any topic below.
                    </span>
                  </div>
                )}

                {ideasSource === "loading" ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-gray-400">
                    <div className="animate-spin h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full" />
                    Loading topics…
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ideas.map((idea, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedIdeaIndex(i);
                          try { localStorage.setItem(`paper-selected-idea:${jobId}`, String(i)); } catch {}
                        }}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                          selectedIdeaIndex === i
                            ? "border-indigo-400 bg-indigo-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                              selectedIdeaIndex === i
                                ? "bg-indigo-600 text-white"
                                : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{idea.title}</p>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{idea.problem_to_solve}</p>
                            {idea.field_context.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {idea.field_context.map((f, fi) => (
                                  <span key={fi} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                    {f}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {idea && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3">Selected Idea Details</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Problem</p>
                      <p className="text-gray-700">{idea.problem_to_solve}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Methods</p>
                      <ul className="space-y-0.5">
                        {idea.proposed_method.map((m, mi) => (
                          <li key={mi} className="flex gap-2 text-gray-700">
                            <span className="text-indigo-400">•</span> {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Next Steps</p>
                      <ol className="space-y-0.5 list-decimal list-inside text-gray-700">
                        {idea.next_3_steps.map((s, si) => (
                          <li key={si}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {/* Collect papers — merged into Setup in #64, and passed to Atlas Plan as sources */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              {/* Header */}
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Collect Papers</h2>
                  <p className="text-sm text-gray-500">
                    Search OpenAlex and PubMed, or import from your Paper Map. Atlas Plan cites and checks claims against every paper collected here.
                  </p>
                </div>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors"
                  title="Pick papers from your paper map — they keep their map relationships"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Import from Paper Map
                </button>
              </div>

              {/* Search box */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Search description
                </label>
                <textarea
                  value={paperSearchDesc}
                  onChange={(e) => setPaperSearchDesc(e.target.value)}
                  rows={3}
                  placeholder="e.g. Recent advances in CRISPR gene editing for therapeutic applications in human disease"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-sky-300 text-gray-800 placeholder-gray-400 leading-relaxed"
                />
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-gray-400">Edit to 1–3 sentences for best results</p>
                  <button
                    onClick={handleFetchPapers}
                    disabled={loadingPapers || !paperSearchDesc.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                    style={{ background: "linear-gradient(to right, #4c777c, #587380)" }}
                  >
                    {loadingPapers ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        Searching…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Explore Papers
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Results */}
              {paperSearchDone && paperResults.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium">No papers found</p>
                  <p className="text-xs mt-1">Try rephrasing your description with different keywords</p>
                </div>
              )}

              {paperResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {paperResults.length} papers collected
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> OpenAlex
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> PubMed
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Paper Map
                      </span>
                    </div>
                  </div>
                  {paperResults.map((paper) => (
                    <div key={paper.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-0.5">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                            paper.source === "openalex" ? "bg-blue-400" : paper.source === "pubmed" ? "bg-emerald-400" : "bg-violet-500"
                          }`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <a
                            href={paper.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-gray-900 hover:text-indigo-700 transition-colors leading-snug"
                          >
                            {paper.title}
                          </a>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                            {paper.year && (
                              <span className="text-xs font-medium text-gray-500">{paper.year}</span>
                            )}
                            {paper.mapTier && (TIER_COLOR[paper.mapTier] ?? { label: null }).label && (
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{
                                  background: (TIER_COLOR[paper.mapTier]?.fill ?? "#76626b") + "22",
                                  color: TIER_COLOR[paper.mapTier]?.fill ?? "#76626b",
                                }}
                              >
                                {(TIER_COLOR[paper.mapTier] ?? { label: paper.mapTier }).label}
                              </span>
                            )}
                            {paper.venue && (
                              <span className="text-xs text-gray-400 italic truncate max-w-xs">{paper.venue}</span>
                            )}
                            {paper.authors.length > 0 && (
                              <span className="text-xs text-gray-400">
                                {paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}
                              </span>
                            )}
                          </div>
                          {paper.abstract && (
                            <p className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-3">
                              {paper.abstract}
                            </p>
                          )}
                          {relationshipsFor(paper).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {relationshipsFor(paper).map((rel, i) => {
                                const style = REL_COLOR[rel.type] ?? REL_FALLBACK;
                                return (
                                  <span
                                    key={i}
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: style.color + "1f", color: style.color }}
                                    title={rel.other.title}
                                  >
                                    {style.label} · {rel.other.title.slice(0, 30)}{rel.other.title.length > 30 ? "…" : ""}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <a
                          href={paper.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-indigo-50 text-gray-300 hover:text-indigo-500 transition-colors"
                          title="Open paper"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>

            {/* Right column: actions */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm lg:sticky lg:top-6">
                <h3 className="font-semibold text-gray-900 mb-2">Next</h3>
                {idea && (
                  <div className="mb-3 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-100">
                    <p className="text-xs text-indigo-500 font-medium">Selected idea</p>
                    <p className="text-xs text-indigo-800 font-semibold mt-0.5 leading-tight">{idea.title}</p>
                  </div>
                )}
                <p className="mb-3 text-xs text-gray-500">
                  {paperResults.length > 0
                    ? `${paperResults.length} paper${paperResults.length === 1 ? "" : "s"} collected — Atlas Plan will use them alongside this job's peer-reviewed sources.`
                    : "No papers collected yet. Atlas Plan will use this job's peer-reviewed sources."}
                </p>
                <button
                  onClick={() => setStep("plan")}
                  disabled={ideasSource === "loading" || ideas.length === 0}
                  className="w-full py-3 px-4 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Plan with this idea
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 2: Atlas Plan + Atlas Assistant ─── */}
        {step === "plan" && (
          <div className="flex flex-col xl:flex-row gap-6 h-[calc(100vh-220px)] min-h-[520px]">
            {/* Atlas Plan */}
            <div className="flex-1 min-w-0 min-h-[420px] xl:min-h-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <AtlasPlan
                key={selectedIdeaIndex}
                jobId={jobId}
                topicQuery={topicQuery}
                selectedIdea={idea}
                referenceDoc={referenceDoc ?? undefined}
                extraSources={paperResults.map((p) => ({ title: p.title, snippet: p.abstract || null }))}
              />
            </div>

            {/* Atlas Assistant chat (Groq, note-taking) */}
            <div className="flex-1 min-w-0 min-h-[420px] xl:min-h-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <AssistantChat jobId={jobId} selectedIdea={idea ?? undefined} />
            </div>

            {/* Right sidebar: context export */}
            <div className="w-full xl:w-72 flex-shrink-0 space-y-4">
              <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #5f4e56, #384a54)", color: "#fbf8f1" }}>
                <h3 className="font-bold mb-1 text-sm">Two agents, one paper</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#d6c9cf" }}>
                  <strong>Atlas Plan</strong> (left) drafts a contribution statement, claims, and an
                  outline from your evidence. <strong>Atlas Assistant</strong> (middle) is grounded in
                  your session evidence, answers questions, and saves key replies to your notes.
                </p>
              </div>

              {/* Reference Document panel */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setRefDocExpanded((v) => !v)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-700">Reference Doc</span>
                    {referenceDoc && (
                      <span className="text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full truncate max-w-[100px]">
                        {referenceDoc.name}
                      </span>
                    )}
                  </div>
                  <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${refDocExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {refDocExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
                    {referenceDoc ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {referenceDoc.content.split("\n").length} lines · {Math.round(referenceDoc.content.length / 5)} words
                          </span>
                          <button onClick={handleRefDocClear} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                            Remove
                          </button>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 max-h-32 overflow-y-auto">
                          <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-mono">
                            {referenceDoc.content.slice(0, 600)}{referenceDoc.content.length > 600 ? "\n…" : ""}
                          </pre>
                        </div>
                        <p className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2 leading-relaxed">
                          Claude can see this document. Ask about it in the chat — e.g. "Based on my reference doc, what should the introduction argue?"
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          Upload a previous draft, notes, or any <code className="font-mono bg-gray-100 px-1 rounded">.md</code> file to reference during planning.
                        </p>
                        <input
                          ref={refFileInputRef}
                          type="file"
                          accept=".md,.txt"
                          className="hidden"
                          onChange={handleRefFileUpload}
                        />
                        <button
                          onClick={() => refFileInputRef.current?.click()}
                          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Upload .md file
                        </button>
                        <textarea
                          placeholder="…or paste content here"
                          rows={3}
                          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400 text-gray-700 placeholder-gray-400"
                          onBlur={(e) => {
                            if (e.target.value.trim()) handleRefDocLoad("pasted-notes.md", e.target.value.trim());
                          }}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                <p className="text-sm font-semibold text-gray-800">Export context</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Export your research context as plain Markdown — paste it into any editor or agent
                  you use for writing.
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      if (!exportContext) generateContext();
                      else copyToClipboard(exportContext);
                    }}
                    disabled={loading}
                    className="w-full py-2 px-3 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {loading ? (
                      <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                    {copied ? "Copied!" : exportContext ? "Copy Context" : "Generate & Copy"}
                  </button>
                  {exportContext && (
                    <button
                      onClick={() => downloadFile(exportContext, "research-context.md")}
                      className="w-full py-2 px-3 border border-gray-300 text-gray-700 rounded-lg text-xs hover:bg-gray-50"
                    >
                      Download .md
                    </button>
                  )}
                </div>
              </div>

              {/* Quick navigation back to research */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-700 mb-2">Return to research</p>
                <div className="space-y-1.5">
                  <Link
                    href={`/job/${jobId}?tab=knowledge`}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Knowledge Tree
                  </Link>
                  <Link
                    href={`/job/${jobId}?tab=notebook`}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Ideas & Notebook
                  </Link>
                  <Link
                    href={`/job/${jobId}?tab=papermap`}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Paper Map
                  </Link>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ─── Step 3: Experiments — plan chat + claims verification ─── */}
        {step === "experiments" && (
          <div className="flex flex-col xl:flex-row gap-6 h-[calc(100vh-220px)] min-h-[520px]">
            <div className="flex-1 min-w-0 min-h-[420px] xl:min-h-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <AssistantChat
                key={selectedIdeaIndex}
                jobId={jobId}
                selectedIdea={idea ?? undefined}
                persona="experiment"
                storageKey={`experiment-chat:${jobId}`}
                welcome={{
                  role: "assistant",
                  content:
                    "I'm your experiment designer. Tell me which idea we're testing (or use the selected one above), and I'll turn it into a concrete plan: hypothesis, variables, baselines from the mapped papers, metrics with equations, and expected results with numbers you can verify.\n\nMath renders in LaTeX — try asking for a metric like $F_1 = 2\\frac{pr}{p+r}$.",
                }}
                onMessagesChange={(msgs) => setExperimentMessages(msgs)}
              />
            </div>

            <div className="w-full xl:w-80 flex-shrink-0 space-y-4">
              <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #5f4e56, #455c68)", color: "#fbf8f1" }}>
                <h3 className="font-bold mb-1 text-sm">Experiments, verified</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#d6c9cf" }}>
                  Plan the experiment with the assistant, then run{" "}
                  <strong>Verify plan</strong> to re-evaluate every quantitative claim in the
                  plan — sample sizes, expected gains, metric math — with mathjs.
                </p>
              </div>
              <ExperimentsPanel jobId={jobId} messages={experimentMessages} />
            </div>
          </div>
        )}
      </div>

      <NotesPanel jobId={jobId} topic={topicQuery} />

      {pickerOpen && (
        <PaperMapPicker jobId={jobId} onClose={() => setPickerOpen(false)} onImport={handleImportFromMap} />
      )}
    </div>
  );
}

export default function PaperPipelinePage() {
  return (
    <Suspense fallback={null}>
      <PaperPipelineInner />
    </Suspense>
  );
}
