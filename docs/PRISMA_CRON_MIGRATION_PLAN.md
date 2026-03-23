# Prisma + Postgres + Cron Migration Plan

Date: 2026-03-23

## Goal
Move from file-based `data/prices.json` updates to automated database-backed updates using:
- Prisma ORM (with a Prisma adapter/repository layer)
- Postgres (Prisma.io Postgres)
- Cron jobs for scheduled scraping + market refresh

This plan assumes we first stabilize current scraping quality (as you requested), then migrate.

## Current state summary (why migration matters)
- Source of truth is still `data/prices.json`.
- There are two data shapes in repo history (`legacy opportunities[]` and `builder cards[]`).
- Homepage now includes write behavior (favorites), currently writing to JSON.
- Scraping is script-driven/manual and not centrally orchestrated.
- `build-sets.js` supports multi-source aggregation but has missing modules (`scrape-hareruya2.js`, `scrape-dorasuta.js`).

## Target architecture
1. **Database as source of truth**
   - Cards, sets, shops, price snapshots, and computed opportunity fields stored in Postgres.
2. **Prisma adapter layer**
   - App code does not query Prisma models directly everywhere.
   - Use an adapter/repository boundary for reads/writes (easier refactors and testing).
3. **Cron-driven pipelines**
   - Separate jobs for JP scraping, US market refresh, and aggregate recompute.
4. **UI reads from DB-backed API**
   - Homepage/compare read from API routes that query Postgres via Prisma.
5. **JSON export optional**
   - Keep JSON as optional cache/export artifact, not primary persistence.

## Proposed data model (initial)
Use a normalized core with denormalized computed fields for speed.

### Core entities
- `Set`
  - `id`, `code`, `apiSetId`, metadata
- `Card`
  - `id`, `setId`, `number`, `name`, `rarity`, images
- `Shop`
  - `id`, `key` (`japan-toreca`, `toretoku`, etc), metadata
- `CardShopOffer` (latest offer per card/shop/quality)
  - `id`, `cardId`, `shopId`, `quality`, `priceJPY`, `inStock`, `url`, `scrapedAt`, `sourceJobId`
- `UsMarketSnapshot` (latest US market values)
  - `id`, `cardId`, `marketPrice`, `sellerCount`, `url`, `fetchedAt`
- `CardComputed` (materialized/latest computed fields used by UI)
  - `cardId`, baseline fields, margin fields, `isViable`, etc
- `Favorite`
  - `id`, `cardId`, optional `userId` (or global if single-user)

### Audit/job entities
- `JobRun`
  - `id`, `jobType`, status, started/ended, summary stats, error count
- `JobLog`
  - `id`, `jobRunId`, level, message, context JSON

## Cron jobs design
Split jobs by responsibility to reduce blast radius.

1. **JP scrape job** (high-latency, source-specific retries)
   - Frequency: every 3-6 hours (tune later)
   - Tasks:
     - Run per-source scraper adapters
     - Upsert `CardShopOffer`
     - Emit structured logs

2. **US market refresh job** (rate-limited API)
   - Frequency: every 1-3 hours (or daily if quota constrained)
   - Tasks:
     - Fetch from PokemonPriceTracker with central rate limiting
     - Upsert `UsMarketSnapshot`

3. **Compute/materialize job**
   - Frequency: after scrape/refresh completion (or hourly)
   - Tasks:
     - Recompute baseline + margins from latest offers and US snapshot
     - Upsert `CardComputed`

4. **Health/cleanup job**
   - Frequency: daily
   - Tasks:
     - Mark stale offers
     - prune old logs/job runs by retention policy

## API + app changes (after DB is ready)
1. Add data access adapter interface (example names):
   - `CardReadAdapter`
   - `CardWriteAdapter`
   - `JobAdapter`
2. Add Prisma-backed adapter implementation.
3. Update homepage/compare API paths to read from adapter.
4. Migrate favorites endpoint:
   - from JSON file mutation to DB upsert (`Favorite` table).

## Migration phases (safe rollout)
### Phase 0 - Stabilize scrapers (now)
- Fix missing scraper modules and stock parsing consistency.
- Keep JSON pipeline as-is.

### Phase 1 - Introduce Prisma scaffolding
- Add `prisma/schema.prisma`.
- Add Postgres connection env config.
- Add initial migrations.
- Build adapter interfaces and Prisma adapter implementations.

### Phase 2 - Dual write (JSON + DB)
- Keep existing scripts, but write results to DB too.
- Validate DB vs JSON parity on selected sets/cards.

### Phase 3 - DB-first read path
- Homepage/compare read from DB-backed API.
- Keep JSON export as fallback only.

### Phase 4 - Cron automation
- Add scheduled jobs and job logs.
- Remove manual refresh dependence except for ad-hoc debugging.

### Phase 5 - Deprecate legacy format paths
- Remove old `opportunities[]` assumptions.
- Keep one canonical model (builder-like shape in DB).

## Simplifications to do before/with migration
These reduce complexity and risk.

1. **Unify one canonical shape now**
   - Stop maintaining both legacy and builder assumptions in runtime code.
   - Keep only one transform path in UI.

2. **Separate “scrape” from “compute”**
   - Source scrapers only collect raw offers.
   - A dedicated compute step derives baseline/margins.

3. **Centralize stock parsing rules**
   - Shared utility per source.
   - Avoid divergent in-stock heuristics across scripts/routes.

4. **Move UI write actions behind one service**
   - Favorites and reload actions should call a service layer.
   - Current direct JSON mutation path should be replaced by adapter calls.

5. **Add consistent identifiers**
   - Standard card key: `${setId}:${number}` everywhere.
   - Avoid mixed ID forms between APIs and scripts.

6. **Add structured logging standard**
   - JSON logs with `jobRunId`, `cardId`, `shop`, `url`, `status`.
   - Makes cron troubleshooting much faster.

## Operational considerations
- Rate limiting:
  - enforce per-source throttles in job runners.
- Idempotency:
  - upserts keyed by card/shop/quality for latest offers.
- Retries:
  - exponential backoff + capped retries for external APIs.
- Monitoring:
  - track success rate per source and alert on sudden drops.

## Prisma adapter scope suggestion
Start with a minimal adapter surface:
- `getHomepageCards(filters)`
- `getCompareCards(filters)`
- `upsertOffers(batch)`
- `upsertUsMarket(batch)`
- `setFavorite(cardId, favorite, userId?)`
- `startJobRun(jobType)`, `finishJobRun(jobRunId, stats)`

This keeps migration incremental and prevents Prisma types from leaking through all app layers.

## Exit criteria for migration
- Homepage and compare page fully read from Postgres.
- Favorites persisted in DB only.
- Cron jobs refresh JP + US + computed data on schedule.
- JSON file no longer required for runtime reads.
- Legacy shape paths removed.

