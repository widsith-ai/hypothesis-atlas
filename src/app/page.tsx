"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { fetchServerLLMInfo, getActiveLLMConfig, hasChosenDefaultModel, openModelKeyDialog } from "@/lib/llmClientConfig";
import { useRouter } from "next/navigation";
import InkLandscape, { type InkVariant } from "@/components/ink/InkLandscape";
import InkSeal from "@/components/ink/InkSeal";
import Enso from "@/components/ink/Enso";
import { ART_STYLES, ART_STYLE_LABEL, type ArtStyle } from "@/lib/artStyle";
import { useArtStyle } from "@/lib/useArtStyle";

type Theme = "dark" | "light" | "vibrant";

const themes = {
  dark: {
    bg: "ink-night",
    text: "text-white",
    cardBg: "bg-zinc-900/60 backdrop-blur-[2px]",
    cardBorder: "border-zinc-800",
    cardHover: "hover:border-zinc-600 hover:bg-zinc-900/80",
    accent: "text-zinc-200",
    muted: "text-zinc-400",
    mutedBg: "bg-zinc-900",
    codeBg: "bg-zinc-900",
    codeText: "text-emerald-400",
    codeComment: "text-zinc-600",
    navBg: "bg-white/10",
    navHover: "hover:bg-white/10",
    glow1: "bg-indigo-600/20",
    glow2: "bg-cyan-500/15",
    gradient: "from-zinc-50 via-zinc-300 to-red-300",
    buttonPrimary: "bg-zinc-100 text-zinc-900 hover:bg-white",
    buttonSecondary:
      "bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700/80 hover:text-white",
    ctaBg:
      "bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-indigo-500/20",
    footerBorder: "border-zinc-800",
    footerText: "text-zinc-600",
  },
  light: {
    bg: "ink-paper",
    text: "text-zinc-900",
    cardBg: "bg-white/70 backdrop-blur-[2px]",
    cardBorder: "border-zinc-200",
    cardHover: "hover:border-zinc-400 hover:bg-white/90",
    accent: "text-zinc-800",
    muted: "text-zinc-600",
    mutedBg: "bg-zinc-100",
    codeBg: "bg-zinc-900",
    codeText: "text-emerald-400",
    codeComment: "text-zinc-600",
    navBg: "bg-zinc-100",
    navHover: "hover:bg-zinc-200",
    glow1: "bg-blue-400/10",
    glow2: "bg-indigo-400/8",
    gradient: "from-zinc-900 via-zinc-700 to-red-700",
    buttonPrimary: "bg-zinc-900 text-white hover:bg-zinc-800",
    buttonSecondary:
      "bg-zinc-300/70 text-zinc-900 hover:bg-zinc-300",
    ctaBg: "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200",
    footerBorder: "border-zinc-200",
    footerText: "text-zinc-500",
  },
  vibrant: {
    bg: "ink-jade",
    text: "text-zinc-900",
    cardBg: "bg-white/80 backdrop-blur-sm",
    cardBorder: "border-zinc-200",
    cardHover: "hover:border-teal-600/40 hover:bg-white",
    accent: "text-teal-800",
    muted: "text-zinc-600",
    mutedBg: "bg-white",
    codeBg: "bg-zinc-900",
    codeText: "text-emerald-400",
    codeComment: "text-zinc-500",
    navBg: "bg-white/80 backdrop-blur-sm",
    navHover: "hover:bg-zinc-100",
    glow1: "bg-fuchsia-300/20",
    glow2: "bg-sky-300/20",
    gradient: "from-teal-800 via-emerald-700 to-amber-600",
    buttonPrimary: "bg-teal-800 text-white hover:bg-teal-700",
    buttonSecondary:
      "bg-amber-100/80 text-teal-900 hover:bg-amber-200/80",
    ctaBg: "bg-gradient-to-br from-rose-50 to-sky-50 border border-rose-200",
    footerBorder: "border-zinc-200",
    footerText: "text-zinc-500",
  },
} as const;

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({
  theme: "light",
  setTheme: () => {},
});

const THEME_DOT: Record<Theme, string> = {
  dark: "bg-zinc-900 ring-1 ring-zinc-500",
  light: "bg-zinc-100 ring-1 ring-zinc-400",
  vibrant: "bg-teal-600 ring-1 ring-amber-400",
};

// Same three theme keys (other pages read them from localStorage), named for
// the painting each one evokes in each art style (#87, src/lib/artStyle.ts).
const THEME_LABEL: Record<ArtStyle, Record<Theme, string>> = {
  monet: { dark: "Impression, Sunrise", light: "Water Lilies", vibrant: "The Footbridge" },
  ink: { dark: "Ink Night", light: "Xuan Paper", vibrant: "Jade Hills" },
};

const STYLE_DOT: Record<ArtStyle, string> = {
  monet: "bg-gradient-to-br from-sky-300 via-violet-300 to-pink-300 ring-1 ring-emerald-500/60",
  ink: "bg-zinc-900 ring-1 ring-red-500/70",
};

const INK_VARIANT: Record<Theme, InkVariant> = {
  dark: "night",
  light: "paper",
  vibrant: "jade",
};

/** A single compact dropdown instead of separate buttons — frees up enough width in the nav that the fixed top-right Sign In widget (src/components/AuthWidget.tsx) no longer overlaps it. Two groups: the art style (Monet / Ink wash, #87) and the scene (colour mode) within it. */
function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [artStyle, setArtStyle] = useArtStyle();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm transition-colors ${
          theme === "dark"
            ? "bg-zinc-800/50 text-zinc-200 hover:bg-zinc-700/50"
            : theme === "light"
              ? "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              : "bg-white/70 border border-teal-700/30 text-teal-900 hover:bg-white"
        }`}
      >
        <span className={`w-2.5 h-2.5 rounded-full ${THEME_DOT[theme]}`} />
        <span className="hidden sm:inline">{THEME_LABEL[artStyle][theme]}</span>
        <svg className={`w-3 h-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute top-full right-0 mt-1.5 w-48 rounded-lg shadow-lg overflow-hidden z-20 ${
            theme === "dark" ? "bg-zinc-800 border border-zinc-700" : "bg-white border border-zinc-200"
          }`}
        >
          <div className={`px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${theme === "dark" ? "text-zinc-500" : "text-zinc-400"}`}>
            Style
          </div>
          {ART_STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setArtStyle(s)}
              aria-pressed={artStyle === s}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                artStyle === s
                  ? theme === "dark" ? "bg-zinc-700 text-white" : "bg-zinc-100 text-zinc-900"
                  : theme === "dark" ? "text-zinc-300 hover:bg-zinc-700/60" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${STYLE_DOT[s]}`} />
              {ART_STYLE_LABEL[s]}
            </button>
          ))}
          <div className={`px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] border-t ${theme === "dark" ? "text-zinc-500 border-zinc-700" : "text-zinc-400 border-zinc-200"}`}>
            Scene
          </div>
          {(["dark", "light", "vibrant"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTheme(t); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                theme === t
                  ? theme === "dark" ? "bg-zinc-700 text-white" : "bg-zinc-100 text-zinc-900"
                  : theme === "dark" ? "text-zinc-300 hover:bg-zinc-700/60" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${THEME_DOT[t]}`} />
              {THEME_LABEL[artStyle][t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useTheme() {
  return useContext(ThemeContext);
}

const features = [
  {
    icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
    title: "Knowledge Trees",
    desc: "Auto-generated hierarchical breakdowns of any research topic",
  },
  {
    icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
    title: "Multi-Source",
    desc: "Papers from OpenAlex & PubMed, datasets from GEO, social signals",
  },
  {
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
    title: "Real-time Pipeline",
    desc: "Watch evidence gathering live with server-sent events",
  },
  {
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
    title: "LLM Synthesis",
    desc: "Groq-powered analysis with epistemic guardrails",
  },
  {
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    title: "Research Notebook",
    desc: "Markdown editor with AI copilot for topic convergence",
  },
  {
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    title: "Open Source",
    desc: "MIT licensed. Self-host free, or run on our servers at $1/round",
  },
];

const steps = [
  { cmd: "make laptop-install", label: "Install everything" },
  { cmd: "make dev", label: "Start dev server" },
  { cmd: "make worker", label: "Start background worker" },
];

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [artStyle] = useArtStyle();
  const { status: authStatus } = useSession();

  // Every "Explorer" entry point on the landing page requires an account.
  // Signed out → cancel the navigation and open the sign-in modal (AuthWidget
  // listens for this event) instead of letting the link through to /explore.
  //
  // #88: signed in but no model key of their own in this browser → open the
  // Model & API key dialog first; saving a key (or choosing the server's
  // default model, when it has one) continues on to /explore.
  // #91: a self-hosted instance whose backend already has keys skips the
  // dialog entirely; the edition info is fetched once and cached.
  const router = useRouter();
  useEffect(() => {
    fetchServerLLMInfo();
  }, []);
  const requireSignInForExplorer = (e: React.MouseEvent) => {
    if (authStatus !== "authenticated") {
      e.preventDefault();
      window.dispatchEvent(new Event("atlas:open-signin"));
      return;
    }
    if (getActiveLLMConfig() || hasChosenDefaultModel()) return;
    e.preventDefault();
    fetchServerLLMInfo().then((info) => {
      // Unreachable server info → offer the dialog (the safe default).
      if (info && !info.offerUserKeys) router.push("/explore");
      else openModelKeyDialog({ continueTo: "/explore" });
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme;
    if (saved && ["dark", "light", "vibrant"].includes(saved)) {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const t = themes[theme];

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <main
        className={`min-h-screen ${t.bg} ${artStyle === "ink" ? "ink-plain" : ""} ${t.text} overflow-hidden transition-all duration-500`}
      >
        {/* The painting: nav, hero and install scroll sit over one landscape.
            Ink wash paints its own landscape here (over a plain paper page);
            Monet's painting is the page background itself (globals.css). */}
        <div className="relative">
        {artStyle === "ink" && (
          <InkLandscape
            variant={INK_VARIANT[theme]}
            className="absolute inset-x-0 top-0 w-full h-[880px] md:h-[980px]"
          />
        )}

        {/* Nav — extra right padding reserves room for the fixed Sign In widget (src/components/AuthWidget.tsx) in the corner, so the theme dropdown never sits underneath it. Docs/Pricing hide below sm so the row doesn't overflow into that reserved space on narrow viewports. */}
        <nav className="relative z-10 flex items-center justify-between flex-wrap gap-y-3 px-4 sm:px-6 md:px-12 py-6 pr-24 sm:pr-48 md:pr-48">
          <span className="flex items-center gap-2.5">
            <InkSeal text="HA" size={26} />
            <span className="font-display text-2xl font-semibold tracking-tight">
              Hypothesis Atlas
            </span>
          </span>
          {/* On phones this row drops below the brand, so the top-right corner stays free for the account pill. */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <Link
              href="/docs"
              className={`hidden sm:inline-block px-4 py-2 text-sm ${t.muted} hover:${t.text} transition-colors`}
            >
              Docs
            </Link>
            <Link
              href="/pricing"
              className={`hidden sm:inline-block px-4 py-2 text-sm ${t.muted} hover:${t.text} transition-colors`}
            >
              Pricing
            </Link>
            <Link
              href="/explore"
              onClick={requireSignInForExplorer}
              className={`ink-stroke px-4 sm:px-5 py-2 text-sm font-semibold ${t.buttonPrimary} transition-colors whitespace-nowrap`}
            >
              Try Explorer
            </Link>
            <ThemeSwitcher />
          </div>
        </nav>

        {/* Hero */}
        <section className="relative px-6 md:px-12 pt-16 pb-24 max-w-6xl mx-auto">

          <div className="relative z-10 text-center max-w-4xl mx-auto">
            <div className="animate-slide-up">
              <span
                className={`inline-block px-3 py-1 mb-6 text-[11px] font-semibold tracking-[0.3em] uppercase rounded-sm border ${theme === "dark" ? "text-red-300 border-red-400/40 bg-zinc-950/40" : theme === "light" ? "text-red-700 border-red-700/40 bg-white/50" : "text-teal-800 border-teal-700/40 bg-white/50"}`}
              >
                Open-source research platform
              </span>
            </div>

            <h1 className="animate-slide-up delay-100 text-6xl md:text-[5.75rem] font-semibold leading-[1.02] tracking-tight">
              Map the evidence.
              <br />
              <span
                className={`italic bg-gradient-to-r ${t.gradient} bg-clip-text text-transparent animate-gradient`}
              >
                See the science.
              </span>
            </h1>

            <p
              className={`animate-slide-up delay-200 mt-6 text-lg ${t.muted} max-w-xl mx-auto leading-relaxed`}
            >
              Discover, synthesize, and visualize research from papers,
              datasets, and signals &mdash; brainstorm ideas in one click.
            </p>

            <div className="animate-slide-up delay-300 mt-10 flex items-center justify-center gap-4 flex-wrap">
              <Link
                href="/explore"
              onClick={requireSignInForExplorer}
                className={`ink-stroke group px-8 py-3.5 ${t.buttonPrimary} font-semibold transition-all flex items-center gap-2`}
              >
                Open Explorer
                <svg
                  className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </Link>
              <Link
                href="/docs"
                className={`ink-stroke px-8 py-3.5 ${t.buttonSecondary} font-semibold transition-all`}
              >
                Read the Docs
              </Link>
            </div>
          </div>
        </section>

        {/* Terminal Install */}
        <section className="relative px-6 md:px-12 pb-28 max-w-3xl mx-auto">
          {/* Mounted as a hanging scroll: rollers top and bottom (.ink-scroll). */}
          <div className="ink-scroll animate-slide-up delay-400 shadow-2xl">
          <div
            className={`${t.codeBg} overflow-hidden`}
          >
            <div
              className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800"
            >
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className={`ml-2 text-xs ${t.muted} font-mono`}>
                terminal
              </span>
            </div>
            <div className="p-5 font-mono text-sm space-y-3">
              {steps.map((s, i) => (
                <div key={i}>
                  <span className={t.muted}>$</span>{" "}
                  <span className={t.codeText}>{s.cmd}</span>
                  <span className={`ml-4 ${t.codeComment} text-xs`}>
                    # {s.label}
                  </span>
                </div>
              ))}
              <div className={`pt-2 ${t.muted} text-xs`}>
                Open{" "}
                <span
                  className={
                    theme === "vibrant" ? "text-amber-300" : "text-red-300"
                  }
                >
                  http://localhost:3000
                </span>
              </div>
            </div>
          </div>
          </div>
        </section>
        </div>

        {/* Features */}
        <section className="px-6 md:px-12 pb-24 max-w-6xl mx-auto">
          <h2 className="text-center text-4xl md:text-5xl font-semibold mb-3">
            Everything you need
          </h2>
          <div className={`ink-divider w-40 mx-auto mb-4 ${theme === "dark" ? "ink-divider-light" : ""}`} />
          <p className={`text-center ${t.muted} mb-12 max-w-lg mx-auto`}>
            From topic selection to structured knowledge &mdash; fully
            automated.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div
                key={i}
                className={`group ${t.cardBg} ${t.cardBorder} rounded-2xl p-6 ${t.cardHover} transition-all duration-300`}
              >
                <Enso size={52} className={`mb-4 ${t.accent} opacity-90 group-hover:opacity-100 transition-opacity`}>
                  <svg
                    className={`w-5 h-5 ${t.accent}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={f.icon}
                    />
                  </svg>
                </Enso>
                <h3 className={`text-xl font-semibold ${t.text} mb-1`}>{f.title}</h3>
                <p className={`text-sm ${t.muted} leading-relaxed`}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 md:px-12 pb-24 max-w-4xl mx-auto">
          <h2 className="text-center text-4xl md:text-5xl font-semibold mb-3">
            How it works
          </h2>
          <div className={`ink-divider w-40 mx-auto mb-12 ${theme === "dark" ? "ink-divider-light" : ""}`} />
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              {
                step: "1",
                title: "Pick a topic",
                desc: "Click any term in the word cloud or type your own.",
              },
              {
                step: "2",
                title: "Watch it build",
                desc: "Real-time pipeline fetches papers, datasets, and signals.",
              },
              {
                step: "3",
                title: "Explore & write",
                desc: "Navigate the knowledge tree and use the AI notebook.",
              },
            ].map((s, i) => (
              <div key={i}>
                <Enso
                  size={72}
                  className={`mx-auto mb-4 animate-float ${theme === "dark" ? "text-zinc-200" : theme === "vibrant" ? "text-teal-800" : "text-zinc-900"}`}
                >
                  <span className="font-brush text-3xl">
                    {["1", "2", "3"][i]}
                  </span>
                  <span className="sr-only">{s.step}</span>
                </Enso>
                <h3 className={`font-semibold text-2xl mb-2`}>{s.title}</h3>
                <p className={`text-sm ${t.muted}`}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 md:px-12 pb-8">
          <div className={`ink-divider max-w-6xl mx-auto mb-8 ${theme === "dark" ? "ink-divider-light" : ""}`} />
          <div className="max-w-6xl mx-auto flex items-center justify-between text-xs">
            <span className={`flex items-center gap-2 ${t.footerText}`}>
              <InkSeal text="HA" size={22} />
              Hypothesis Atlas &middot; MIT License
            </span>
            <div className="flex gap-4">
              <Link
                href="/docs"
                className={`${t.footerText} hover:${t.text} transition-colors`}
              >
                Docs
              </Link>
              <Link
                href="/explore"
              onClick={requireSignInForExplorer}
                className={`${t.footerText} hover:${t.text} transition-colors`}
              >
                Explorer
              </Link>
              <Link
                href="/pricing"
                className={`${t.footerText} hover:${t.text} transition-colors`}
              >
                Pricing
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </ThemeContext.Provider>
  );
}
