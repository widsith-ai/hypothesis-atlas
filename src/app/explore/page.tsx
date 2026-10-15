"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import WordCloudComponent from "@/components/WordCloud";
import SubscribeModal from "@/components/SubscribeModal";
import InkSeal from "@/components/ink/InkSeal";

const DOMAIN_TERMS = {
  bio: [
    { text: "neural implant stability", value: 100 },
    { text: "CRISPR-Cas9", value: 96 },
    { text: "mRNA vaccines", value: 94 },
    { text: "gene editing", value: 93 },
    { text: "brain-computer interface", value: 92 },
    { text: "AI drug discovery", value: 91 },
    { text: "single-cell RNA-seq", value: 90 },
    { text: "AlphaFold", value: 90 },
    { text: "organoids", value: 82 },
    { text: "tissue engineering", value: 83 },
    { text: "metagenomics", value: 83 },
    { text: "optogenetics", value: 78 },
    { text: "nanomedicine", value: 85 },
    { text: "immunotherapy", value: 87 },
    { text: "liquid biopsy", value: 85 },
    { text: "spatial transcriptomics", value: 88 },
    { text: "systems biology", value: 82 },
    { text: "digital pathology", value: 79 },
    { text: "organ-on-chip", value: 87 },
    { text: "3D bioprinting", value: 86 },
  ],
  chemistry: [
    { text: "catalytic mechanisms", value: 100 },
    { text: "polymer synthesis", value: 96 },
    { text: "quantum chemistry", value: 94 },
    { text: "molecular dynamics", value: 93 },
    { text: "green chemistry", value: 92 },
    { text: "nanomaterials", value: 91 },
    { text: "electrochemical cells", value: 90 },
    { text: "crystallography", value: 90 },
    { text: "supramolecular chemistry", value: 82 },
    { text: "photochemistry", value: 83 },
    { text: "computational chemistry", value: 83 },
    { text: "organic synthesis", value: 78 },
    { text: "materials science", value: 85 },
    { text: "chemical engineering", value: 87 },
    { text: "analytical chemistry", value: 85 },
    { text: "spectroscopy", value: 88 },
    { text: "thermodynamics", value: 82 },
    { text: "kinetics", value: 79 },
    { text: "surface chemistry", value: 87 },
    { text: "biochemistry", value: 86 },
  ],
  tech: [
    { text: "machine learning", value: 100 },
    { text: "neural networks", value: 96 },
    { text: "quantum computing", value: 94 },
    { text: "blockchain technology", value: 93 },
    { text: "cybersecurity", value: 92 },
    { text: "cloud computing", value: 91 },
    { text: "edge computing", value: 90 },
    { text: "Internet of Things", value: 90 },
    { text: "artificial intelligence", value: 82 },
    { text: "data science", value: 83 },
    { text: "software engineering", value: 83 },
    { text: "computer vision", value: 78 },
    { text: "natural language processing", value: 85 },
    { text: "robotics", value: 87 },
    { text: "autonomous systems", value: 85 },
    { text: "distributed systems", value: 88 },
    { text: "microservices", value: 82 },
    { text: "devops", value: 79 },
    { text: "containerization", value: 87 },
    { text: "serverless computing", value: 86 },
  ],
  finance: [
    { text: "algorithmic trading", value: 100 },
    { text: "cryptocurrency", value: 96 },
    { text: "financial modeling", value: 94 },
    { text: "risk management", value: 93 },
    { text: "portfolio optimization", value: 92 },
    { text: "quantitative finance", value: 91 },
    { text: "market microstructure", value: 90 },
    { text: "behavioral finance", value: 90 },
    { text: "derivatives pricing", value: 82 },
    { text: "credit scoring", value: 83 },
    { text: "fraud detection", value: 83 },
    { text: "financial technology", value: 78 },
    { text: "high-frequency trading", value: 85 },
    { text: "asset management", value: 87 },
    { text: "investment strategies", value: 85 },
    { text: "financial analytics", value: 88 },
    { text: "regulatory compliance", value: 82 },
    { text: "blockchain finance", value: 79 },
    { text: "digital payments", value: 87 },
    { text: "robo-advisors", value: 86 },
  ],
  general: [
    { text: "artificial intelligence", value: 100 },
    { text: "climate change", value: 97 },
    { text: "quantum computing", value: 95 },
    { text: "gene therapy", value: 93 },
    { text: "large language models", value: 92 },
    { text: "renewable energy", value: 91 },
    { text: "brain-computer interface", value: 90 },
    { text: "CRISPR gene editing", value: 89 },
    { text: "autonomous vehicles", value: 88 },
    { text: "synthetic biology", value: 87 },
    { text: "space exploration", value: 86 },
    { text: "microbiome research", value: 85 },
    { text: "nuclear fusion", value: 84 },
    { text: "drug discovery AI", value: 83 },
    { text: "social media algorithms", value: 82 },
    { text: "materials science", value: 81 },
    { text: "precision medicine", value: 80 },
    { text: "robotics automation", value: 79 },
    { text: "digital twins", value: 78 },
    { text: "carbon capture", value: 77 },
  ],
};

type Domain = keyof typeof DOMAIN_TERMS;
type Theme = "dark" | "light" | "vibrant";

const DOMAIN_META: Record<Domain, { label: string; subtitle: string; emoji: string }> = {
  general:   { label: "General",   subtitle: "Cross-domain exploration",               emoji: "🌐" },
  bio:       { label: "Biology",   subtitle: "Genomics, biotech, and health research",  emoji: "🧬" },
  chemistry: { label: "Chemistry", subtitle: "Materials, synthesis, and molecular science", emoji: "⚗️" },
  tech:      { label: "Technology",subtitle: "AI, systems, and software innovation",    emoji: "💻" },
  finance:   { label: "Finance",   subtitle: "Markets, risk, and quantitative strategies", emoji: "📈" },
};

const BRAND_ICON =
  "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1";

const NAV_ITEMS: { href: string; label: string; icon: string; iconClass: string }[] = [
  {
    href: "/jobs",
    label: "My Research",
    icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
    iconClass: "text-amber-500",
  },
  {
    href: "/graph",
    label: "Research Graph",
    icon: BRAND_ICON,
    iconClass: "text-cyan-500",
  },
  {
    href: "/review",
    label: "Peer Review",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    iconClass: "text-emerald-500",
  },
  {
    href: "/graveyard",
    label: "Graveyard",
    icon: "M19 21V8a2 2 0 00-2-2h-1V5a2 2 0 00-2-2H10a2 2 0 00-2 2v1H7a2 2 0 00-2 2v13h14zM9 9h6M9 13h6",
    iconClass: "text-zinc-500",
  },
  {
    href: "/docs",
    label: "Docs",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5H4v15h3.5c1.746 0 3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5H20v15h-3.5c-1.746 0-3.332.477-4.5 1.253",
    iconClass: "text-zinc-500",
  },
];

const THEME_STYLES = {
  dark: {
    mainBg: "ink-night",
    text: "text-white",
    subText: "text-zinc-400",
    navLink: "text-zinc-300 hover:bg-zinc-800/80 hover:text-white",
    navBorder: "border-zinc-800",
    banner: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    panel: "bg-zinc-900/80 border border-zinc-700",
    card: "bg-zinc-900 border border-zinc-700 hover:border-indigo-400/60",
    cardActive: "bg-indigo-500/15 border-indigo-400 text-white",
    cardMuted: "text-zinc-400",
    cloud: "bg-zinc-900/70 border border-zinc-700",
    futureButton: "bg-zinc-800/70 border border-zinc-600 text-zinc-300 cursor-not-allowed",
    headingPlate: "inline-flex",
    heading: "text-zinc-100",
    toggleTrackOff: "bg-zinc-700",
    toggleTrackOn: "bg-indigo-500",
    subscribeCard: "bg-indigo-500/10 border-indigo-500/40 text-zinc-100",
  },
  light: {
    mainBg: "ink-paper",
    text: "text-zinc-900",
    subText: "text-zinc-600",
    navLink: "text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900",
    navBorder: "border-gray-200",
    banner: "border-amber-200 bg-amber-50 text-amber-900",
    panel: "bg-white/90 border border-gray-200/70",
    card: "bg-white border border-gray-200 hover:border-blue-300",
    cardActive: "bg-blue-50 border-blue-500 text-zinc-900",
    cardMuted: "text-zinc-600",
    cloud: "bg-white/90 border border-gray-200/50",
    futureButton: "bg-white border border-slate-300 text-slate-700 cursor-not-allowed",
    headingPlate: "inline-flex",
    heading: "text-zinc-900",
    toggleTrackOff: "bg-gray-300",
    toggleTrackOn: "bg-indigo-500",
    subscribeCard: "bg-indigo-50 border-indigo-200 text-gray-900",
  },
  vibrant: {
    mainBg: "ink-jade",
    text: "text-zinc-900",
    subText: "text-zinc-600",
    navLink: "text-zinc-600 hover:bg-white/80 hover:text-zinc-900",
    navBorder: "border-teal-700/20",
    banner: "border-amber-300 bg-white/70 text-amber-900",
    panel: "bg-white/80 border border-teal-700/20",
    card: "bg-white border border-zinc-200 hover:border-teal-600/50",
    cardActive: "bg-teal-50 border-teal-600 text-zinc-900",
    cardMuted: "text-zinc-600",
    cloud: "bg-white/85 border border-zinc-200",
    futureButton: "bg-white/90 border border-teal-700/30 text-zinc-700 cursor-not-allowed",
    headingPlate: "inline-flex",
    heading: "text-teal-900",
    toggleTrackOff: "bg-gray-300",
    toggleTrackOn: "bg-indigo-500",
    subscribeCard: "bg-indigo-50 border-indigo-200 text-zinc-900",
  },
} as const;

export default function ExplorePage() {
  const router = useRouter();
  const [isLoading, setIsLoading]         = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<Domain>("general");
  const [theme, setTheme]                 = useState<Theme>("light");
  const [lastJobId, setLastJobId]         = useState<string | null>(null);
  const [customTopic, setCustomTopic]     = useState("");
  const [topicError, setTopicError]       = useState("");
  const [centerWord, setCenterWord]       = useState<string | undefined>(undefined);

  // Explore mode
  const [exploreMode, setExploreMode]     = useState(false);
  const [exploreTopic, setExploreTopic]   = useState<string | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);

  useEffect(() => {
    setLastJobId(localStorage.getItem("lastJobId"));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved && ["dark", "light", "vibrant"].includes(saved)) setTheme(saved);
  }, []);

  useEffect(() => {
    setCenterWord(undefined);
  }, [selectedDomain]);

  // Reset explore selection when mode is turned off
  useEffect(() => {
    if (!exploreMode) setExploreTopic(null);
  }, [exploreMode]);

  const t = THEME_STYLES[theme];

  const handleSearchTopic = () => {
    const words = customTopic.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) {
      setTopicError("Please enter between 2 and 5 words.");
      return;
    }
    setTopicError("");
    setCenterWord(customTopic.trim());
    if (exploreMode) {
      setExploreTopic(customTopic.trim());
    }
  };

  // Paper upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleUploadPaper = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/jobs/upload", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok || !data.jobId) {
        setUploadError(data.error ?? "Upload failed — please try again.");
        return;
      }
      localStorage.setItem("lastJobId", data.jobId);
      router.push(`/job/${data.jobId}`);
    } catch (error) {
      console.error("Error uploading paper:", error);
      setUploadError("Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleWordClick = async (word: string) => {
    if (exploreMode) {
      setExploreTopic(word);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicQuery: word }),
      });
      const data = await response.json();
      if (data.jobId) {
        localStorage.setItem("lastJobId", data.jobId);
        router.push(`/job/${data.jobId}`);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error creating job:", error);
      setIsLoading(false);
    }
  };

  return (
    <main className={`min-h-screen ${t.mainBg} ${t.text} transition-all duration-500`}>
      <div className="container mx-auto px-4 py-10">
        {/* Quiet global nav — the word cloud below is the page's real CTA,
            so navigation recedes: one consistent ghost style, color only in the icons. */}
        <nav className={`-mx-4 mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 pb-4 ${t.navBorder}`}>
          <Link href="/" className="flex items-center gap-2.5" title="Home">
            <InkSeal text="HA" size={28} />
            <span className={`font-display text-2xl font-semibold tracking-tight ${t.text}`}>Hypothesis Atlas</span>
          </Link>
          <div className="flex flex-wrap items-center gap-1">
            {lastJobId && (
              <Link
                href={`/job/${lastJobId}/paper`}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${t.navLink}`}
                title="Write Paper"
              >
                <svg className="h-4 w-4 flex-shrink-0 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">Write Paper</span>
              </Link>
            )}
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${t.navLink}`}
                title={item.label}
              >
                <svg className={`h-4 w-4 flex-shrink-0 ${item.iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        {/* Page identity */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className={t.headingPlate}>
              <h1 className={`text-5xl font-semibold ${t.heading}`}>Topic Explorer</h1>
            </div>
            <p className={`${t.subText} mt-3`}>
              {exploreMode
                ? "Explore mode: click a topic to subscribe to weekly papers."
                : "Click a topic to launch an evidence-mapping run."}
            </p>
          </div>
          <Link
            href="/bold-idea"
            className="flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, #a87732, #9c3a26)" }}
            title="Type any research idea, in your own words — no word cloud required"
          >
            <span>✨</span>
            Try Something Bold
          </Link>
        </div>

        <div className={`rounded-3xl p-8 backdrop-blur-sm shadow-xl ${t.panel}`}>
          {/* Domain pills + Explore toggle in same row */}
          <div className="flex items-center justify-between mb-6 gap-4">
            <div className="flex flex-wrap gap-2">
              {(["general", "bio", "chemistry", "tech", "finance"] as Domain[]).map((domain) => {
                const meta = DOMAIN_META[domain];
                const isActive = selectedDomain === domain;
                return (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => setSelectedDomain(domain)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${isActive ? t.cardActive : t.card}`}
                  >
                    <span>{meta.emoji}</span>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Explore toggle */}
            <button
              type="button"
              onClick={() => setExploreMode((v) => !v)}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border text-sm font-semibold flex-shrink-0 transition-all ${
                exploreMode
                  ? "border-indigo-400 bg-indigo-500/10 text-indigo-500"
                  : `${t.card} ${t.subText}`
              }`}
            >
              {/* Toggle pill */}
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                  exploreMode ? t.toggleTrackOn : t.toggleTrackOff
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    exploreMode ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Explore
            </button>
          </div>

          {/* Custom topic search */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-center mb-4">Search your own topic</h2>
            <div className="max-w-xl mx-auto flex gap-3">
              <input
                type="text"
                placeholder="e.g. neural implant biocompatibility (2–5 words)"
                value={customTopic}
                onChange={(e) => { setCustomTopic(e.target.value); if (topicError) setTopicError(""); }}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 transition ${t.card} ${t.text}`}
                style={{ minWidth: 0 }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearchTopic(); }}
              />
              <label
                title="Start from your own paper"
                className={`px-3 py-2.5 rounded-xl border cursor-pointer flex items-center justify-center flex-shrink-0 transition hover:opacity-80 ${uploading ? "opacity-60 pointer-events-none" : ""} ${t.card}`}
              >
                <input
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadPaper(file);
                    e.target.value = "";
                  }}
                />
                {uploading ? (
                  <svg className="w-4 h-4 animate-spin" style={{ color: "#455c68" }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className={`w-4 h-4 ${t.subText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6h-1.348A4 4 0 007 16z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12v9m0-9l-3 3m3-3l3 3" />
                  </svg>
                )}
              </label>
              <button
                type="button"
                onClick={handleSearchTopic}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm flex-shrink-0 transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(to right, #455c68, #5f4e56)", color: "#fbf8f1" }}
              >
                Search
              </button>
            </div>
            {topicError && <p className="text-center text-xs mt-2" style={{ color: "#9c3a26" }}>{topicError}</p>}
            {uploadError && <p className="text-center text-xs mt-2" style={{ color: "#9c3a26" }}>{uploadError}</p>}
            <p className={`text-center text-xs mt-2 ${t.subText}`}>2–5 words for best results — or upload a paper to start from it</p>
          </div>

          <div className={`flex items-center gap-3 mb-8 ${t.subText}`}>
            <div className={`flex-1 h-px ${t.subText} opacity-30 bg-current`} />
            <span className="text-xs font-semibold uppercase tracking-widest opacity-60">or browse by domain</span>
            <div className={`flex-1 h-px ${t.subText} opacity-30 bg-current`} />
          </div>

          <p className={`text-sm font-semibold uppercase tracking-wider mb-2 text-center ${t.subText}`}>
            {exploreMode
              ? "Explore mode — click any word to subscribe to weekly papers"
              : `Or click a topic from the ${DOMAIN_META[selectedDomain].label} cloud`}
          </p>

          {/* Subscribe prompt — shown when a topic is selected in explore mode */}
          {exploreMode && exploreTopic && (
            <div className={`mb-4 flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 ${t.subscribeCard}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #455c68, #5f4e56)" }}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 mb-0.5">Selected topic</p>
                  <p className="font-semibold truncate">{exploreTopic}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setExploreTopic(null)}
                  className={`px-3 py-2 rounded-xl text-sm border transition-colors ${t.card} ${t.subText}`}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubscribe(true)}
                  title="Subscribe to weekly papers"
                  className="w-10 h-10 rounded-xl text-white flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
                  style={{ background: "linear-gradient(to right, #455c68, #5f4e56)" }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <div className={`relative rounded-2xl p-4 ${t.cloud} ${exploreMode ? "ring-2 ring-indigo-400/30" : ""}`}>
            {exploreMode && (
              <div className="absolute top-2 right-2 z-10">
                <span className="text-xs font-semibold px-2 py-1 rounded-lg text-indigo-500"
                  style={{ background: "rgba(69, 92, 104, 0.12)" }}>
                  Explore ON
                </span>
              </div>
            )}
            <WordCloudComponent
              words={DOMAIN_TERMS[selectedDomain]}
              onWordClick={handleWordClick}
              centerWord={centerWord}
            />
          </div>
        </div>

        {/* Normal mode loading overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-white rounded-2xl p-10 text-center shadow-2xl max-w-md mx-4">
              <div className="relative mb-6">
                <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 mx-auto"></div>
                <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-blue-600 mx-auto absolute top-0 left-1/2 -ml-10"></div>
              </div>
              <p className="text-xl font-bold text-gray-800 mb-2">Launching Evidence Mapping</p>
              <p className="text-sm text-gray-600">Analyzing papers, datasets, and research signals...</p>
            </div>
          </div>
        )}
      </div>

      {/* Subscribe modal — portaled to body, appears when topic selected in explore mode */}
      {showSubscribe && exploreTopic && (
        <SubscribeModal
          topic={exploreTopic}
          theme={theme}
          onClose={() => setShowSubscribe(false)}
        />
      )}
    </main>
  );
}
