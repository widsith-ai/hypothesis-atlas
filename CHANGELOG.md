# Changelog

All notable changes to Hypothesis Atlas. Issue and PR numbers refer to [widsith-ai/hypothesis-atlas](https://github.com/widsith-ai/hypothesis-atlas).

## 1.0 — First official release

- **Monet painting style** as the new default, with ink wash kept as a selectable style (#87):
  - New files: `src/lib/artStyle.ts` (the setting), `src/lib/palette.ts` (colours that switch with the style) and `src/app/paint.css` (component styles for both looks)
  - The three backgrounds are in `public/monet/`
- **Bring your own model key** across nine providers (#88)
- **Monet glass**: the painting shows through every panel; text colours redesigned for contrast (#90)
- **Editions**: `ATLAS_EDITION=hosted|self-hosted` (defaults from `REQUIRE_AUTH`); self-hosted users whose server has a model key are never asked for one (#91)
- **Graveyard** page removed from 1.0 (#92)
- **Account bar**: the account widget renders inside each page's top bar instead of floating over it (#93)
- **License & support**: free open source, with a collaboration / enterprise contact (#95)
- **Password reset**: emailed one-time links and `/reset-password` (#96)
- **Explorer first**: `/` opens straight on the word cloud; the style and scene picker lives in Explorer's top bar; Explorer asks for a model key once when one is needed (#97)
- **Official README**, with a Monet hero card, screenshots, a painted pipeline and a complete configuration reference; this changelog split out of it (#100, #101)
- `package.json` version set to `1.0.0`

## Development milestones (before 1.0)

The entries below are the numbered development milestones that led up to 1.0. Their "V" numbers are milestone names, not release versions.

## V3.0.5 — Run Provenance

`ProgressEvent` already logged job-level stage events ("fetch_papers: started"); nothing logged the individual agent steps within a stage — the exact prompt sent, which model answered, which tools were called, what came back — or attached that to the records a run produced. Every LLM call in the evidence-mapping pipeline now generates and logs a seed (actually sent to Groq, so the call is replayable), and every tool-call batch (OpenAlex+PubMed, GEO, social) logs which tools were called; both attach the resulting log entry to the nodes/sources they produced. A new **Run Provenance** tab on the job page shows a card per logged step — model, seed, tools, prompt, and a "human-edited since" badge when a record it produced was later hand-edited — plus a one-click export of the whole run as a reproducibility bundle (model calls with seeds, dataset/paper versions, full log). See #58.

#### New API routes (V3.0.5)

| Route | Method | Purpose |
|---|---|---|
| `/api/jobs/[id]/run-log` | GET | A run's full step-by-step log, each step flagged `humanEdited` if one of its records was later hand-edited |
| `/api/jobs/[id]/reproducibility-bundle` | GET | Downloadable JSON bundle: every model call with its seed, dataset/paper versions, the full run log |

## V3.0.3 — Negative Results

Every hypothesis implicitly looked "open" — there was no way to record that one was tested and failed, or abandoned. You can now record an **outcome** (result, failure mode, effect, conditions) against any hypothesis; its status — proposed → grounded → under test → supported / refuted / inconclusive, or abandoned with a required reason — is computed from its outcomes automatically, and a single refuted outcome always outweighs any number of supporting ones. A new **Graveyard** page (`/graveyard`, linked from Explore and the graph header) lists refuted and abandoned hypotheses, filterable by method and dataset; method entities in the graph inspector automatically collect the known failure modes of hypotheses tested with them. Outcomes are private by default, with one-click sharing (now available on any entity). See #56. *(The Graveyard page and `/api/graph/graveyard` are not part of version 1.0; they're preserved on the `graveyard-archive` branch — #92.)*

#### New API routes (V3.0.3)

| Route | Method | Purpose |
|---|---|---|
| `/api/graph/outcomes` | POST | Record an outcome against a hypothesis (creates the outcome entity + its `tests` edge in one call) |
| `/api/graph/entities/[id]` | PATCH | Gained `visibility` (one-click sharing) and `abandonedReason` (set to abandon with a reason; `null` to un-abandon) |

## V3.0.2 — Claim Record & Verification Gate

Claims used to flow into the graph with no check against their source text. Every finding and disagreement a run produces is now run through a `verifyClaim()` gate (pulled out of the peer-review grounding pipeline so it works against arbitrary source text, not just a declared-span PDF) before being written: sanitize → split into single claims → check inline citations → ground each sub-claim against its sources. A claim that fails the check is **never dropped** — it's written and badged (unsupported / contradicted / unverified) instead. `provides` was renamed `supports` (evidence → hypothesis is the correct direction) and gained `tests` / `uses_dataset` / `derived_from` / `transferred_from` / `replicates` as edge types; entities and edges both carry producer and verification stamps, and source links can now exact-match a passage (`start`/`end`/`text`) and record `role: "contradicting"`, not just `"supporting"`. `atlas.claim/v1`, the JSON Schema for a claim record, is published under its own MIT license in `schemas/`, separate from this repo's AGPL license. See #55.

## V3.0.1 — Unblock the Graph: Workspace Isolation & Visibility

Two different accounts' graph entities sharing the same type and label used to collide into a single record — nothing under `/api/graph` checked who was asking. Every `GraphEntity`/`GraphEdge` now belongs to a workspace (your account, or a shared `default` workspace for anonymous/self-hosted use) and carries a visibility (private by default, widenable to shared/public); every `/api/graph` route enforces it on every read and write, and `Job.userId` ownership is enforced on the routes that sync or back-fill a run into the graph. Unowned ("default" workspace) data stays exactly as open as it was before accounts existed — only another account's private data is now actually private. See #54.

## V3.0.0.2 — Paper pipeline redesign around Atlas Plan

Five steps became three: Select Idea and Find Papers merged into **Setup**; the separate Paper Outline step (an ungrounded, disconnected Groq prompt) was removed in favor of Atlas Plan's own outline mode. Papers collected on Setup now actually feed the plan instead of staying in `localStorage` unused. Atlas Plan's output is editable in place and re-groundable after an edit — a claim you rewrite is marked "edited – not re-checked" until you re-check it, rather than silently keeping a stale verdict — and each grounding badge expands to show the source passage it was checked against. Step bar and section headings moved onto the ink design system. See #64.

## V3.0.0.1 — Replaced the ARS integration with Atlas Plan

Replaced the ARS integration with Atlas Plan; the review engine was already independent of ARS and is unchanged. Atlas Plan is an original, clean-room implementation — see "Acknowledgments and prior art." Preset peer-review personas are now labeled by role instead of invented names (e.g. "Methodology & Novelty Reviewer"). See #63.

## V3.5 — Ink-Wash Redesign, One-Command Docker Run & Hosted Pricing Update

- **Ink-wash visual redesign** across the landing page, Explorer, job pages, My Research, Bold Idea, and the account/pricing/docs pages: a shared palette (`lib/inkPalette.ts`), ink-styled components (`components/ink/`), brush-style accents — in English, not the Chinese seals/inscriptions an earlier pass used, which read as unfamiliar characters to readers who don't use them
- **One-command Docker run**: `make image` builds the app, `make run` starts Postgres, Redis, the app, and the worker — a complete local deployment in two commands, with secrets injected at run time rather than baked into the image
- **Hosted pricing corrected**: the hosted tier is $19/month (unlimited runs, billed monthly, cancel anytime), not the old $1-per-round pay-per-use model; the self-hosted license badge now says AGPL-3.0, matching `LICENSE`, instead of the stale MIT label
- Landing page: a compact theme dropdown instead of three separate buttons, fixed to no longer overlap the account widget at any screen width

## V3.4 — Account Profile, Billing & Usage, Settings

- **Account page** (`/account`): three tabs — Profile (avatar initials, name, email, member-since date, plan, real usage counts), Billing & Usage (reads the stored plan field rather than hardcoding "Free"; says plainly that no hosted billing is live yet instead of showing a fake upgrade button), and Settings (edit display name, change password)
- **Ownership display**: My Research marks each job and bold idea "Yours" or "Unclaimed" — computed server-side, so no other account's id is ever sent to the browser
- Reachable from a dropdown behind the account name in the top-right corner, alongside Sign out

## V3.3 — Real User Accounts

- **Real sign-in**: email/password accounts with bcrypt-hashed passwords, replacing a sign-in form that previously just faked success after a timeout
- **Self-hosted-vs-hosted flag** (`REQUIRE_AUTH`): unset by default so a self-hosted instance stays fully usable anonymously; the hosted tier sets it to require an account before starting new research
- **Ownership, added without breaking anonymous use**: a job or bold idea created while signed in is tied to that account; an unowned one stays exactly as open as before accounts existed — nothing about anonymous usage changed
- **Claim flow**: a signed-in user can attach a job or bold idea they made anonymously to their account after the fact, so signing up later doesn't orphan earlier work
- Ownership checks cover the core job/bold-idea routes and their list endpoints; the nested sub-resource routes (notes, notebook, chat, etc.) do not yet check ownership — tracked separately, not yet closed

## V3.2 — License Switch: MIT → AGPL-3.0 (dual licensing)

- Core is now licensed under **GNU AGPL-3.0**: free for everyone including commercial use, but anyone hosting a modified version as a network service must offer users the complete corresponding source
- **Commercial licenses** available for embedding/hosting without copyleft obligations — see `COMMERCIAL-LICENSE.md`
- **DCO sign-off** required on all contributions (`git commit -s`) to keep the copyright chain sole-owned — see `CONTRIBUTING.md`
- All releases before the `v3.2.0` tag remain **MIT-licensed forever**; the switch point is tagged `v3.2.0`

## V3.1 — Graph Deduplication & Explore Header Redesign

- **No more duplicate topics/entities**: every synced entity now uses a label-based global sync key (`g:type:normalized-label`) instead of per-job keys, so the same concept discovered in different runs converges onto one node via the existing upsert
- **`dedupeGraph()` merge pass**: groups entities by (type, normalized label) and folds each group onto a canonical node — edges and paper links are re-pointed, duplicates deleted (cascades clean up the originals); user-created entities always win the merge, and groups that are purely user-created are left alone as deliberate duplicates; notes are exempt
- **Dedup runs automatically**: every `syncJobGraph` finishes with the merge pass, and `POST /api/graph/dedupe` can be called anytime to clean up stragglers (idempotent)
- **Paper deduplication**: source rows are per-run (papers are re-fetched each run), so the graph and query APIs now collapse sources by normalized title when serializing — no repeated titles in inspector source lists or query citations
- **Explore header redesigned** (UX pass): the old header mixed six button styles with three competing gradients; it's now a quiet ghost-style nav — brand mark (links home) + My Research · Research Graph · Write Paper · Peer Review · Docs, one consistent hover style, color only in the icons — followed by a clean page-identity block ("Topic Explorer" + subtitle), keeping the word cloud as the page's primary call to action; all three themes verified

#### New API routes (V3.1)

| Route | Method | Purpose |
|---|---|---|
| `/api/graph/dedupe` | POST | One-shot graph deduplication: normalizes sync keys, merges duplicate groups (returns `{normalized, groups, merged}`) |

## V3.0 — Persistent Research Graph (the infrastructure spine)

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

## V2.5 — Standalone Peer Review Session & Explore Upload Control

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

## V2.4 — Comprehension Quiz, UI Polish & Prisma Pool Fix

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

## V2.3 — Node-Aware Explore Papers & Weekly Paper Subscription

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

## V2.2 — Notes System, Find Papers & Knowledge Tree Paper Exploration

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

## V2.1 — Smart Explore, Hub-Spoke Paper Map & Paper Comparison
- **Custom topic search**: type 2–5 words, click Search → Groq generates a live word cloud with your keyword pinned at center and 16 related terms around it
- **Area / industry selector**: General (cross-domain, default), Biology, Chemistry, Technology, Finance — word cloud updates per domain; General triggers LLM keyword generation
- **Hub-and-spoke Paper Map**: Research hub at center with weighted lines to every paper (line width & opacity = knowledge-node count); no peer-to-peer lines cluttering the graph
- **Paper Compare Mode**: select any 2 papers → Claude returns a structured comparison of (1) methodology differences and (2) research gaps, with a combined-opportunity insight
- **Richer paper detail panel**: full abstract, publication year, stats row, "Read Paper ↗" button, venue + year on related papers
- Pricing: free & open-source; $100 / paper for hosted workflow with managed tokens

## V2 — Paper Pipeline + ARS Integration
- In-app Socratic planning chat integrating the Academic Research Skills (ARS) Claude Code plugin — replaced by the original Atlas Plan in V3.0.0.1; see "Acknowledgments and prior art"
- Idea selection from converged ideas, knowledge tree nodes, or raw topic
- Paper Outline generation via Groq (IMRaD structure)
- `/jobs` research management page: list, view, write, delete all past runs
- Knowledge Tree, Notebook, and Paper Map accessible directly from the paper session

## V1 — Evidence Mapping & Knowledge Tree
- Word cloud topic explorer across Biology, Chemistry, Technology, and Finance
- Real-time knowledge tree built from peer-reviewed papers, datasets, and social signals
- Reliability-tiered Paper Map (SVG network graph)
- Notebook & Topic Copilot with AI-assisted brainstorm and Converge to Top 3
