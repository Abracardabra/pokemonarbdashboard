# Rarity Scope Research (Requested Tracking Set)

Date: 2026-03-23

## Requested rarity set

From your provided list/image, the target tracked rarities are:

- `P`
- `S`
- `RR`
- `RRR`
- `AR`
- `SAR`
- `SR`
- `SSR`
- `UR`
- `CHR`
- `CSR`
- `HR`
- `ACE`
- `MA`

Anything outside this set should be treated as out-of-scope and removable from tracking.

## Small investigation findings

Current project behavior is narrower than your target list.

- `lib/types.ts`
  - `RarityCode` currently allows only:
    - `AR`, `SAR`, `SR`, `CHR`, `UR`, `SSR`, `RRR`
- `components/CardsWithFilters.tsx`
  - rarity dropdown/UI also only exposes:
    - `AR`, `SAR`, `SR`, `CHR`, `UR`, `SSR`, `RRR`
- `scripts/build-sets.js`
  - `ALLOWED_RARITIES` currently:
    - `AR`, `SAR`, `SR`, `CHR`, `UR`, `SSR`, `RRR`
  - scraper regex extraction in multiple places is hardcoded to that same subset.

So today the app tracks only a 7-rarity subset and does not yet include:

- Missing vs requested: `P`, `S`, `RR`, `CSR`, `HR`, `ACE`, `MA`

## Impact areas to update (when implementing)

To align runtime + builder with your requested rarity scope:

1. **Type system**
   - Expand `RarityCode` in `lib/types.ts` to include all requested values.

2. **UI filters**
   - Expand `DISPLAY_RARITIES` in `components/CardsWithFilters.tsx`.
   - Confirm no other hardcoded rarity options exist in compare pages.

3. **Builder allowlist**
   - Update `ALLOWED_RARITIES` in `scripts/build-sets.js`.
   - Update regex extractors that explicitly enumerate rarity tokens.

4. **Mapping from external API labels**
   - Extend `mapApiRarityToCode()` for requested values not currently mapped.
   - Keep unknown labels excluded to avoid contamination.

5. **Data compatibility**
   - Existing `data/prices.json` with older rarity subset remains readable.
   - New builds will add cards from new allowed rarities once parser mapping is in place.

## Recommended safe rollout (minimal break risk)

1. **PR-1 (contract only):**
   - Add a single `TARGET_RARITIES` constant (shared source of truth).
   - Update types + UI list only.

2. **PR-2 (builder parse):**
   - Update builder allowlist + regex + API rarity mapping.
   - Keep strict unknown-rarity drop behavior.

3. **PR-3 (validation):**
   - Run one set build and report rarity counts before/after.
   - Verify no unexpected rarities leak into output.

## Definition of done

- Only these rarities are tracked in output:
  - `P`, `S`, `RR`, `RRR`, `AR`, `SAR`, `SR`, `SSR`, `UR`, `CHR`, `CSR`, `HR`, `ACE`, `MA`
- Any other rarity is excluded by design.
- UI filter list matches exactly the same set.
