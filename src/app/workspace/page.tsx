"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import InkSeal from "@/components/ink/InkSeal";
import AssistantChat from "@/components/AssistantChat";

type Theme = "dark" | "light" | "vibrant";

// #21/V4.1 scaffolded this page; #22/V4.2 fills the left pane with a real
// chat (job-agnostic — see /api/workspace/chat). The right pane (#23) is
// still a placeholder.

const THEME_STYLES = {
  dark: {
    mainBg: "ink-night",
    text: "text-white",
    subText: "text-zinc-400",
    navBorder: "border-zinc-800",
    navLink: "text-zinc-300 hover:bg-zinc-800/80 hover:text-white",
    paneBorder: "border-zinc-700",
    paneBg: "bg-zinc-900/60",
    placeholderText: "text-zinc-500",
  },
  light: {
    mainBg: "ink-paper",
    text: "text-zinc-900",
    subText: "text-zinc-600",
    navBorder: "border-gray-200",
    navLink: "text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900",
    paneBorder: "border-gray-200",
    paneBg: "bg-white/70",
    placeholderText: "text-zinc-400",
  },
  vibrant: {
    mainBg: "ink-jade",
    text: "text-zinc-900",
    subText: "text-zinc-600",
    navBorder: "border-teal-700/20",
    navLink: "text-zinc-600 hover:bg-white/80 hover:text-zinc-900",
    paneBorder: "border-teal-700/20",
    paneBg: "bg-white/70",
    placeholderText: "text-zinc-400",
  },
} as const;

export default function WorkspacePage() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved && ["dark", "light", "vibrant"].includes(saved)) setTheme(saved);
  }, []);

  const t = THEME_STYLES[theme];

  return (
    <main className={`min-h-screen ${t.mainBg} ${t.text} transition-all duration-500 flex flex-col`}>
      <nav className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-6 py-4 flex-shrink-0 ${t.navBorder}`}>
        <Link href="/" className="flex items-center gap-2.5" title="Home">
          <InkSeal text="HA" size={28} />
          <span className="font-display text-2xl font-semibold tracking-tight">Hypothesis Atlas</span>
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          <Link href="/explore" className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${t.navLink}`}>
            Explore
          </Link>
          <Link href="/jobs" className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${t.navLink}`}>
            My Research
          </Link>
        </div>
      </nav>

      <div className="px-6 py-4 flex-shrink-0">
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <p className={`text-sm mt-1 ${t.subText}`}>
          Chat is the main way to work here — everything else (graph, experiments, paper map, notebook, review) lives alongside it.
        </p>
      </div>

      {/* 50/50 split on desktop; stacks vertically below the lg breakpoint so
          narrower/mobile viewports get two full-width panes instead of two
          unusably narrow halves. */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 px-6 pb-6">
        <section
          aria-label="Chat"
          className={`w-full lg:w-1/2 min-h-[50vh] lg:min-h-0 rounded-2xl border ${t.paneBorder} overflow-hidden shadow-sm`}
        >
          <AssistantChat
            jobId="workspace"
            endpoint="/api/workspace/chat"
            storageKey="assistant-chat:workspace"
            enableNotes={false}
            welcome={{
              role: "assistant",
              content:
                "Hi! I'm Atlas. Ask me anything about your research, or open a run from My Research to dig into its graph, papers, and plan.",
            }}
          />
        </section>

        <section
          aria-label="Panels"
          className={`w-full lg:w-1/2 min-h-[50vh] lg:min-h-0 rounded-2xl border ${t.paneBorder} ${t.paneBg} backdrop-blur-sm flex items-center justify-center`}
        >
          <p className={`text-sm ${t.placeholderText}`}>Research Graph / Experiments / Paper Map / Notebook / Review — coming in #23</p>
        </section>
      </div>
    </main>
  );
}
