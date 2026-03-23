# Scraping Research (Working Data Pipelines)

Date: 2026-03-23

## TL;DR
The dashboard runtime reads `data/prices.json` and does **not** scrape (or call external price sources) on page load. Scraping/data acquisition happens in the various `scripts/*` generators/updaters. The `/api/prices` endpoint exists, but the current UI does not call it for rendering.

There are **two different `data/prices.json` formats** in this repo:
1. **Legacy format**: `{ opportunities: [...], lastUpdated, stats }` with `card.japanesePrices[]`.
2. **Builder format**: `{ meta: {...}, cards: [...] }` where each card stores shop fields like `card.japanToreca`, `card.toretoku`, `card.torecacamp`, etc.

Many “manual scraper” scripts only work with the **legacy format**.

## Scraping / Data Acquisition Table

| Source / Step | Entry point | What it fetches | How price is extracted | How stock/availability is determined | Output written | Current status in this checkout |
|---|---|---|---|---|---|---|
| Japan-Toreca (legacy generator) | `scripts/build-s12a.js` | Japan-Toreca **search listing** pages (`/search?q=<set>+<rarity>&page=<n>`) | Parses the link heading and extracts card number/rarity/condition from the heading, then parses `¥...` from price elements/body text | `inStock` is `true` unless the listing text includes sold-out indicators like `売り切れ` or `在庫数: 売り切れ` | **Legacy format**: `opportunities[]` + `japanesePrices[]` | Runnable, but outputs **legacy** format |
| US prices (live API) | `app/api/prices/route.ts` | PokemonPriceTracker API `GET /cards?...` per card | Reads `apiCard.prices.market` and related fields from JSON response | Availability is not scraped; it’s a market price lookup. Errors/429/404 handled | Returns JSON for that card | Runnable (not called by the current pages; used by `scripts/test-api.ts`) |
| US prices (legacy updater) | `scripts/update-prices-simple.js` | PokemonPriceTracker API per card in a loop | Reads `card.prices.market`, `card.prices.sellers`, etc | Availability not scraped; arbitrage viability is computed from price and market price | **Legacy format**: rewrites `data/prices.json` with `opportunities[]` | Runnable, but depends on **legacy** input fields (`opportunities` + `lowestJapanesePrice`) |
| Japan-Toreca (current builder) | `scripts/build-sets.js` → `scrapeJapanTorecaListings()` | Japan-Toreca **search listing** pages for each rarity and page | Uses cheerio to find `a[href*="/products/pokemon-"]`, parses card info from the link heading, parses `¥...` from closest container text | `inStock` is `false` if the listing text includes sold-out markers like `sold out`, `売り切`, or `在庫切` | Feeds builder dataset under `card.japanToreca.aMinus` and `card.japanToreca.b` | Scraper logic exists and is correct in-code, but running `build-sets.js` is blocked by missing modules (see below) |
| Toretoku (current builder) | `scripts/build-sets.js` → `scrapeToretokuListings()` | Toretoku listing pages with query params (`genre=5`, `stock=1`, `rank5[]=2/3`, and page) | Regex-extracts: JP name, rarity, set, card number, rank (A/B), and `円` price from `li.list` text | Extracts numeric `在庫数: <n>` into `stock`. Quality maps `A => A-` and `B => B`. UI derives in-stock from stock values | Feeds builder dataset under `card.toretoku.a` / `card.toretoku.b` plus `stockA` / `stockB` | Scraper logic exists and is runnable, but running `build-sets.js` is blocked by missing modules (see below) |
| TorecaCamp (current builder) | `scripts/build-sets.js` → `scrapeTorecacampListings()` | 2-stage Shopify scraping: (1) discover product handles via search HTML, (2) fetch `/products/<handle>.js` for structured variants | Chooses variant matching “状态A-” (or “状态A” normalized to A-) and “状态B”, converts `price` cents to yen | Uses Shopify variant fields: `available` is converted to `inStock`. Also excludes PSA/鑑定品 and guards against cross-set contamination | Feeds builder dataset under `card.torecacamp.aMinus` / `card.torecacamp.b` | Scraper logic exists and is runnable, but running `build-sets.js` is blocked by missing modules (see below) |
| Hobibinet (current builder) | `scripts/scrape-hobibinet.js` (module used by `build-sets.js`) | Hobibinet Shopify pages: search HTML containing embedded `var meta = {...}` | Parses the embedded `meta.products` JSON and uses variant `price` (cents) + variant name to infer `condition` and `cardNumber` | This scraper currently sets `inStock: true` for all found listings (no explicit sold-out detection) | Feeds builder dataset under `card.torecacamp.hobibinet.aMinus` / `.b` | Runnable module, format matches builder expectations |
| Hareruya2 (current builder) | Intended: `scripts/scrape-hareruya2.js` (required by `build-sets.js`) | Not present in repo | N/A | N/A | N/A | **Blocked**: `scripts/build-sets.js` requires `./scrape-hareruya2.js`, but the file is missing here |
| Dorasuta (current builder) | Intended: `scripts/scrape-dorasuta.js` (required by `build-sets.js`) | Not present in repo | N/A | N/A | N/A | **Blocked**: `scripts/build-sets.js` requires `./scrape-dorasuta.js`, but the file is missing here |
| Legacy “full Japanese + stock” scrapers (manual) | `scripts/scrape-all.js`, `scripts/scrape-japanese.js`, `scripts/scrape-torecacamp.js` | Product pages (Japan-Toreca + TorecaCamp depending on script) | Uses regex/DOM selectors (and `puppeteer` in `scrape-japanese.js`) to extract `¥...` | Heuristic sold-out detection based on page text and variant JSON (`売り切れ`, `在庫なし`, `variant.available`, add-to-cart disabled, etc.) | **Legacy format**: updates `data.opportunities[*].japanesePrices[]` | Not compatible with the current **builder-format** `data/prices.json` in this repo (they expect `opportunities`) |

## What’s “working” right now (practically)
1. The app starts because it reads `data/prices.json` successfully (builder format).
2. The current UI rendering does not trigger scraping; US prices also come from `data/prices.json` (already populated by prior generator runs).
3. `/api/prices` is available for on-demand price lookups (and is used by `scripts/test-api.ts`), but it is not part of the current page render path.
4. The current multi-source builder generator (`scripts/build-sets.js`) contains working scraper implementations for:
   - Japan-Toreca listing scraping
   - Toretoku listing scraping
   - TorecaCamp variant scraping
   - Hobibinet Shopify scraping
5. However, `scripts/build-sets.js` is **blocked** from running in this checkout because it `require()`s `./scrape-hareruya2.js` and `./scrape-dorasuta.js`, which are missing from the repo.

If you want, I can propose the minimal code changes to make `build-sets.js` conditionally require those modules (or to add placeholder implementations), so `--hareruya2 none` / `--dorasuta none` truly works.

