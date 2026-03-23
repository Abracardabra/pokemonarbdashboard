# Source Alignment Plan (Required JP Shops)

Date: 2026-03-23

## Goal
Align the project to this required source list only:

1. `shop.japan-toreca.com`
2. `cardrush-pokemon.jp`
3. `torecacamp-pokemon.com`
4. `toretoku.jp/pokemon`
5. `dorasuta.jp/pokemon-card`
6. `hobibinet-pokemon.com`
7. `playze.jp/collections/pokemon`
8. `c-labo-online.jp`
9. `pokemon.fukufukutoreka.com`

Any source not in that list should be removed.

---

## Current vs target gap

## Currently represented in app/types/scripts
- Present:
  - `japan-toreca`
  - `toretoku`
  - `torecacamp`
  - `hobibinet`
  - `dorasuta` (partially wired; scraper module missing in this checkout)
- Not required but currently present:
  - `hareruya2` (should be removed per your rule)
- Required but missing:
  - `cardrush`
  - `playze`
  - `c-labo`
  - `fukufukutoreka`

---

## Plan overview (safe phased rollout)

## Phase 0 - Freeze source contract (1 PR)
Purpose: define one canonical source list and avoid drift.

Actions:
1. Add a central `ALLOWED_SOURCES` constant (single place).
2. Add a short source policy doc section in `docs/SCRAPING_RESEARCH.md` (or link this plan).
3. Add a startup warning if any card/source field not in allowed list is encountered.

Exit criteria:
- All source checks reference one constant.

---

## Phase 1 - Remove non-listed source (`hareruya2`) (1 PR)
Purpose: enforce your rule first by removing anything extra.

Actions:
1. Remove `hareruya2` from:
   - type unions (`PriceSource`, shop keys)
   - UI filters/dropdowns
   - compare/home transforms
   - build script modes/flags
2. Remove `hareruya2` data fields in builder outputs going forward.
3. Keep backward compatibility:
   - tolerate legacy `hareruya2` fields if present in old JSON, but ignore them in runtime.

Risk:
- Low, because this is subtractive and already mostly optional.

Exit criteria:
- No active runtime path references `hareruya2`.

---

## Phase 2 - Stabilize currently required + already-existing sources (1-2 PRs)
Purpose: ensure all currently present required sources are working before adding new ones.

Scope:
- `japan-toreca`, `toretoku`, `torecacamp`, `hobibinet`, `dorasuta`

Actions:
1. Restore/implement missing `dorasuta` scraper module and wire it cleanly.
2. Verify source-specific stock and quality parsing consistency.
3. Add per-source health stats in builder output/logs:
   - cards matched
   - A-/B counts
   - in-stock counts
   - failure counts

Exit criteria:
- `build-sets` runs without missing-module failures for required existing sources.

---

## Phase 3 - Add missing required sources one by one (4 PRs)
Purpose: reduce blast radius by onboarding one new source at a time.

Order:
1. `cardrush`
2. `playze`
3. `c-labo`
4. `fukufukutoreka`

Per-source checklist:
1. Implement dedicated scraper module:
   - fetch strategy
   - card number extraction
   - rarity extraction
   - A-/B quality mapping
   - stock detection
2. Add caching path and TTL.
3. Add to builder merge map and output fields.
4. Add UI read path for that source.
5. Add debug script for one-card validation.

Exit criteria per source:
- At least one target set has >0 matched cards with valid URLs.

---

## Phase 4 - Clean model and simplify runtime (1 PR)
Purpose: make future DB/cron migration easier.

Actions:
1. Replace shop-specific nested card fields with one normalized structure internally:
   - `offers[]` with `source`, `quality`, `priceJPY`, `inStock`, `url`.
2. Keep existing JSON output shape for compatibility (adapter converts from normalized).
3. Move source selection/filtering to normalized pipeline.

Why now:
- This makes cron + Prisma migration much simpler because DB can use one offer table.

Exit criteria:
- Runtime rendering uses normalized offers, not hardcoded per-shop branching.

---

## Phase 5 - Acceptance and cutover rule
Purpose: enforce final allowed-source policy.

Actions:
1. Add CI check:
   - fail if non-allowed source keys appear in code or generated data.
2. Add smoke test over a selected set:
   - all required sources either:
     - produce data, or
     - report a clear source failure metric (not silent).

Exit criteria:
- Only required sources remain active.

---

## Concrete simplifications for this step
These are high impact and should be done early:

1. Remove `hareruya2` first.
2. Stop adding new shop-specific branches in UI components; centralize source rendering from a `ShopConfig[]`.
3. Centralize stock parsing helpers by source.
4. Add source capability flags:
   - `supportsAminus`
   - `supportsB`
   - `hasStructuredStock`

This keeps onboarding of `cardrush/playze/c-labo/fukufukutoreka` much faster.

---

## Suggested implementation order (practical)
1. PR-1: Source contract + remove `hareruya2`.
2. PR-2: Fix/restore `dorasuta`.
3. PR-3..6: Add `cardrush`, `playze`, `c-labo`, `fukufukutoreka` (one PR each).
4. PR-7: Normalize internal offer model + cleanup.
5. PR-8: CI guard + smoke tests.

---

## Definition of done
- Only these sources are active in code and data:
  - japan-toreca, cardrush, torecacamp, toretoku, dorasuta, hobibinet, playze, c-labo, fukufukutoreka
- Non-listed sources removed/ignored.
- Build pipeline runs without missing scraper modules.
- UI can filter/show all required sources.

