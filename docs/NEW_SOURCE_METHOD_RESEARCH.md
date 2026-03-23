# New Source Method Research (Same Integration Pattern)

Date: 2026-03-23

## Scope and intent

This document captures a safe onboarding approach for required JP shops that are not fully integrated yet, while keeping current code stable.

The pattern stays the same as existing working sources:

1. Discover listing/product URLs for one set + rarity scope.
2. Parse `cardNumber`, `rarity`, `priceJPY`, `quality`, `inStock`, `url`.
3. Normalize quality to the current model (`A-` and `B`).
4. Merge into the same builder card identity (`set`, `number`, `rarity`).
5. Keep per-source cache + source-specific health metrics.

## Runtime removal applied now

- Non-required source `hareruya2` was removed from active runtime usage:
  - `app` transformation path
  - homepage JP shop filter options
  - compare page active shop options
  - source type union used by UI/runtime
- Current scraper scripts were intentionally not refactored in this pass to avoid destabilizing existing working sources.

## Site investigation summary

## 1) cardrush-pokemon.jp
- Domain: `https://www.cardrush-pokemon.jp`
- Observed search pattern: `https://www.cardrush-pokemon.jp/product-list?keyword=<query>`
- Observed issue: page is protected by anti-bot challenge in simple fetch flow (`Enable JavaScript and cookies to continue`).
- Recommended method:
  - Primary: browser-based scraper path (Playwright/Puppeteer) with paced navigation.
  - Fallback: if challenge blocks automation, do not fail full build; record source health failure and continue.
- Parser targets:
  - Product title with rarity and card number.
  - Price in JPY.
  - Stock/sold-out marker.
  - Product URL (`/product/...` or equivalent listing link).

## 2) playze.jp/collections/pokemon
- Domain: `https://playze.jp`
- Observed listing page: `https://playze.jp/collections/pokemon`
- Observed product page: `https://playze.jp/products/<id>`
- Observed data points from fetched HTML:
  - Title format contains rarity + card number (example: `CHR)ピカチュウ(073/071)`).
  - Explicit condition variants (`A`, `B`, `C`) with per-condition prices and stock counts.
  - Clear sold-out markers.
- Recommended method:
  - Shopify-style product scrape (same style as torecacamp flow): discover product URLs from collection pages, then parse product-level condition/price/stock.
  - Map conditions:
    - `A` -> `A-`
    - `B` -> `B`
    - ignore `C` in current model (or keep as future extension).

## 3) c-labo-online.jp
- Domain: `https://www.c-labo-online.jp`
- Observed product page pattern: `https://www.c-labo-online.jp/product/<id>`
- Observed data points from fetched HTML:
  - Product title includes set and number (example: `SV9 080/100`).
  - `販売価格` provides price.
  - `在庫数<数字>枚` provides stock count.
- Recommended method:
  - HTML-first scraper (no JS required for core product fields in tested pages).
  - Discovery paths:
    - category/list pages, then product links.
  - Condition handling:
    - If only one condition is exposed (`中古良品` etc.), treat as `A-` by policy until finer condition parsing is proven.

## 4) pokemon.fukufukutoreka.com
- Domain: `https://pokemon.fukufukutoreka.com`
- Observed listing page pattern: `https://pokemon.fukufukutoreka.com/products/list?category_id=<id>`
- Observed product page pattern: `https://pokemon.fukufukutoreka.com/products/detail/<id>`
- Observed data points from fetched listing HTML:
  - Product names include condition markers like `【状態A-】` or `【状態B】`.
  - Product names include rarity and set/number markers (`[SAR]`, `【SV8a】`, `217/187`).
  - Price and URL are present in listing output.
- Recommended method:
  - Listing-first parser with robust title regex extraction.
  - Filter out PSA/graded inventory when the target is raw singles.
  - Condition mapping can be direct (`状態A-` and `状態B`).

## Suggested implementation sequence (safe)

1. `playze` first (best fit to current Shopify-like pattern, rich condition data).
2. `c-labo` second (straight HTML with explicit stock count).
3. `fukufukutoreka` third (strong regex extraction but needs strict graded-item filtering).
4. `cardrush` last (anti-bot constraints likely require browser automation and retry budget).

## Shared parser policy (keep behavior consistent)

- Identity join key: `(normalizedSetCode, cardNumber, rarity)`.
- Price parsing: strict JPY integer parser (`¥`, commas).
- Stock policy:
  - explicit stock count -> `inStock = count > 0`
  - explicit sold-out text -> `inStock = false`
  - unknown -> `inStock = null` during extraction, then conservative fallback.
- Quality policy:
  - normalize full-width/hyphen variants.
  - map source-specific labels to canonical `A-` / `B`.
- Cache policy:
  - per-source per-set listing cache.
  - optional per-product cache for expensive sources.
- Failure policy:
  - source-level failures should not abort full build.
  - emit source health metrics in output logs.

## Minimal code impact rule for next PRs

- Add each new source behind an explicit `--<source> mode` gate.
- Keep existing source paths untouched while adding a new one.
- Validate one source at a time with a single set before enabling wider rollout.
