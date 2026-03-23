# User Flow (Intended vs Current)

Date: 2026-03-23

## What the user is trying to do
The app is meant to help you decide whether to buy specific Japanese Pokemon TCG cards (A-/B condition) by comparing:
1. Japanese shop buy prices + stock status (scraped from shop pages)
2. US market sell price (PokemonPriceTracker / TCGPlayer market)

You then view:
- A dashboard showing “arbitrage opportunities” and whether they’re viable (profit margin threshold)
- A compare page that lists per-shop prices, stock status, links, and profit per shop/condition

## Intended workflow (as described by README/SYSTEM-OVERVIEW)
This is the “daily / update” model the docs describe:
1. Scrape Japanese shop prices (manual scripts)
2. Update US prices (manual API updater)
3. Write the results into `data/prices.json`
4. Commit `data/prices.json` and deploy or run locally
5. Open the dashboard in the browser

The docs historically described the “legacy” pipeline like this:
1. Japanese scraping
   - `node scripts/scrape-torecacamp.js`
   - `node scripts/scrape-japanese.js`
   - `node scripts/scrape-all.js`
2. US market update
   - `node scripts/update-prices-simple.js`
3. Deploy the updated `data/prices.json`

In that legacy model, the dashboard reads:
- `data/prices.json.opportunities[]`
- each card’s `japanesePrices[]`
- computed fields like `lowestJapanesePrice`, `marginPercent`, and `isViable`

## How the app is actually working now (current checkout)
### 1. `pnpm dev` / page load does not scrape
When you run the server, the pages load `data/prices.json` and render from it.
Scraping and API calls happen only if you run the generator/update scripts yourself.

### 2. The current `data/prices.json` uses the “builder” format
Your current dataset is builder-format (it contains `meta` and `cards`, and shop fields like `card.japanToreca`, `card.toretoku`, `card.torecacamp`, etc.).

In builder format:
- The compare page is powered by `components/CompareClient.tsx`
- The dashboard page converts builder data into opportunities for display (see `app/page.tsx`)

### 3. The `/api/prices` endpoint exists, but the current pages don’t rely on it
There is an API route at `app/api/prices/route.ts` which fetches US market prices from PokemonPriceTracker with rate limiting and caching.
However, the dashboard/compare pages render from the already-populated `data/prices.json`.
The API route is primarily for scripts like `scripts/test-api.ts` (and is available for future on-demand fetching).

## Which scrapers are “supposed to” run vs which are actually implemented
### Current multi-source builder generator
The current multi-shop scraper intended for builder-format data is:
- `scripts/build-sets.js`

It is designed to scrape multiple Japanese sources and produce builder-format cards that look like what the UI expects.

In this checkout, `scripts/build-sets.js` references these modules:
- `scripts/scrape-hareruya2.js`
- `scripts/scrape-dorasuta.js`

But those files are missing from the repo here, so:
- `build-sets.js` can’t fully run for Hareruya2 and Dorasuta in this checkout
- you can still run the parts that don’t require missing modules (depending on CLI flags), but you won’t be able to regenerate those sources without adding the missing scraper modules

### Legacy scrapers and legacy updater
The older scripts like `scripts/scrape-all.js` / `scripts/scrape-japanese.js` / `scripts/scrape-torecacamp.js` update the legacy structure (`data.prices.json.opportunities`).
Those scripts are not compatible with builder-format `data/prices.json` without conversion, so they won’t “refresh” the current dataset correctly.

## Practical “today” checklist
If you want your changes reflected in the UI right now:
1. Update `data/prices.json` by running the appropriate builder generator (or legacy generator + conversion if needed).
2. Restart the Next dev server (if it was already running) or reload the page so it re-reads the updated file.

If you tell me which set(s) you want to refresh (S12a only vs multi-set), I can recommend the correct generator command(s) for builder format given the missing modules in this checkout.

