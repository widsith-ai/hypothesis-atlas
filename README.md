# Hypothesis Atlas

Hypothesis Atlas is a multi-domain evidence mapping platform that automatically discovers, analyzes, and visualizes scientific and technical knowledge from peer-reviewed papers, datasets, and social signals — then carries that research through planning and peer review without leaving the app.

It includes a full **Academic Paper Pipeline** built around **Atlas Plan**, an in-app planning tool that drafts a contribution statement, claims, an evidence map grounded in your own sources, and an outline, directly from your research; a **Peer Review** committee of reviewer agents; a **persistent Research Graph** that accumulates across every run; and real **accounts**, so research and plans belong to the person who made them.

## Contents

- [Demo Video](#demo-video)
- [Features](#features)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Acknowledgments and prior art](#acknowledgments-and-prior-art)
- [Deployment](#deployment)
- [Development](#development)
- [Version History](#version-history)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Demo Video

[![Watch the V1 demo](https://img.youtube.com/vi/5io6ZrWCPIw/maxresdefault.jpg)](https://youtu.be/5io6ZrWCPIw)

▶️ V1 — Evidence Mapping & Knowledge Tree

[![Watch the V2 demo](https://img.youtube.com/vi/V8uTbUVssmI/maxresdefault.jpg)](https://youtu.be/V8uTbUVssmI)

▶️ V2 — Paper Pipeline + ARS Integration

---

## Features

### Evidence Mapping
- Area/industry selector (General · Biology · Chemistry · Technology · Finance) with per-domain word clouds
- Custom topic search: type 2–5 words → Groq generates a live keyword cloud centered on your topic
- **Explore toggle**: switch the word cloud to subscription mode — clicking a word subscribes to weekly papers instead of launching a research run
- Real-time knowledge tree built from peer-reviewed papers, datasets, and social signals
- **Redesigned Explore header**: one quiet ghost-style nav (brand + My Research · Research Graph · Write Paper · Peer Review · Docs) with color only in the icons — the word cloud stays the page's primary call to action
- **Node-aware Explore Papers**: click any tree node to scope paper fetching to that node's topic; results show node-connection badges
- Hub-and-spoke Paper Map: Research hub at center, weighted lines to each paper, no visual clutter between peers
- Paper Compare Mode: pick 2 papers → Claude generates methodology differences + research gap analysis
- Node-level detail: methods, findings, disagreements, open problems

### Weekly Paper Subscription
- Subscribe to any topic (from the word cloud or Knowledge Tree) for a weekly digest of the latest papers
- Choose delivery time (8 AM / 12 PM / 6 PM / 9 PM) and number of papers (5 / 10 / 20) per week
- First digest sent immediately on subscribe; subsequent digests delivered every Monday via Vercel Cron
- Papers sourced from OpenAlex + PubMed, filtered to the last 2 years, ranked by relevance + recency
- One-click unsubscribe link in every email; branded confirmation page

### Notebook & Topic Copilot
- AI-assisted brainstorm with streaming responses
- Converge to Top 3 research ideas from your exploration
- Export brainstorm as Markdown

### Accounts & Ownership
- **Real sign-in**: email/password accounts (bcrypt-hashed), not the placeholder it once was
- **Self-hosted stays anonymous by default**: accounts are opt-in unless the deployment sets `REQUIRE_AUTH=true` (the hosted tier) — a self-hosted instance works fully without anyone signing in
- **Ownership, not a wall**: a job or bold idea created while signed in is tied to that account; anonymous work stays fully open, exactly as before accounts existed
- **Claim flow**: sign in later and claim research you made anonymously, so nothing is orphaned by signing up after the fact
- **Account page** (`/account`): profile (name, avatar initials, member since, plan), billing & usage (real counts of your jobs and bold ideas — no hosted billing is live yet, and the page says so rather than showing a fake price), and settings (change name, change password)
- **My Research** shows "Yours" / "Unclaimed" badges once you're signed in, so shared or anonymous entries are never mistaken for your own

### Paper Pipeline
Three steps: **Setup → Plan → Experiments**.

- **Setup** — pick an idea (from your converged ideas, knowledge tree nodes, or the raw topic) and collect papers (search OpenAlex + PubMed, or import from the Paper Map) in one place; both feed directly into the plan
- **Plan** — **Atlas Plan** drafts a contribution statement, claims to support, an evidence map, a method/data plan, threats to validity, and an outline, in one pass, grounded against the papers collected on Setup plus the job's own peer-reviewed sources
  - Every section is editable in place — rewrite the contribution, add or edit a claim, adjust the outline — and your edits save automatically
  - An edited claim is marked **"edited – not re-checked"** until you re-check it; re-checking re-grounds it against the same sources without regenerating the whole plan
  - Each claim's grounding badge (grounded / unsupported / contradicted) expands to show the actual source passage it was checked against and which method decided it (overlap / NLI / LLM judge) — the same verification pipeline Peer Review uses
  - Reference Document: attach a `.md` draft or notes for the planner to read as context
  - **Export** — a structured, plain-Markdown context file (contribution, claims with their badges, method plan, threats, outline) that works with any editor or agent, not tied to one plugin
- **Experiments** — design an experiment for the plan (hypothesis, variables, metrics, expected results) and verify quantitative claims

### Peer Review
- Standalone **Peer Review session** at `/review` (nav button on Explore, next to Write Paper)
- A committee of three reviewer agents — methodology & novelty, venue fit & impact, statistical rigor & reproducibility — plus an optional custom reviewer with your own name and persona
- Publisher/venue picker; paste a **call-for-papers URL** and the app scrapes the page to extract the venue's real review criteria so agents grade against them
- Paper source defaults to your **current Write Paper draft**, or upload any `.pdf` / `.txt` / `.md`
- Final verdict panel: averaged 1–10 scores across novelty / soundness / clarity / significance / overall, consensus recommendation (accept → reject), and an editor-style meta-review — plus full per-agent reviews with strengths, weaknesses, and questions
- Results cached in localStorage; re-run or clear anytime

### Persistent Research Graph
- **Cross-run knowledge graph** at `/graph` (nav button on Explore): every completed run automatically syncs its topics, hypotheses, methods, evidence, and gaps into a single persistent graph in PostgreSQL — your research memory across all sessions
- **Deduplicated by design**: entities are keyed by (type, normalized label), so the same concept found in different runs converges onto one node; papers collapse by title; `POST /api/graph/dedupe` merges any stragglers (user-created entities always win the merge)
- **Ask across all runs**: type "what have I learned about X" and Groq synthesizes an answer grounded in the matched entities, their connected context, and the supporting papers — with inline citations and a key-takeaways / open-gaps breakdown
- **Full graph editing**: create, edit, and delete entities and edges; connect any two entities with typed relationships (motivates / provides / uses method / contradicts / reveals / related to / notes on)
- **Origin tracking**: run-derived entities refresh on every re-sync; anything you create or edit is marked user-created/user-edited (white ring on the canvas) and is never overwritten
- **Provenance**: every entity carries its supporting papers — click a node to see the source list and jump back to the originating run
- **Interactive canvas**: force-directed layout, type filter chips with counts, entity search, wheel zoom / drag pan, and a per-node inspector with inline editing
- **Notes live in the graph**: job notes are stored as graph entities (not localStorage) with automatic one-time migration of existing local notes; they feed cross-run queries like everything else

### Research Management
- `/jobs` page listing all past research runs with status, source counts, and actions
- Per-job: View Research · Write Paper · Delete
- One-click navigation back to Knowledge Tree, Notebook, or Paper Map from the paper session

---

## Quick Start

There are two ways to run this locally — pick one.

### Option A: Docker (two commands, no local Node setup)

```bash
make image   # build the app image
make run     # start Postgres, Redis, the web app, and the worker
```

Needs a `.env` — copy `.env.example` to `.env` and fill it in first. Open http://localhost:3000. Stop with `make stop`.

### Option B: local dev (hot reload while you edit)

```bash
make laptop-install
```

Then start the app and worker in two terminals:

```bash
make dev
make worker
```

Open http://localhost:3000

#### Manual setup, if you'd rather not use `make`

1. Install dependencies: `npm install`
2. Create `.env` with:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5434/hypothesis_atlas?schema=public"
   REDIS_URL="redis://localhost:6379"
   GROQ_API_KEY="your_groq_api_key_here"
   ANTHROPIC_API_KEY="sk-ant-..."        # required for Paper Compare Mode
   RESEND_API_KEY="re_..."               # required for weekly digest emails
   NEXT_PUBLIC_APP_URL="http://localhost:3000"  # used in email unsubscribe links
   NEXTAUTH_SECRET="generate with: openssl rand -base64 32"  # required for real login/signup
   NEXTAUTH_URL="http://localhost:3000"
   # REQUIRE_AUTH="true"  # leave unset for self-hosted/anonymous use (the default)
   ```
3. Start infrastructure: `make infra-up`
4. Push schema: `make db-push`
5. Start app and worker: `make dev` and `make worker`

> `ANTHROPIC_API_KEY` is only required for Paper Compare Mode. `GROQ_API_KEY` powers Atlas Plan and the rest of the app's LLM features. `NEXTAUTH_SECRET`/`NEXTAUTH_URL` are required for sign-in to work at all; `REQUIRE_AUTH` only matters if you want to *require* an account (the hosted tier) rather than make one optional (self-hosted default).

---

## Usage

1. Visit `/explore`, choose a domain, and click a term in the word cloud
2. Watch the real-time evidence gathering in the Knowledge Tree
3. Open the **Notebook** tab → brainstorm → **Converge to Top 3** ideas
4. Click **Write Paper** in the tab bar → **Setup**: pick an idea and collect papers → **Plan**: draft, edit, and re-check claims with Atlas Plan → **Experiments**: design and verify an experiment for it
5. Click **Peer Review** next to Write Paper → your current plan is loaded by default → a committee of reviewer agents grades it against your target venue
6. Optionally export your research context as Markdown and continue writing in any editor or agent
7. Open **Research Graph** (`/graph`) any time → every run's knowledge accumulates into one persistent, duplicate-free graph (the same concept across runs converges onto one node) → ask "what have I learned about X across all my runs" → edit or extend the graph yourself
8. Sign in (top-right corner) if you want your research tied to an account — optional on a self-hosted instance, required on the hosted tier

### Paper Pipeline flow

```
/explore  →  /job/[id]  →  /job/[id]/paper
              (Knowledge Tree, Notebook, Paper Map)
                                ↓
                   1. Setup    (idea + papers)
                   2. Plan     (Atlas Plan — draft, edit, re-check)
                   3. Experiments
                                ↓
                        Export context (Markdown)
```

---

## Acknowledgments and prior art

Atlas's review and planning are original implementations; the projects below informed the design. No code or prompts are copied.

| Project | What it informed | License |
|---|---|---|
| Academic Research Skills (Cheng-I Wu) | Earlier paper-planning integration (V2), replaced by Atlas Plan in V3.0.0.1 | CC-BY-NC 4.0 |
| [poldrack/ai-peer-review](https://github.com/poldrack/ai-peer-review) | Multiple independent reviewers plus a meta-review | MIT |
| [FanBroWell/AI-paper-reviewer](https://github.com/FanBroWell/AI-paper-reviewer) | Pre-submission checks on claims, experiments and citations | MIT |
| [JShi12/AI-literature-review-assistant](https://github.com/JShi12/AI-literature-review-assistant) | Citations tied to source passages | MIT |
| [The AI Scientist](https://arxiv.org/abs/2408.06292) (Lu et al., 2024) | Automated review and benchmarking reviews against ICLR | AI Scientist Source Code License |
| [SelfCheckGPT](https://arxiv.org/abs/2303.08896) (Manakul et al., EMNLP 2023) | Self-consistency for hallucination detection (`applySelfConsistency`) | MIT |
| [MiniCheck](https://arxiv.org/abs/2404.10774) (Tang et al., EMNLP 2024) | Checking claims against grounding documents | Apache-2.0 |
| [DeBERTa-v3 NLI](https://huggingface.co/MoritzLaurer/DeBERTa-v3-large-mnli-fever-anli-ling-wanli) | The default entailment model in `review-grounding.ts` | Check the model card |

If code is ever copied from an MIT/Apache project, its license notice will be listed in `THIRD_PARTY_NOTICES.md`.

---

## Deployment

**Self-hosting on one machine**: `make image && make run` (see Quick Start) is a complete deployment by itself — Postgres, Redis, the app, and the worker, all in Docker. Set `NEXTAUTH_URL` to your actual domain; leave `REQUIRE_AUTH` unset to keep it open to anonymous use.

**Production with managed services** (what the hosted tier runs):

- **Web app**: Deploy to Vercel with env vars set (including `NEXTAUTH_SECRET` and `NEXTAUTH_URL` — login returns a generic "server configuration" error without them)
- **Worker**: Deploy to Railway/Render (runs `npm run worker`)
- **Database**: Managed PostgreSQL (Neon/Supabase)
- **Queue**: Managed Redis (Upstash)

Push schema to production: `DATABASE_URL="prod_url" npm run db:push` — this includes the `User`/`Account`/`Session` tables accounts need; forgetting it after a fresh deploy produces the same "server configuration" error as a missing `NEXTAUTH_SECRET`, from a different cause.

---

## Development

```bash
# Database studio
npm run db:studio

# Reset database — targets just postgres/redis; `docker-compose up -d` with no
# service names also tries to start app/worker, which need `make image` first
docker-compose down -v && docker-compose up -d postgres redis && npm run db:push
```

---

## Version History

### V3.0.0.2 — Paper pipeline redesign around Atlas Plan

Five steps became three: Select Idea and Find Papers merged into **Setup**; the separate Paper Outline step (an ungrounded, disconnected Groq prompt) was removed in favor of Atlas Plan's own outline mode. Papers collected on Setup now actually feed the plan instead of staying in `localStorage` unused. Atlas Plan's output is editable in place and re-groundable after an edit — a claim you rewrite is marked "edited – not re-checked" until you re-check it, rather than silently keeping a stale verdict — and each grounding badge expands to show the source passage it was checked against. Step bar and section headings moved onto the ink design system. See #64.

### V3.0.0.1 — Replaced the ARS integration with Atlas Plan

Replaced the ARS integration with Atlas Plan; the review engine was already independent of ARS and is unchanged. Atlas Plan is an original, clean-room implementation — see "Acknowledgments and prior art." Preset peer-review personas are now labeled by role instead of invented names (e.g. "Methodology & Novelty Reviewer"). See #63.

### V3.5 — Ink-Wash Redesign, One-Command Docker Run & Hosted Pricing Update

- **Ink-wash visual redesign** across the landing page, Explorer, job pages, My Research, Bold Idea, and the account/pricing/docs pages: a shared palette (`lib/inkPalette.ts`), ink-styled components (`components/ink/`), brush-style accents — in English, not the Chinese seals/inscriptions an earlier pass used, which read as unfamiliar characters to readers who don't use them
- **One-command Docker run**: `make image` builds the app, `make run` starts Postgres, Redis, the app, and the worker — a complete local deployment in two commands, with secrets injected at run time rather than baked into the image
- **Hosted pricing corrected**: the hosted tier is $19/month (unlimited runs, billed monthly, cancel anytime), not the old $1-per-round pay-per-use model; the self-hosted license badge now says AGPL-3.0, matching `LICENSE`, instead of the stale MIT label
- Landing page: a compact theme dropdown instead of three separate buttons, fixed to no longer overlap the account widget at any screen width

### V3.4 — Account Profile, Billing & Usage, Settings

- **Account page** (`/account`): three tabs — Profile (avatar initials, name, email, member-since date, plan, real usage counts), Billing & Usage (reads the stored plan field rather than hardcoding "Free"; says plainly that no hosted billing is live yet instead of showing a fake upgrade button), and Settings (edit display name, change password)
- **Ownership display**: My Research marks each job and bold idea "Yours" or "Unclaimed" — computed server-side, so no other account's id is ever sent to the browser
- Reachable from a dropdown behind the account name in the top-right corner, alongside Sign out

### V3.3 — Real User Accounts

- **Real sign-in**: email/password accounts with bcrypt-hashed passwords, replacing a sign-in form that previously just faked success after a timeout
- **Self-hosted-vs-hosted flag** (`REQUIRE_AUTH`): unset by default so a self-hosted instance stays fully usable anonymously; the hosted tier sets it to require an account before starting new research
- **Ownership, added without breaking anonymous use**: a job or bold idea created while signed in is tied to that account; an unowned one stays exactly as open as before accounts existed — nothing about anonymous usage changed
- **Claim flow**: a signed-in user can attach a job or bold idea they made anonymously to their account after the fact, so signing up later doesn't orphan earlier work
- Ownership checks cover the core job/bold-idea routes and their list endpoints; the nested sub-resource routes (notes, notebook, chat, etc.) do not yet check ownership — tracked separately, not yet closed

### V3.2 — License Switch: MIT → AGPL-3.0 (dual licensing)

- Core is now licensed under **GNU AGPL-3.0**: free for everyone including commercial use, but anyone hosting a modified version as a network service must offer users the complete corresponding source
- **Commercial licenses** available for embedding/hosting without copyleft obligations — see `COMMERCIAL-LICENSE.md`
- **DCO sign-off** required on all contributions (`git commit -s`) to keep the copyright chain sole-owned — see `CONTRIBUTING.md`
- All releases before the `v3.2.0` tag remain **MIT-licensed forever**; the switch point is tagged `v3.2.0`

### V3.1 — Graph Deduplication & Explore Header Redesign

- **No more duplicate topics/entities**: every synced entity now uses a label-based global sync key (`g:type:normalized-label`) instead of per-job keys, so the same concept discovered in different runs converges onto one node via the existing upsert
- **`dedupeGraph()` merge pass**: groups entities by (type, normalized label) and folds each group onto a canonical node — edges and paper links are re-pointed, duplicates deleted (cascades clean up the originals); user-created entities always win the merge, and groups that are purely user-created are left alone as deliberate duplicates; notes are exempt
- **Dedup runs automatically**: every `syncJobGraph` finishes with the merge pass, and `POST /api/graph/dedupe` can be called anytime to clean up stragglers (idempotent)
- **Paper deduplication**: source rows are per-run (papers are re-fetched each run), so the graph and query APIs now collapse sources by normalized title when serializing — no repeated titles in inspector source lists or query citations
- **Explore header redesigned** (UX pass): the old header mixed six button styles with three competing gradients; it's now a quiet ghost-style nav — brand mark (links home) + My Research · Research Graph · Write Paper · Peer Review · Docs, one consistent hover style, color only in the icons — followed by a clean page-identity block ("Topic Explorer" + subtitle), keeping the word cloud as the page's primary call to action; all three themes verified

#### New API routes (V3.1)

| Route | Method | Purpose |
|---|---|---|
| `/api/graph/dedupe` | POST | One-shot graph deduplication: normalizes sync keys, merges duplicate groups (returns `{normalized, groups, merged}`) |

### V3.0 — Persistent Research Graph (the infrastructure spine)

- **`GraphEntity` / `GraphEdge` / `EntitySource` Prisma models** (PostgreSQL): a cross-project, cross-domain research graph of hypotheses, methods, evidence, gaps, topics, and notes — persisted in the database instead of per-job localStorage
- **Automatic sync**: every completed run (and every uploaded-paper job) syncs its knowledge tree into the graph — root topic, hypotheses, methods, findings as evidence, disagreements, and open problems — via an idempotent `syncJobGraph` keyed on `syncKey`; the first visit to `/graph` backfills all past completed runs
- **`/graph` page**: force-directed visualization of the whole graph with type-coloured nodes (topic / hypothesis / method / evidence / gap / note), type filter chips with live counts, entity search, wheel zoom + drag pan, per-type edge arrows and a relationship legend
- **Full editing**: add entities (optionally linked to the selected node with a typed edge), inline edit of label/content, delete entities, create/delete edges between any two entities via the inspector's connect-to-entity search
- **Origin protection**: entities synced from runs are marked *run-derived* and refresh on re-sync; user-created and user-edited entities (white ring on the canvas) are never overwritten by a re-sync
- **Provenance**: `EntitySource` links every entity to its supporting papers; the inspector lists them and links back to the originating run
- **Cross-run query** ("what have I learned across all my runs about X"): matches entities case-insensitively across label + content, expands to the 1-hop neighbourhood, and Groq synthesizes a grounded answer with inline entity citations, key takeaways, and open gaps — matched nodes are highlighted on the canvas
- **Notes migrated into the graph**: all notes APIs (`/api/jobs/[id]/notes/*`) now read/write graph entities; existing localStorage notes migrate automatically on first load per job (one-time flag), and notes participate in cross-run queries like any other entity

#### New API routes (V3.0)

| Route | Method | Purpose |
|---|---|---|
| `/api/graph` | GET | Full graph (entities + edges + stats); auto-backfills from completed runs when empty |
| `/api/graph/entities` | POST | Create a user entity, optionally with an edge to an existing one |
| `/api/graph/entities/[id]` | PATCH / DELETE | Edit (flips run-derived → user-edited) or delete an entity |
| `/api/graph/edges` | POST | Create a typed edge between two entities |
| `/api/graph/edges/[id]` | DELETE | Delete an edge |
| `/api/graph/sync` | POST | Re-sync one job (`{jobId}`) or all completed jobs |
| `/api/graph/query` | POST | Cross-run natural-language query with Groq synthesis + citations |
| `/api/jobs/[id]/notes` | GET / POST | Notes list / create — now backed by graph entities |
| `/api/jobs/[id]/notes/[noteId]` | PATCH / DELETE | Edit / delete a note entity |
| `/api/jobs/[id]/notes/migrate` | POST | One-time bulk import of legacy localStorage notes |
| `/api/jobs/[id]/notes/replace` | POST | Full notes replace (delete missing, upsert incoming) |

### V2.5 — Standalone Peer Review Session & Explore Upload Control

- **Standalone Peer Review session** at `/review`: a committee of three reviewer agents (methodology & novelty, venue fit & impact, statistical rigor & reproducibility) plus an optional custom reviewer with a user-defined name and persona
- **Venue-aware grading**: pick a publisher/venue preset, or paste a call-for-papers URL — the app scrapes the page, extracts the venue's stated review criteria and focus, and every agent reviews against them
- **Flexible paper source**: defaults to your current Write Paper draft (latest ARS chat), or upload any `.pdf` / `.txt` / `.md` for text-only extraction
- **Final verdict panel**: averaged 1–10 scores across five criteria, consensus recommendation, editor-style meta-review, and full per-agent reviews — cached in localStorage
- **Upload control moved**: the "Start from your own paper" section is gone; a compact upload icon button now sits in the topic search row before Search, with a "Start from your own paper" hover tooltip
- **Visual polish**: Explore heading gradients redesigned across all three themes for full letter visibility; Peer Review recolored emerald→teal to distinguish it from Write Paper
- Step 6 (review) removed from the Write Paper pipeline — review now lives entirely on `/review`

#### New API routes (V2.5)

| Route | Method | Purpose |
|---|---|---|
| `/api/paper-review` | POST | Run reviewer-agent committee + meta-review (moved from `/api/jobs/[id]/paper-review`) |
| `/api/jobs/upload` | POST | Now supports `textOnly=1` for paper text extraction without creating a job |

### V2.4 — Comprehension Quiz, UI Polish & Prisma Pool Fix

- **"Test Your Understanding" quiz** on every knowledge tree node: click the button in NodeDetail to generate 4 multiple-choice questions grounded in the actual papers and findings discovered for that node — powered by Groq; includes per-question feedback and a score summary screen
- **Paper Quiz** in the Paper Pipeline: a "Quiz" button in the step tabs bar generates 4 comprehension questions drawn from the job's real evidence — root node synthesis, child subtopic findings, and linked peer-reviewed paper abstracts; slide-in panel with the same question flow and scoring
- Questions are strictly grounded in the actual evidence: a dedicated system prompt instructs Groq never to introduce concepts outside the provided content block; each finding, method, paper, and subtopic is labelled (F#/M#/P#/S#) and every question must cite a specific label — eliminating hallucinated generic questions
- **Subscribe button** on the Explore page replaced with a compact bell icon (same action; saves space in the selected-topic card)
- **"Explore Papers" button** in the Knowledge Tree simplified to "Explore"
- **Prisma P2024 fix**: `prisma.ts` now appends `connection_limit=5&pool_timeout=30` to `DATABASE_URL` at startup (if not already set), preventing connection pool exhaustion under dev hot-reloads and concurrent requests

#### New API routes (V2.4)

| Route | Method | Purpose |
|---|---|---|
| `/api/nodes/[nodeId]/questions` | GET | Generate 4 MCQs from node content + linked paper snippets |
| `/api/jobs/[id]/questions` | POST | Generate 4 MCQs from job evidence (root node, subtopics, sources) |

### V2.3 — Node-Aware Explore Papers & Weekly Paper Subscription

- **Node-aware Explore Papers** (Knowledge Tree): clicking a tree node sets it as the active search topic (shown as an indigo chip in the toolbar); "Explore Papers" fetches papers ranked specifically for that node's label rather than the job root topic
- **Explore toggle** (word cloud page): a pill toggle (default OFF) switches the word cloud from "launch research" mode to "subscribe" mode — clicking a word in Explore mode shows a subscribe card instead of navigating to a job
- **Weekly paper subscription**: Subscribe button in the Knowledge Tree toolbar and the Explore page opens a popup with:
  - Topic chip (auto-filled from selected node or searched term)
  - Email input
  - Papers per week selector: 5 / 10 / 20
  - Delivery time picker: 8 AM / 12 PM / 6 PM / 9 PM (every Monday)
- **Immediate first digest**: on subscribe, the API fetches the top N ranked papers for the topic right now and emails them instantly via Resend — same styled HTML digest as the weekly version
- **Weekly digest cron**: `vercel.json` registers a Vercel Cron (`0 * * * 1` — every hour on Mondays) that calls `GET /api/cron/weekly-digest`; the route matches subscriptions by delivery time (UTC hour), fetches fresh papers, and sends the weekly digest email
- **One-click unsubscribe**: every digest email contains a tokenised unsubscribe link (`/api/subscriptions/unsubscribe?token=...`) that deletes the subscription and redirects to a branded `/unsubscribed` confirmation page (handles success, already-used, and error states)
- **Latest papers only**: OpenAlex and PubMed queries are now filtered to the last 2 years (`currentYear-2` to `currentYear`) with `sort=publication_date:desc`; recency scoring window tightened from 10 years to 2 years so 2026 papers rank first
- **Email shows exact subscribe time**: the digest banner includes the timestamp when the user clicked Subscribe and the paper year range (e.g. "2025–2026")
- **`PaperSubscription` model**: stores `email`, `topic`, `frequency`, `deliveryTime`, `unsubToken` (unique cuid for unsubscribe links), `createdAt`
- **Shared `fetchTopicPapers()` utility** (`src/lib/fetchTopicPapers.ts`): extracted from the search-papers route so both in-app Explore Papers and email digests use the same ranking logic

#### Required environment variables (new in V2.3)

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key for sending digest and confirmation emails |
| `NEXT_PUBLIC_APP_URL` | App base URL used in email links (e.g. `http://localhost:3000` for dev, your Vercel URL for prod) |

### V2.2 — Notes System, Find Papers & Knowledge Tree Paper Exploration

- **Persistent notes system**: all notes stored in `localStorage` per job, synced across tabs via `atlas:notes-update` event; shared by NotesPanel, NotesTab, PaperMap compare, and Topic Copilot
- **Floating NotesPanel**: slide-in drawer (bottom-right) with entry list, type badges (session / manual / comparison / insight), expand/collapse, delete, textarea + Add Note, Export .md
- **Dedicated Notes tab**: 2-column layout — entry timeline left, detail viewer / composer right; session memory card shows topic + entry counts; quick-capture labels; inline edit & delete
- **Paper compare → notes**: Save to Notes button in compare panel writes a structured markdown comparison directly into the session notes
- **Topic Workspace redesign**: removed Pages sidebar; inline action toolbar (Write Paper · Export .md · Converge · Save to Notes) replaces floating bottom-right buttons; prominent "Type a topic and press Enter…" input at top of sidebar
- **Write Paper — Find Papers tab**: editable description field (defaults to job topic), "Explore Papers" button searches OpenAlex + PubMed, results ranked by relevance + recency (65 / 35 blend)
- **Knowledge Tree — Explore Papers**: new button in toolbar fetches related papers and displays them below the tree as a card grid; each card shows a **node-connection badge** (colour-matched to tree depth) indicating which tree node the paper connects to
- **Relevance + recency ranking**: title match (×4) + abstract match (×1) + title-start bonus (×3), blended with a 10-year recency window; applies to all paper search endpoints
- **Layout fixes**: NotebookTab and NotesTab now fill full viewport width; floating Write Paper / Export buttons moved to inline toolbar
- Write Paper: floating Notes panel + ← Back button in header

### V2.1 — Smart Explore, Hub-Spoke Paper Map & Paper Comparison
- **Custom topic search**: type 2–5 words, click Search → Groq generates a live word cloud with your keyword pinned at center and 16 related terms around it
- **Area / industry selector**: General (cross-domain, default), Biology, Chemistry, Technology, Finance — word cloud updates per domain; General triggers LLM keyword generation
- **Hub-and-spoke Paper Map**: Research hub at center with weighted lines to every paper (line width & opacity = knowledge-node count); no peer-to-peer lines cluttering the graph
- **Paper Compare Mode**: select any 2 papers → Claude returns a structured comparison of (1) methodology differences and (2) research gaps, with a combined-opportunity insight
- **Richer paper detail panel**: full abstract, publication year, stats row, "Read Paper ↗" button, venue + year on related papers
- Pricing: free & open-source; $100 / paper for hosted workflow with managed tokens

### V2 — Paper Pipeline + ARS Integration
- In-app Socratic planning chat integrating the Academic Research Skills (ARS) Claude Code plugin — replaced by the original Atlas Plan in V3.0.0.1; see "Acknowledgments and prior art"
- Idea selection from converged ideas, knowledge tree nodes, or raw topic
- Paper Outline generation via Groq (IMRaD structure)
- `/jobs` research management page: list, view, write, delete all past runs
- Knowledge Tree, Notebook, and Paper Map accessible directly from the paper session

### V1 — Evidence Mapping & Knowledge Tree
- Word cloud topic explorer across Biology, Chemistry, Technology, and Finance
- Real-time knowledge tree built from peer-reviewed papers, datasets, and social signals
- Reliability-tiered Paper Map (SVG network graph)
- Notebook & Topic Copilot with AI-assisted brainstorm and Converge to Top 3

---

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md` for responsible disclosure.

---

## License

### Hypothesis Atlas

Dual-licensed — your choice of **GNU AGPL-3.0** (copyleft; see `LICENSE`) or a **commercial license** for use without copyleft obligations (see `COMMERCIAL-LICENSE.md`). All releases before the `v3.2.0` tag remain MIT-licensed forever. Contributions require DCO sign-off — see `CONTRIBUTING.md`.

### Enterprise (`ee/`)

Enterprise features (SSO, role-based access, audit logs, data retention) live in [`ee/`](ee/) and are source-available under the [Widsith Enterprise License](ee/LICENSE.md) (draft — pending legal review): you can read and audit the code, but production use requires a paid subscription and license key. The core outside `ee/` stays AGPL-3.0 forever; enterprise features are additive — core functionality will never move behind pay.

V2 of this app (before the `V3.0.0.1` tag) integrated the [Academic Research Skills](https://github.com/Imbad0202/academic-research-skills) plugin, originally created by **Cheng-I Wu** and licensed under **CC-BY-NC 4.0**. That integration was removed in V3.0.0.1 and replaced with Atlas Plan, an original implementation — see "Acknowledgments and prior art" above. Releases tagged before `V3.0.0.1` keep their ARS attribution and remain subject to CC-BY-NC 4.0 for that integrated code.
