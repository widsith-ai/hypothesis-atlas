"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import InkSeal from "@/components/ink/InkSeal";

type Theme = "dark" | "light" | "vibrant";

const THEME_STYLES = {
  dark: {
    mainBg: "ink-night",
    header: "bg-zinc-900/90 border-zinc-800",
    brand: "text-zinc-100 hover:text-zinc-300",
    slash: "text-zinc-700",
    sectionLabel: "text-zinc-400",
    exploreLink: "text-zinc-300 hover:text-zinc-100",
    homeButton: "bg-zinc-100 text-zinc-900 hover:bg-white",
    sidebar: "border-zinc-800 bg-zinc-900/80",
    navActive: "bg-indigo-500/20 text-indigo-200 font-semibold",
    navIdle: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
    contentShell: "bg-white",
  },
  light: {
    mainBg: "ink-paper",
    header: "bg-white/80 border-zinc-200",
    brand: "text-zinc-900 hover:text-zinc-700",
    slash: "text-zinc-300",
    sectionLabel: "text-zinc-500",
    exploreLink: "text-zinc-600 hover:text-zinc-900",
    homeButton: "bg-zinc-900 text-white hover:bg-zinc-800",
    sidebar: "border-zinc-200 bg-white",
    navActive: "bg-indigo-50 text-indigo-700 font-semibold",
    navIdle: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
    contentShell: "bg-transparent",
  },
  vibrant: {
    mainBg: "ink-jade",
    header: "bg-white/85 border-rose-200",
    brand: "text-zinc-900 hover:text-zinc-700",
    slash: "text-zinc-300",
    sectionLabel: "text-zinc-500",
    exploreLink: "text-zinc-600 hover:text-zinc-900",
    homeButton: "bg-zinc-900 text-white hover:bg-zinc-800",
    sidebar: "border-rose-200 bg-white/90",
    navActive: "bg-fuchsia-50 text-fuchsia-700 font-semibold",
    navIdle: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
    contentShell: "bg-white/90",
  },
} as const;

/* ── data ─────────────────────────────────────────────── */

const envVars = [
  {
    name: "DATABASE_URL",
    example:
      "postgresql://postgres:postgres@localhost:5433/hypothesis_atlas?schema=public",
    desc: "PostgreSQL connection string. Local Docker uses port 5433.",
    required: true,
  },
  {
    name: "REDIS_URL",
    example: "redis://localhost:6379",
    desc: "Redis endpoint for BullMQ job queue. If omitted the app falls back to in-process setTimeout.",
    required: false,
  },
  {
    name: "GROQ_API_KEY",
    example: "your_groq_api_key_here",
    desc: "Groq API key for LLM synthesis (llama-3.1-70b-versatile). Free tier available.",
    required: true,
    link: "https://console.groq.com",
    linkLabel: "Get a key at console.groq.com",
  },
];

const architecture = [
  {
    layer: "Frontend",
    tech: "Next.js 14, React 18, Tailwind CSS",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    layer: "API",
    tech: "Next.js Route Handlers, Prisma ORM",
    icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    layer: "Database",
    tech: "PostgreSQL (Neon / Supabase / Docker)",
    icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  },
  {
    layer: "Queue",
    tech: "BullMQ + Redis (Upstash / Docker)",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  },
  {
    layer: "Worker",
    tech: "Separate process — Railway / Render",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  },
  {
    layer: "LLM",
    tech: "Groq API (llama-3.1-70b-versatile)",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
];

const faq: { q: string; a: string }[] = [
  {
    q: "Do I need Docker?",
    a: "Yes for local dev — Docker Compose runs PostgreSQL and Redis. For production you can use managed services (Neon, Upstash, etc.).",
  },
  {
    q: "What if I skip GROQ_API_KEY?",
    a: "The app still works. LLM-powered synthesis is replaced with a basic keyword fallback so you can explore the pipeline without a key.",
  },
  {
    q: "Can I use a different LLM provider?",
    a: "The processor calls Groq's OpenAI-compatible API. Swap the base URL and model name in src/worker/processor.ts to use any compatible endpoint.",
  },
  {
    q: "How do I deploy to production?",
    a: "Deploy the web app to Vercel with DATABASE_URL, REDIS_URL, and GROQ_API_KEY set. Deploy the worker to Railway or Render using `npm run worker`.",
  },
  {
    q: "What does $1 per round mean?",
    a: "When running on our hosted server each evidence-mapping execution is priced at $1. Self-hosted usage is completely free under the MIT license.",
  },
  {
    q: "Where are papers fetched from?",
    a: "OpenAlex and PubMed E-utilities for papers, NCBI GEO for datasets, and mock endpoints for social signals (GitHub, Twitter).",
  },
];

const troubleshoot = [
  {
    problem: "Jobs stuck at 'Initializing pipeline'",
    fix: "The worker isn't running. Start it with `make worker` in a separate terminal.",
  },
  {
    problem: "Worker not processing jobs",
    fix: "Check Redis is running (`docker ps`) and REDIS_URL is correct in `.env`.",
  },
  {
    problem: "No papers found for a topic",
    fix: "OpenAlex/PubMed may rate-limit. Wait a minute or try a different topic.",
  },
  {
    problem: "Database connection errors",
    fix: "Ensure PostgreSQL container is running and DATABASE_URL matches your Docker setup.",
  },
  {
    problem: "Vercel deploy fails",
    fix: "Verify all env vars are set in Vercel project settings and run `npx prisma validate` locally first.",
  },
];

/* ── components ───────────────────────────────────────── */

function CopyBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="bg-zinc-900 text-zinc-100 rounded-xl p-4 text-sm font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-semibold bg-zinc-700 text-zinc-300 opacity-0 group-hover:opacity-100 hover:bg-zinc-600 transition-all"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function Collapse({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-zinc-50 transition-colors text-left"
      >
        <span className="font-semibold text-zinc-900">{title}</span>
        <svg
          className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && <div className="px-5 pb-5 bg-white">{children}</div>}
    </div>
  );
}

/* ── sidebar nav items ────────────────────────────────── */

const sections = [
  { id: "quickstart", label: "Quick Start" },
  { id: "architecture", label: "Architecture" },
  { id: "env", label: "Environment & API Keys" },
  { id: "install", label: "Installation" },
  { id: "usage", label: "Usage" },
  { id: "deploy", label: "Deployment" },
  { id: "troubleshoot", label: "Troubleshooting" },
  { id: "faq", label: "FAQ" },
  { id: "pricing", label: "Pricing" },
  { id: "acknowledgments", label: "Acknowledgments" },
];

/* ── page ─────────────────────────────────────────────── */

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("quickstart");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved && ["dark", "light", "vibrant"].includes(saved)) {
      setTheme(saved);
    }
  }, []);

  const t = THEME_STYLES[theme];

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className={`min-h-screen ${t.mainBg} transition-all duration-500`}>
      {/* Top bar */}
      <header
        className={`sticky top-0 z-30 ${t.header} backdrop-blur border-b transition-colors duration-500`}
      >
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className={`flex items-center gap-2 font-display text-xl font-semibold transition-colors ${t.brand}`}>
              <InkSeal text="HA" size={24} />
              Hypothesis Atlas
            </Link>
            <span className={t.slash}>/</span>
            <span className={`text-sm font-medium ${t.sectionLabel}`}>
              Documentation
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/explore"
              className={`px-3 py-1.5 text-sm font-semibold transition-colors ${t.exploreLink}`}
            >
              Explorer
            </Link>
            <Link
              href="/"
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${t.homeButton}`}
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar */}
        <aside
          className={`hidden lg:block w-56 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r py-6 px-4 transition-colors duration-500 ${t.sidebar}`}
        >
          <nav className="space-y-1">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === s.id ? t.navActive : t.navIdle
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div
          className={`flex-1 min-w-0 px-6 lg:px-12 py-10 space-y-12 transition-colors duration-500 ${t.contentShell}`}
        >
          {/* Quick Start */}
          <section id="quickstart">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">
              Quick Start
            </h2>
            <p className="text-zinc-500 mb-6">
              Get Hypothesis Atlas running on your laptop in under two minutes.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900 mb-1">
                    Clone the repo
                  </p>
                  <CopyBlock code="git clone https://github.com/your-org/hypothesis-atlas.git && cd hypothesis-atlas" />
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900 mb-1">
                    One-command install
                  </p>
                  <CopyBlock code="make laptop-install" />
                  <p className="text-xs text-zinc-500 mt-2">
                    Installs npm deps, creates{" "}
                    <code className="bg-zinc-200 px-1 rounded">.env</code>,
                    starts Docker (Postgres + Redis), pushes Prisma schema.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900 mb-1">
                    Start the app (two terminals)
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <CopyBlock code="make dev" />
                    <CopyBlock code="make worker" />
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Open{" "}
                    <a
                      href="http://localhost:3000"
                      className="text-indigo-600 underline"
                    >
                      http://localhost:3000
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Architecture */}
          <section id="architecture">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">
              Architecture
            </h2>
            <p className="text-zinc-500 mb-6">
              Six layers, each independently replaceable.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {architecture.map((a) => (
                <div
                  key={a.layer}
                  className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow"
                >
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
                    <svg
                      className="w-5 h-5 text-indigo-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={a.icon}
                      />
                    </svg>
                  </div>
                  <p className="font-semibold text-zinc-900 text-sm">
                    {a.layer}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">{a.tech}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Environment & API Keys */}
          <section id="env">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">
              Environment & API Keys
            </h2>
            <p className="text-zinc-500 mb-6">
              Create a{" "}
              <code className="bg-zinc-200 px-1.5 py-0.5 rounded text-sm">
                .env
              </code>{" "}
              file at the project root. The install script creates one with
              defaults, but you should replace placeholder values.
            </p>

            <div className="space-y-4">
              {envVars.map((v) => (
                <div
                  key={v.name}
                  className="bg-white border border-zinc-200 rounded-xl p-5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <code className="font-mono font-bold text-zinc-900">
                      {v.name}
                    </code>
                    {v.required ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                        required
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">
                        optional
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-600 mb-3">{v.desc}</p>
                  <CopyBlock code={`${v.name}="${v.example}"`} />
                  {v.link && (
                    <a
                      href={v.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {v.linkLabel}
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Installation details */}
          <section id="install">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">
              Installation Details
            </h2>
            <p className="text-zinc-500 mb-6">
              What{" "}
              <code className="bg-zinc-200 px-1 rounded text-sm">
                make laptop-install
              </code>{" "}
              does under the hood.
            </p>
            <div className="space-y-3">
              <Collapse title="1. npm install" defaultOpen>
                <p className="text-sm text-zinc-600">
                  Installs all dependencies listed in{" "}
                  <code className="bg-zinc-200 px-1 rounded">package.json</code>
                  . The{" "}
                  <code className="bg-zinc-200 px-1 rounded">postinstall</code>{" "}
                  hook auto-runs{" "}
                  <code className="bg-zinc-200 px-1 rounded">
                    prisma generate
                  </code>
                  .
                </p>
              </Collapse>
              <Collapse title="2. Create .env">
                <p className="text-sm text-zinc-600 mb-2">
                  If no <code className="bg-zinc-200 px-1 rounded">.env</code>{" "}
                  file exists, creates one with local Docker defaults. You must
                  replace{" "}
                  <code className="bg-zinc-200 px-1 rounded">GROQ_API_KEY</code>{" "}
                  with a real key for full LLM features.
                </p>
                <CopyBlock
                  code={`DATABASE_URL="postgresql://postgres:postgres@localhost:5433/hypothesis_atlas?schema=public"\nREDIS_URL="redis://localhost:6379"\nGROQ_API_KEY="your_groq_api_key_here"`}
                />
              </Collapse>
              <Collapse title="3. docker-compose up -d">
                <p className="text-sm text-zinc-600">
                  Starts PostgreSQL (port 5433) and Redis (port 6379) in Docker
                  containers.
                </p>
              </Collapse>
              <Collapse title="4. prisma db push">
                <p className="text-sm text-zinc-600">
                  Synchronises the Prisma schema with the running database
                  without creating migration files.
                </p>
              </Collapse>
            </div>
          </section>

          {/* Usage */}
          <section id="usage">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">Usage</h2>
            <p className="text-zinc-500 mb-6">
              How to use Hypothesis Atlas once it&apos;s running.
            </p>
            <div className="space-y-3">
              <Collapse title="Creating an evidence map" defaultOpen>
                <ol className="list-decimal list-inside text-sm text-zinc-700 space-y-2">
                  <li>
                    Go to{" "}
                    <Link href="/explore" className="text-indigo-600 underline">
                      /explore
                    </Link>{" "}
                    and click a topic in the word cloud.
                  </li>
                  <li>
                    Watch the real-time progress timeline as papers, datasets,
                    and signals are fetched.
                  </li>
                  <li>
                    When complete, explore the knowledge tree by clicking nodes.
                  </li>
                  <li>
                    View methods, findings, disagreements, and open problems in
                    the detail panel.
                  </li>
                </ol>
              </Collapse>
              <Collapse title="Using the Notebook & Topic Copilot">
                <ol className="list-decimal list-inside text-sm text-zinc-700 space-y-2">
                  <li>
                    After a map completes, click the{" "}
                    <strong>Notebook & Topic Copilot</strong> tab.
                  </li>
                  <li>Create pages, write markdown notes (auto-saved).</li>
                  <li>
                    Chat with the AI about research directions and methodology.
                  </li>
                  <li>Add, manage, and converge candidate topics.</li>
                </ol>
              </Collapse>
              <Collapse title="Makefile commands reference">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-200">
                        <th className="py-2 pr-4 font-medium">Command</th>
                        <th className="py-2 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-700">
                      {[
                        ["make install", "Install npm dependencies"],
                        ["make laptop-install", "Full one-command local setup"],
                        ["make infra-up", "Start Docker Postgres + Redis"],
                        ["make infra-down", "Stop Docker services"],
                        ["make db-push", "Push Prisma schema to DB"],
                        ["make db-studio", "Open Prisma Studio"],
                        ["make dev", "Start Next.js dev server"],
                        ["make worker", "Start background worker"],
                        ["make build", "Production build"],
                        ["make lint", "Run ESLint"],
                      ].map(([cmd, desc]) => (
                        <tr key={cmd} className="border-b border-zinc-100">
                          <td className="py-2 pr-4 font-mono text-xs">{cmd}</td>
                          <td className="py-2">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Collapse>
            </div>
          </section>

          {/* Deployment */}
          <section id="deploy">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">
              Deployment
            </h2>
            <p className="text-zinc-500 mb-6">
              Production architecture: Vercel (web) + Railway/Render (worker) +
              managed Postgres & Redis.
            </p>
            <div className="space-y-3">
              <Collapse title="Deploy web app to Vercel" defaultOpen>
                <p className="text-sm text-zinc-600 mb-3">
                  Set these environment variables in Vercel project settings:
                </p>
                <CopyBlock
                  code={`DATABASE_URL=postgresql://...\nREDIS_URL=redis://...\nGROQ_API_KEY=your_groq_api_key_here`}
                />
                <CopyBlock code="make deploy-web" lang="bash" />
              </Collapse>
              <Collapse title="Deploy worker to Railway">
                <ol className="list-decimal list-inside text-sm text-zinc-700 space-y-2">
                  <li>Create a new Railway project from the GitHub repo.</li>
                  <li>
                    Add env vars:{" "}
                    <code className="bg-zinc-200 px-1 rounded">
                      DATABASE_URL
                    </code>
                    ,{" "}
                    <code className="bg-zinc-200 px-1 rounded">REDIS_URL</code>,{" "}
                    <code className="bg-zinc-200 px-1 rounded">
                      GROQ_API_KEY
                    </code>
                    .
                  </li>
                  <li>
                    Railway auto-detects{" "}
                    <code className="bg-zinc-200 px-1 rounded">
                      railway.json
                    </code>{" "}
                    and starts the worker.
                  </li>
                  <li>
                    Confirm logs show:{" "}
                    <em>Worker started and listening for jobs...</em>
                  </li>
                </ol>
              </Collapse>
              <Collapse title="Push schema to production DB">
                <CopyBlock
                  code={`DATABASE_URL="your_production_db_url" npm run db:push`}
                />
              </Collapse>
            </div>
          </section>

          {/* Troubleshooting */}
          <section id="troubleshoot">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">
              Troubleshooting
            </h2>
            <p className="text-zinc-500 mb-6">Common issues and quick fixes.</p>
            <div className="space-y-3">
              {troubleshoot.map((t) => (
                <Collapse key={t.problem} title={t.problem}>
                  <p className="text-sm text-zinc-700">{t.fix}</p>
                </Collapse>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section id="faq">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">FAQ</h2>
            <p className="text-zinc-500 mb-6">Frequently asked questions.</p>
            <div className="space-y-3">
              {faq.map((f) => (
                <Collapse key={f.q} title={f.q}>
                  <p className="text-sm text-zinc-700">{f.a}</p>
                </Collapse>
              ))}
            </div>
          </section>

          {/* Pricing */}
          <section id="pricing">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">Pricing</h2>
            <div className="bg-white border border-zinc-200 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1 border border-zinc-200 rounded-xl p-5">
                  <p className="text-lg font-bold text-zinc-900 mb-1">
                    Self-hosted
                  </p>
                  <p className="text-3xl font-extrabold text-zinc-900">Free</p>
                  <p className="text-sm text-zinc-500 mt-2">
                    Run on your own hardware under the MIT license. No limits.
                  </p>
                </div>
                <div className="flex-1 border-2 border-indigo-500 rounded-xl p-5 bg-indigo-50/50">
                  <p className="text-lg font-bold text-indigo-900 mb-1">
                    Hosted
                  </p>
                  <p className="text-3xl font-extrabold text-indigo-900">
                    $1{" "}
                    <span className="text-base font-medium text-indigo-600">
                      / round
                    </span>
                  </p>
                  <p className="text-sm text-indigo-700 mt-2">
                    Run directly on our server. Each evidence-mapping round
                    costs $1.
                  </p>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mt-4">
                Payment integration uses Stripe. See the{" "}
                <Link href="/pricing" className="text-indigo-600 underline">
                  Pricing page
                </Link>{" "}
                for full plan details.
              </p>
            </div>
          </section>

          <section id="acknowledgments">
            <h2 className="text-3xl font-bold text-zinc-900 mb-2">Acknowledgments and prior art</h2>
            <p className="text-zinc-600 mb-4">
              Atlas's review and planning are original implementations; the projects below informed the design.
              No code or prompts are copied.
            </p>
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Project</th>
                    <th className="text-left px-4 py-2">What it informed</th>
                    <th className="text-left px-4 py-2">License</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[
                    ["Academic Research Skills (Cheng-I Wu)", "Earlier paper-planning integration (V2), replaced by Atlas Plan", "CC-BY-NC 4.0"],
                    ["poldrack/ai-peer-review", "Multiple independent reviewers plus a meta-review", "MIT"],
                    ["FanBroWell/AI-paper-reviewer", "Pre-submission checks on claims, experiments and citations", "MIT"],
                    ["JShi12/AI-literature-review-assistant", "Citations tied to source passages", "MIT"],
                    ["The AI Scientist (Lu et al., 2024)", "Automated review and benchmarking reviews against ICLR", "AI Scientist Source Code License"],
                    ["SelfCheckGPT (Manakul et al., EMNLP 2023)", "Self-consistency for hallucination detection", "MIT"],
                    ["MiniCheck (Tang et al., EMNLP 2024)", "Checking claims against grounding documents", "Apache-2.0"],
                    ["DeBERTa-v3 NLI", "The default entailment model used for claim grounding", "Check the model card"],
                  ].map(([project, informed, license]) => (
                    <tr key={project}>
                      <td className="px-4 py-2 font-medium text-zinc-800">{project}</td>
                      <td className="px-4 py-2 text-zinc-600">{informed}</td>
                      <td className="px-4 py-2 text-zinc-500">{license}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="pt-4 pb-8 text-center text-xs text-zinc-400">
            Hypothesis Atlas &middot; AGPL-3.0 License &middot;{" "}
            <Link href="/" className="underline">
              Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
