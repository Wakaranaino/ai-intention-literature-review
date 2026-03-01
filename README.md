# AI Intentions Literature Radar

Phase 1 of a local-first literature radar for AI intentions and alignment faking research.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Prisma + SQLite
- arXiv ingestion with Semantic Scholar enrichment
- arXiv-first storage with optional Semantic Scholar citation enrichment

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set the local SQLite path:

```bash
export DATABASE_URL="file:./dev.db"
```

3. Create the database schema:

```bash
npm run db:apply-migrations
```

This project uses checked-in SQL migrations applied with `sqlite3`; Prisma is used for client types only.

4. Ingest papers:

```bash
npm run ingest
```

`npm run ingest` is the recent-scan command. It only stores real, keyword-matched papers and does not fall back to demo records.

For historical ranges, use backfill:

```bash
BACKFILL_START_DATE=2026-01-01 BACKFILL_END_DATE=2026-02-28 npm run backfill
```

5. Start the app:

```bash
npm run dev
```

Then open [http://localhost:3000/papers](http://localhost:3000/papers).

Watchlist worksheet export lives at [http://localhost:3000/watchlist](http://localhost:3000/watchlist).

## Ingestion configuration

These environment variables are optional:

- `INGEST_START_DATE=2025-01-01`
- `INGEST_END_DATE=2025-01-31`
- `ARXIV_DATE_FROM=2025-01-01`
- `ARXIV_DATE_TO=2025-01-31`
- `ARXIV_CATEGORIES=cs.AI`
- `ARXIV_QUERY_MODE=single`
- `ARXIV_QUERY_TERMS=alignment,deception,"alignment faking"`
- `ARXIV_QUERY_GROUPS=alignment,deceptive,"alignment faking"||jailbreak,"prompt injection"`
- `ARXIV_MAX_RESULTS=50`
- `ARXIV_MAX_PAGES=20`
- `ARXIV_REQUEST_DELAY_MS=3000`
- `ARXIV_RETRY_ATTEMPTS=6`
- `ARXIV_REQUEST_TIMEOUT_MS=45000`
- `S2_RETRY_ATTEMPTS=0`
- `S2_REQUEST_DELAY_MS=1500`
- `S2_REQUEST_TIMEOUT_MS=30000`
- `INGEST_KEYWORDS_PATH=./ingest_keywords.yaml`
- `BACKFILL_START_DATE=2025-01-01`
- `BACKFILL_END_DATE=2025-01-31`
- `BACKFILL_SLICE_DAYS=7`
- `BACKFILL_MAX_PAGES_PER_SLICE=`

Defaults:

- Date range: last 1 day
- Categories: `cs.AI`
- Query mode: `single`
- arXiv request size: `50` results per request
- Default query-time terms are behavior-only:
  `alignment faking`, `deceptive alignment`, `deception`, `deceptive`, `strategic compliance`, `sleeper agent`, `sandbagging`, `reward hacking`, `specification gaming`, `goal misgeneralization`, `scheming`, `situational awareness`, `jailbreak`, `prompt injection`, `conditional refusal`, `policy evasion`
- Domain terms are excluded at query time; the second-pass YAML gate still applies both domain and behavior filtering
- In `single` mode, one query per slice is built from the flattened union of `ARXIV_QUERY_TERMS` and all terms in `ARXIV_QUERY_GROUPS`
- In `grouped` mode, one query per group per slice is built from `ARXIV_QUERY_GROUPS`
- `npm run backfill` slices the requested range into `7`-day windows, runs query-time keyword-filtered arXiv searches for each slice, persists matched papers after each fetched page, and records completed windows plus resume checkpoints in SQLite so reruns can continue instead of restarting
- Stored papers keep arXiv as the canonical source record; Semantic Scholar is queried only for `citationCount`, and papers remain saved even if citation enrichment fails
- Citation enrichment uses only exact arXiv-ID lookup in Semantic Scholar; there is no title-search fallback by default
- Papers are persisted only if title or abstract also passes the second-pass local gate in [`ingest_keywords.yaml`](/Users/bohago/Desktop/Codex_openai/AI_Intentions/ingest_keywords.yaml)

## Data model

- `Paper`: unified research record with source links, PDF links, citation counts, watchlist flag, and source IDs
- `Tag`: keyword-driven tag
- `PaperTag`: many-to-many join table

## Curation workflow

- Open a paper card and expand the collapsed `Curation` block
- Fill `Worksheet Fields` for exportable metadata
- Use `Triage Helpers` for manual relevance/extractability/artifact-link notes
- Save the paper, then open `/watchlist` to copy individual or bulk TSV worksheet rows

Ingestion is keyword-gated by [`ingest_keywords.yaml`](/Users/bohago/Desktop/Codex_openai/AI_Intentions/ingest_keywords.yaml). By default the gate has two layers:

- `domain_keywords`: the paper must look AI/LLM/agent/ML-related
- `behavior_keywords`: the paper must also mention intentional-behavior / deception / alignment-faking style concepts

A paper is only enriched and stored if it matches at least one phrase from both layers.

Tagging rules live in [`tag_rules.yaml`](/Users/bohago/Desktop/Codex_openai/AI_Intentions/tag_rules.yaml) and are applied only after a paper passes the ingest keyword gate and is stored.

## Development helpers

- `npm run seed` loads the demo corpus directly for development only
- `npm run backfill` runs date-sliced historical backfill
- `npm run backfill:paper-keys` backfills `paperKey` for existing rows
- `npm run test` runs curation utility tests
- `npm run typecheck` runs TypeScript validation
- `npm run build` builds the Next.js app
