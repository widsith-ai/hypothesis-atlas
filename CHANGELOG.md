# Changelog

All notable changes to Hypothesis Atlas. Issue numbers refer to [widsith-ai/hypothesis-atlas](https://github.com/widsith-ai/hypothesis-atlas/issues).

The pre-1.0 development log (V1 → V3.x) is kept on the [`version-history`](https://github.com/widsith-ai/hypothesis-atlas/tree/version-history) branch.

## 1.0.0 — First public release

Hypothesis Atlas 1.0 is the first official, open-source release: a self-hostable research atlas that turns a topic into grounded evidence, a persistent knowledge graph, and a paper plan ready for a peer-review rehearsal.

### Research

- **Evidence mapping**: word clouds for five domains or your own 2–5 word topic, or start from an uploaded PDF. Papers from OpenAlex and PubMed, datasets from GEO, and social signals are assembled live into a **knowledge tree** of methods, findings, disagreements and open problems
- **Paper Map** and **Paper Compare**: a hub-and-spoke map of a run's papers, and a side-by-side methodology and research-gap comparison of any two
- **Bold Idea**: free-text ideas explored by agents that propose directions, search literature for each, and get an independent verdict from a second model; design an experiment for any direction
- **Weekly paper digests** for any topic, with one-click unsubscribe

### Grounding and memory

- **Claim verification**: every finding is split into single claims and checked against its sources (overlap → NLI → LLM judge); claims that fail are kept and badged, never silently dropped
- **Persistent Research Graph**: every run syncs into one workspace-isolated, deduplicated graph with full editing, typed relationships, negative-result outcomes, and cross-run Q&A that cites its sources
- **Run Provenance**: a step-by-step log of every prompt, model, seed and tool call per run, exportable as a reproducibility bundle

### Writing and review

- **Paper pipeline with Atlas Plan**: Setup → Plan → Experiments. A grounded, editable contribution statement, claims, evidence map, method and data plan, threats to validity and outline; edited claims are re-checked on demand; export as Markdown
- **Experiments**: design an experiment and verify its quantitative claims
- **Peer-review rehearsal**: a committee of reviewer agents plus an optional custom reviewer and a Devil's Advocate pass, graded against a venue's real call-for-papers criteria, with live progress, an author or reviewer role, a revision roadmap, a response-letter draft and a downloadable report

### Workspace and learning

- **Workspace**: chat-first, with the graph, experiments, paper map, notebook and review alongside
- **Notebook and session notes**: Markdown with math, an AI copilot, suggested and candidate topics, and Converge to Top 3; notes are stored in the Research Graph
- **Learning tools**: Question Cat (ask about a run, or quiz yourself), node quizzes, and Test Your Understanding

### Accounts, models and deployment

- **Accounts**: email and password sign-in, password reset by emailed link, ownership and claiming of anonymous work; accounts are optional on a self-hosted instance (`REQUIRE_AUTH` to require them)
- **Bring your own model key** across nine providers (Anthropic, OpenAI, Gemini, Groq, OpenRouter, Mistral, DeepSeek, xAI, Together); the key stays in the browser
- **Editions**: `ATLAS_EDITION` (self-hosted by default); a self-hosted instance with a server key never asks users for one
- **Monet and ink-wash styles**, with an account bar built into every page's top bar
- **One-command self-hosting** with Docker (`make image && make run`), or local development with `make laptop-install`
- Licensed **AGPL-3.0**, with a commercial license available
