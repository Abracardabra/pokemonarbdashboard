# Scrape Capacity Execution Plan (300 Cards/Day)

Date: 2026-03-23

## Goal

Use a hard capacity limit of ~300 card updates/day to keep scrapers stable, reduce rate-limit failures, and focus updates on the most important cards.

This plan converts the latest team feedback into concrete operating rules.

## Key inputs from feedback

- Reliable scrape throughput: about **300 cards/day**.
- Keep only target rarities (commons/uncommons removed).
- Important set priority:
  - **Daily focus:** `M*` and `SV*`
  - **Lower frequency:** `SM*` and `S*` (except `S12A`)
- Budget guidance:
  - Cards below `$2` are generally not useful.
  - Cards above about `€100` / `$100-$110` are lower priority for daily tracking.
  - Practical upper safety range discussed: avoid frequent daily tracking of very high tickets (e.g. `$150+`).
- Operational issue observed:
  - Around ~20% progress, scrapers can degrade (partial runs, stale updates), so we need slower randomized pacing.

## Target tracking policy

## 1) Rarity scope (hard include)

Track only configured target rarities (already documented in `docs/RARITY_SCOPE_RESEARCH.md`).

Effect:
- Removes low-signal common/uncommon inventory.
- Reduces universe size toward a manageable core.

## 2) Price range policy (for scheduling, not deletion)

Use budget ranges for **frequency tiering**, not permanent deletion:

- **Core budget range:** `$2` to `$100` (or equivalent in JPY)
- **Out-of-range high:** `>$100` (or approximately `>¥20,000`)
- **Out-of-range low:** `<$2`

Notes:
- High-range cards are still tracked, but less frequently.
- Favorites always override range rules.

## 3) Set priority policy

- **Tier A sets (daily priority):** `M*`, `SV*`
- **Tier B sets (routine):** `SM*`, `S*` except `S12A`
- **Special-case keep high:** `S12A`

## Scheduling model (capacity-aware)

## Daily capacity budget

- Hard cap: **300 card refreshes/day**
- Split into tiers:
  - **Tier 1 (critical):** 60% -> 180/day
  - **Tier 2 (routine):** 30% -> 90/day
  - **Tier 3 (out-of-range maintenance):** 10% -> 30/day

## Tier definitions

### Tier 1 - Favorites (highest priority)
- Includes all favorited cards regardless of price/set.
- Refresh cadence: **daily**
- If favorites exceed 180/day:
  - split by recency/stock volatility and carry over remainder to next cycle first.

### Tier 2 - Non-favorites, in-range
- Non-favorited cards in budget range (`$2-$100`) and priority sets.
- Cadence target: **10% batch every 48 hours** (rolling windows).
- Daily budget around 90 cards.

### Tier 3 - Non-favorites, out-of-range
- Non-favorited cards outside budget range.
- Cadence target: **5% batch every 72 hours**.
- Daily budget around 30 cards.

## Throughput and anti-rate-limit strategy

- Add randomized pacing between requests:
  - **3-9 seconds random delay** per card request block.
- Avoid burst patterns:
  - stagger jobs through day instead of one large run.
- Continue on partial failures:
  - log failed cards and retry in next eligible window.
- Keep runs idempotent:
  - do not overwrite good data with nulls on fetch failure.

## Suggested daily cadence (example)

1. Job A (morning): 100 cards (mostly Tier 1 + small Tier 2)
2. Job B (afternoon): 100 cards (Tier 1 + Tier 2)
3. Job C (evening): 100 cards (Tier 2 + Tier 3)

This keeps per-run stress lower and reduces cascading failures.

## Favoriting workflow rule

- Team workflow: favorite cards that are consistently important/in-stock.
- If a card stops being useful, unfavorite it and let it drop to Tier 2/3.
- This keeps the daily budget focused on practical buying inventory.

## Implementation checkpoints

## Phase 1 - Rule wiring
- Centralize tier constants:
  - daily cap (`300`)
  - percent splits (60/30/10)
  - range thresholds (`$2`, `$100`, optional `$150` hard cap policy)
  - set priorities (`M`, `SV`, `S12A`)

## Phase 2 - Selector logic
- Build candidate pools:
  - favorites
  - in-range non-favorites
  - out-of-range non-favorites
- Apply set weighting and batch slicing.

## Phase 3 - Scheduler behavior
- Add randomized delays (3-9s).
- Add resumable progress markers.
- Add retry queue for failed cards.

## Phase 4 - Monitoring
- Per run metrics:
  - attempted, success, failed, skipped
  - avg request time
  - source failure rate
- Alert if failure ratio exceeds threshold (e.g. >20%).

## Definition of done

- Daily refresh stays within ~300 cards.
- Favorites are always refreshed daily.
- Non-favorites are refreshed by rolling 48h/72h tiers.
- Rate-limit and partial-failure incidents materially reduced.
- High-value operational cards remain fresh enough for trading decisions.

