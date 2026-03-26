# Provider Continuation Plan (Post-Prisma)

## Current state (confirmed)

- Runtime is now DB-first (Postgres via Prisma) for dashboard reads and card persist actions.
- Scrape prioritization/rules are centralized in:
  - `lib/scrape-policy.ts` (app/runtime)
  - `lib/scrape-policy.js` (node scripts)
- Existing scripts are kept (intentionally) so we can continue controlled ingestion while adding providers.

## Timeline context from team chat

- Day 1: scraping rules, favorites, reloads were added.
- Day 2: database connection target (Prisma/Postgres) was prioritized.
- Day 3/4 goal: finish remaining scrapers and add proxy layer.
- Main blocker called out: Cloudflare crawl access uncertainty.
- Main high-priority pain point: Dorasuta is business-critical and heavily protected by Cloudflare.

This plan assumes DB connection is done (it is), and focuses on provider rollout safely.

## Provider rollout goals

1. Keep existing provider quality stable.
2. Add required providers without breaking reload/favorites/dashboard.
3. Follow global scrape rules (budget, capacity, tiers, pacing, set priority).
4. Add anti-blocking strategy for protected shops (especially Dorasuta).

## Non-negotiable guardrails (must stay)

- Use `SCRAPE_POLICY` as single source of truth for:
  - budget limits (`minUsd`, `maxUsd`, optional `maxJpy`)
  - capacity caps and tier shares
  - pacing delays and cadence
  - set priority logic
- New provider scripts must respect policy-driven pacing and filtering before persist.
- Persist normalized output into DB shape (`Card`, `JapanOffer`, `UsMarket`) only.
- Keep writes idempotent (`upsert` + unique keys by `cardId/source/quality`).

## Provider phases

### Phase 1: Stabilize current providers (short, mandatory)

- Re-validate current active shops end-to-end against DB write path:
  - `japan-toreca`, `toretoku`, `torecacamp`, `hobibinet`, `dorasuta`
- Add per-provider health counters in logs:
  - fetched cards
  - parse success ratio
  - in-stock extracted ratio
  - blocked/error ratio (4xx/5xx)
- Exit criteria:
  - each provider has reproducible parse baseline and failure profile
  - no schema drift in DB

### Phase 2: Add remaining required providers (parallel where possible)

- For each new provider:
  1. Build listing discovery + product fetch adapter
  2. Map quality into canonical `A-` / `B` when possible
  3. Normalize into `JapanOffer` records
  4. Add provider-specific retry/backoff + pacing wrapper
  5. Gate with feature flag/env toggle for safe launch
- Launch sequence recommendation:
  - easiest HTML/static sources first
  - JS-rendered/protected providers after proxy strategy is proven

### Phase 3: Dorasuta hardening (high business priority)

- Problem: frequent Cloudflare challenge and crawler blocks.
- Strategy layers:
  1. **Low-frequency polite mode**: strict pacing + jitter + narrow card targets
  2. **Session reuse mode**: persistent browser session/cookies where legal
  3. **Proxy abstraction**: provider route behind unified fetch gateway
  4. **Fallback mode**: if blocked, keep last-known DB value and mark stale
- Operational rule:
  - Dorasuta failures should never break global pipeline; degrade gracefully per card/provider.

## Cloudflare contingency plan

- If Cloudflare crawl access is not granted:
  - route only protected providers through pluggable proxy driver
  - keep non-protected providers direct
  - isolate protected provider budget (daily caps) so they do not consume full scrape capacity
- If access is granted later:
  - switch driver config only (no schema changes)
  - keep same normalized output contract

## DB ingestion model for new providers

- Keep one normalized write path:
  - resolve `Card.id`
  - upsert `JapanOffer` by (`cardId`, `source`, `quality`)
  - update `Card.updatedAt` only when provider result is accepted
- Add `source` names consistently (lowercase stable keys).
- Never overwrite unrelated providers during a single-provider refresh.

## Validation checklist per provider

- Mapping:
  - set/number/card identity match rate
  - quality mapping confidence
- Data quality:
  - price parse rate
  - stock parse rate
  - URL integrity
- Runtime:
  - average latency
  - blocked/error rate
  - retry recovery rate
- Policy compliance:
  - honors `SCRAPE_POLICY` pacing and tier selection
  - respects budget and set-priority filters

## v1 completion definition (practical)

- DB-first dashboard and persist paths are stable (done).
- Required providers are onboarded with acceptable parse success.
- Dorasuta has a working protected-provider strategy (with graceful degradation).
- Global scrape jobs run within daily capacity budget and do not regress favorites/reload flows.

## Immediate next tasks (execution order)

1. Add provider-level health logging + report output.
2. Implement proxy abstraction interface for protected providers.
3. Finish next required provider adapter and ship behind toggle.
4. Run 48h soak with policy pacing and measure error/blocked rates.
5. Tighten rollout based on metrics, then enable full provider set for v1.

