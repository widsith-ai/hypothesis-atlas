"use client";

import { useEffect, useRef, useState } from "react";
import { extractAtlasPlanDraft, extractLegacyArsDraft, pickNewestDraft, type DraftCandidate, type DraftInfo } from "@/lib/paperDraftMigration";
import { DEVILS_ADVOCATE_AGENT } from "@/lib/reviewRehearsal";

interface ReviewScores {
  novelty: number;
  soundness: number;
  clarity: number;
  significance: number;
  overall: number;
}

interface AgentReview {
  id: string;
  name: string;
  unavailable?: boolean;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  questions?: string[];
  scores?: ReviewScores;
  recommendation?: string;
}

interface Disagreement {
  description: string;
  reviewers: string[];
}

interface RevisionRoadmap {
  blocking: string[];
  niceToFix: string[];
}

interface ResponseLetterEntry {
  comment: string;
  draftResponse: string;
}

interface ReviewResult {
  venue: { name: string; url: string | null; criteria: string[]; focus: string[] };
  agents: AgentReview[];
  disagreements?: Disagreement[];
  revisionRoadmap?: RevisionRoadmap;
  responseLetterSkeleton?: ResponseLetterEntry[];
  final: { scores: ReviewScores; consensus: string; metaReview: string; decisionLetter?: string; reviewerCount: number };
}

const PRESET_VENUES = [
  { id: "nature", name: "Nature / Nature Portfolio journal" },
  { id: "ieee", name: "IEEE Transactions / Journals" },
  { id: "acm", name: "ACM Conference / Journal" },
  { id: "springer", name: "Springer / Elsevier journal" },
  { id: "mlconf", name: "ML Conference (NeurIPS / ICML / ICLR)" },
  { id: "acl", name: "ACL / NLP venue" },
  { id: "preprint", name: "Preprint (arXiv-style)" },
  { id: "other", name: "Other / unspecified venue" },
];

const CRITERIA_LABELS: [keyof ReviewScores, string][] = [
  ["novelty", "Novelty"],
  ["soundness", "Soundness"],
  ["clarity", "Clarity"],
  ["significance", "Significance"],
  ["overall", "Overall"],
];

const REC_STYLE: Record<string, { background: string; color: string }> = {
  accept: { background: "#e0e9e1", color: "#37523d" },
  "minor revision": { background: "#f3e7d1", color: "#6f4b21" },
  "major revision": { background: "#f3e7d1", color: "#6f4b21" },
  reject: { background: "#f6e2dc", color: "#7e2f20" },
};

const AGENT_HUES = [
  { bg: "#f1f4f5", text: "#384a54", ring: "#587380" },
  { bg: "#fbf3f0", text: "#7e2f20", ring: "#b54a33" },
  { bg: "#eff5f5", text: "#324e52", ring: "#4c777c" },
  { bg: "#faf5ec", text: "#6f4b21", ring: "#a87732" },
];

function scoreColor(v: number): string {
  if (v >= 8) return "#44664b";
  if (v >= 6) return "#8b5f27";
  if (v >= 4) return "#8b5f27";
  return "#9c3a26";
}

// The "current paper" is the most recently saved Write Paper draft on this device — see
// lib/paperDraftMigration.ts for why this reads two cache-key prefixes, not a migration.
function findCurrentDraft(): DraftInfo | null {
  try {
    const lastJobId = localStorage.getItem("lastJobId");
    if (!lastJobId) return null;

    const sources: { prefix: string; extract: (raw: string | null) => { text: string; savedAt: number } | null }[] = [
      { prefix: `atlas-plan:${lastJobId}:`, extract: extractAtlasPlanDraft },
      { prefix: `ars-plan:${lastJobId}:`, extract: extractLegacyArsDraft },
    ];

    const candidates: DraftCandidate[] = [];
    for (const { prefix, extract } of sources) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const hit = extract(localStorage.getItem(key));
        if (hit) candidates.push({ key, prefix, ...hit });
      }
    }
    return pickNewestDraft(candidates);
  } catch {
    return null;
  }
}

export default function PaperReviewPanel() {
  const cacheKey = "paper-review:standalone";

  const [venueId, setVenueId] = useState("mlconf");
  const [venueUrl, setVenueUrl] = useState("");
  const [paperText, setPaperText] = useState("");
  const [source, setSource] = useState<"draft" | "upload">("draft");
  const [draftInfo, setDraftInfo] = useState<{ label: string; savedAt: number } | null>(null);
  const [uploadedName, setUploadedName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPersona, setCustomPersona] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);

  // Restore cached review on mount (avoids re-running on refresh); otherwise default to the current draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      let hasCachedText = false;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.result?.agents && parsed?.result?.final) {
          setResult(parsed.result);
          if (typeof parsed.venueId === "string") setVenueId(parsed.venueId);
          if (typeof parsed.venueUrl === "string") setVenueUrl(parsed.venueUrl);
          if (typeof parsed.paperText === "string") {
            setPaperText(parsed.paperText);
            hasCachedText = parsed.paperText.trim().length > 0;
          }
          if (typeof parsed.customName === "string") setCustomName(parsed.customName);
          if (typeof parsed.customPersona === "string") setCustomPersona(parsed.customPersona);
        }
      }
      if (!hasCachedText) {
        const draft = findCurrentDraft();
        if (draft) {
          setDraftInfo({ label: draft.label, savedAt: draft.savedAt });
          setPaperText(draft.text);
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resultRef = useRef(result);
  useEffect(() => { resultRef.current = result; }, [result]);
  const inputsRef = useRef({ venueId, venueUrl, paperText, customName, customPersona });
  useEffect(() => { inputsRef.current = { venueId, venueUrl, paperText, customName, customPersona }; }, [venueId, venueUrl, paperText, customName, customPersona]);
  useEffect(() => {
    const save = () => {
      try {
        if (resultRef.current) {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ result: resultRef.current, ...inputsRef.current })
          );
        }
      } catch {}
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [cacheKey]);

  const handleLoadDraft = () => {
    const draft = findCurrentDraft();
    if (draft) {
      setDraftInfo({ label: draft.label, savedAt: draft.savedAt });
      setPaperText(draft.text);
      setSource("draft");
      setUploadedName("");
      setError(null);
    } else {
      setError("No Write Paper draft found on this device. Upload a paper or paste your text below.");
    }
  };

  const handleUploadPaper = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("textOnly", "1");
      const res = await fetch("/api/jobs/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || typeof data.text !== "string" || !data.text.trim()) {
        setError(data.error ?? "Could not extract text from this file.");
        return;
      }
      setPaperText(data.text);
      setSource("upload");
      setUploadedName(String(data.fileName ?? file.name));
      setDraftInfo(null);
    } catch {
      setError("Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  };

  const venueName = PRESET_VENUES.find((v) => v.id === venueId)?.name ?? "the target venue";

  const runReview = async () => {
    if (paperText.trim().length < 200) {
      setError("Paper draft is too short to review (min 200 chars). Load a draft or paste your paper.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/paper-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperText,
          venueName,
          venueUrl: venueUrl.trim(),
          customAgent:
            customName.trim() && customPersona.trim()
              ? { name: customName.trim(), persona: customPersona.trim() }
              : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Review failed");
        return;
      }
      setResult(data);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ result: data, venueId, venueUrl, paperText, customName, customPersona }));
      } catch {}
    } catch {
      setError("Network error while running the review");
    } finally {
      setLoading(false);
    }
  };

  const clearReview = () => {
    setResult(null);
    try { localStorage.removeItem(cacheKey); } catch {}
  };

  const inputCard = "bg-white rounded-2xl border border-gray-200 p-6 shadow-sm";

  return (
    <div className="space-y-6">
      {/* Setup */}
      <div className={inputCard}>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Peer Review Session</h2>
        <p className="text-sm text-gray-500 mb-2">
          Choose a publisher — or paste its call-for-papers page so reviewers grade against its real criteria.
          A committee of three reviewer agents (plus your custom one and an adversarial Devil&apos;s Advocate pass) will review your paper and produce a final decision.
        </p>
        <p className="text-xs text-gray-400 mb-5">
          This is a pre-submission rehearsal — a simulated review to help you prepare, not a substitute for real reviewer feedback once you actually submit.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Publisher / Venue</label>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {PRESET_VENUES.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Call-for-papers URL <span className="normal-case text-gray-400 font-normal">(optional — we extract review criteria)</span>
            </label>
            <input
              type="url"
              value={venueUrl}
              onChange={(e) => setVenueUrl(e.target.value)}
              placeholder="https://conf2027.org/call-for-papers"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Paper to review</label>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button
              type="button"
              onClick={handleLoadDraft}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                source === "draft"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              Current paper draft
            </button>
            <label
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                source === "upload"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
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
              {uploading ? "Extracting text…" : "Upload a paper"}
            </label>
            <span className="text-xs text-gray-400">
              {source === "upload" && uploadedName
                ? `Extracted from ${uploadedName}`
                : draftInfo
                ? `Draft: "${draftInfo.label}"${draftInfo.savedAt ? ` · saved ${new Date(draftInfo.savedAt).toLocaleString()}` : ""}`
                : "No Write Paper draft found on this device — upload a paper or paste text below"}
            </span>
          </div>
          <textarea
            value={paperText}
            onChange={(e) => setPaperText(e.target.value)}
            rows={8}
            placeholder="Paste your paper here, load your current draft, or upload a file…"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 leading-relaxed"
          />
          <p className="text-xs text-gray-400 mt-1">{paperText.trim().length.toLocaleString()} characters</p>
        </div>

        <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4 mb-5">
          <p className="text-xs font-semibold text-indigo-700 mb-3">CUSTOM REVIEWER (OPTIONAL)</p>
          <div className="grid md:grid-cols-2 gap-3">
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Reviewer name & role — e.g. Prof. Anna Weiss, Cryptography"
              className="px-3 py-2 rounded-lg border border-indigo-100 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <input
              value={customPersona}
              onChange={(e) => setCustomPersona(e.target.value)}
              placeholder="Persona — what they care about, how strict they are…"
              className="px-3 py-2 rounded-lg border border-indigo-100 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={runReview}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(to right, #455c68, #5f4e56)" }}
          >
            {loading ? "Reviewers reading… (30–90s)" : result ? "Re-run Review" : "Start Review"}
          </button>
          {result && (
            <button onClick={clearReview} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Final verdict */}
          <div className="rounded-2xl p-6 shadow-sm" style={{ background: "linear-gradient(135deg, #151c20, #384a54)", color: "#fbf8f1" }}>
            <div className="flex flex-wrap items-start gap-6">
              <div className="text-center flex-shrink-0">
                <div className="text-5xl font-bold" style={{ color: "#9fb2bb" }}>
                  {result.final.scores.overall}
                  <span className="text-lg font-medium text-indigo-300">/10</span>
                </div>
                <p className="text-xs text-indigo-300 mt-1">FINAL SCORE</p>
              </div>
              <div className="flex-1 min-w-[240px]">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="font-bold">Editor's Meta-Review — {result.venue.name}</h3>
                  <span
                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize"
                    style={REC_STYLE[result.final.consensus] ?? { bg: "#e1e8eb", text: "#2d3b43" }}
                  >
                    {result.final.consensus}
                  </span>
                </div>
                {result.venue.criteria.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {result.venue.criteria.map((c, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-indigo-100">{c}</span>
                    ))}
                  </div>
                )}
                <p className="text-sm leading-relaxed" style={{ color: "#c4d1d7" }}>{result.final.metaReview}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
              {CRITERIA_LABELS.map(([key, label]) => (
                <div key={key} className="bg-white/5 rounded-xl px-3 py-2.5">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-indigo-200">{label}</span>
                    <span className="font-bold">{result.final.scores[key]}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${result.final.scores[key] * 10}%`, background: "#9fb2bb" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-indigo-300/70 mt-3">
              Averaged across {result.final.reviewerCount} reviewer{result.final.reviewerCount > 1 ? "s" : ""}
              {result.agents.some((a) => a.unavailable) ? " (one reviewer unavailable)" : ""} for {result.venue.name}.
            </p>
          </div>

          {/* #80: the actual decision letter, not just the terse internal meta-review above */}
          {result.final.decisionLetter && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Simulated Decision Letter</h3>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pre-submission rehearsal — not a real decision</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{result.final.decisionLetter}</p>
            </div>
          )}

          {/* #80: points where reviewers (including the adversarial pass) genuinely split, which the averaged score can hide */}
          {(result.disagreements?.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">Where Reviewers Disagreed</h3>
              <ul className="space-y-1.5">
                {result.disagreements!.map((d, i) => (
                  <li key={i} className="text-xs text-amber-800 flex gap-2 leading-relaxed">
                    <span className="flex-shrink-0">⚠</span>{d.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-agent reviews */}
          {result.agents.map((agent, idx) => {
            const hue = AGENT_HUES[idx % AGENT_HUES.length];
            const isDevilsAdvocate = agent.id === DEVILS_ADVOCATE_AGENT.id;
            return (
              <div
                key={agent.id}
                className={`bg-white rounded-2xl border shadow-sm p-6 ${isDevilsAdvocate ? "border-red-200" : "border-gray-200"}`}
              >
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: hue.bg, color: hue.text, boxShadow: `0 0 0 2px ${hue.ring}33` }}
                  >
                    {agent.name.replace(/^Prof\.\s*|^Dr\.\s*/, "").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{agent.name}</p>
                      {isDevilsAdvocate && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                          Adversarial pass
                        </span>
                      )}
                    </div>
                    {agent.unavailable ? (
                      <p className="text-xs text-red-500">This reviewer failed — LLM service may have been rate-limited.</p>
                    ) : (
                      <p className="text-xs text-gray-500 line-clamp-2">{agent.summary}</p>
                    )}
                  </div>
                  {agent.recommendation && (
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0"
                      style={REC_STYLE[agent.recommendation] ?? { bg: "#efebe0", text: "#5e5850" }}
                    >
                      {agent.recommendation}
                    </span>
                  )}
                </div>

                {agent.scores && (
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {CRITERIA_LABELS.map(([key, label]) => {
                      const sc = agent.scores![key];
                      return (
                        <div key={key} className="text-center">
                          <div className="text-lg font-bold" style={{ color: scoreColor(sc) }}>
                            {sc}
                          </div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
                          <div className="h-1 rounded-full bg-gray-100 mt-1 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${sc * 10}%`, background: scoreColor(sc) }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {agent.summary && !agent.unavailable && <p className="text-sm text-gray-700 leading-relaxed mb-4">{agent.summary}</p>}

                <div className="grid md:grid-cols-2 gap-4">
                  {(agent.strengths?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Strengths</p>
                      <ul className="space-y-1.5">
                        {agent.strengths!.map((s, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2 leading-relaxed">
                            <span className="text-emerald-500 flex-shrink-0">+</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(agent.weaknesses?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Weaknesses</p>
                      <ul className="space-y-1.5">
                        {agent.weaknesses!.map((w, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2 leading-relaxed">
                            <span className="text-amber-500 flex-shrink-0">–</span>{w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {(agent.questions?.length ?? 0) > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-2">Questions to Authors</p>
                    <ul className="space-y-1.5">
                      {agent.questions!.map((q, i) => (
                        <li key={i} className="text-xs text-gray-600 flex gap-2 leading-relaxed">
                          <span className="text-indigo-400 flex-shrink-0">?</span>{q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {/* #80: a prioritized, deduped revision list — which weaknesses are submission-blocking vs. nice-to-fix */}
          {((result.revisionRoadmap?.blocking.length ?? 0) > 0 || (result.revisionRoadmap?.niceToFix.length ?? 0) > 0) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Revision Roadmap</h3>
              <p className="text-xs text-gray-400 mb-4">Deduplicated across reviewers, ordered most to least urgent within each list.</p>
              <div className="grid md:grid-cols-2 gap-4">
                {(result.revisionRoadmap?.blocking.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Blocking</p>
                    <ol className="space-y-1.5 list-decimal list-inside">
                      {result.revisionRoadmap!.blocking.map((issue, i) => (
                        <li key={i} className="text-xs text-gray-700 leading-relaxed">{issue}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {(result.revisionRoadmap?.niceToFix.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nice to Fix</p>
                    <ol className="space-y-1.5 list-decimal list-inside">
                      {result.revisionRoadmap!.niceToFix.map((issue, i) => (
                        <li key={i} className="text-xs text-gray-600 leading-relaxed">{issue}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* #80: a drafting aid for the author, not a finished rebuttal — see the disclaimer below */}
          {(result.responseLetterSkeleton?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-900">Response Letter — Draft Starting Points</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Drafting aids to edit, not a finished rebuttal — and a pre-submission rehearsal, not a response to a real review.
              </p>
              <div className="space-y-4">
                {result.responseLetterSkeleton!.map((entry, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-1">Comment: {entry.comment}</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{entry.draftResponse}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
