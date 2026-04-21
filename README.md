# Pokemon TCG Japanese Arbitrage Dashboard

A Next.js dashboard that tracks arbitrage opportunities for **Japanese S12a (VSTAR Universe)** cards.

**Sources (only):**
- **US sell price + TCGPlayer link:** TCGPlayer via **PokemonPriceTracker API**
- **JP buy price + listing link:** **Japan-Toreca** (`shop.japan-toreca.com`) — **A- and B condition only**

## Tracked scope

- **Set:** `S12a` only
- **Rarities:** `AR`, `SAR`, `SR`, `CHR`, `UR`, `SSR`, `RRR` only
- **JP conditions shown:** `A-` and `B` only

## Quick start

```bash
pnpm install
pnpm run build:s12a   # generates data/prices.json
pnpm run dev
```

Optional API key:

```bash
# .env.local
POKEPRICE_API_KEY=your_api_key_here
```

## How data/prices.json is generated

`pnpm run build:s12a` runs `scripts/build-s12a.js`, which:

1. Fetches **all S12a cards** from PokemonPriceTracker API (paged)
2. Filters to the allowed rarities
3. Scrapes Japan-Toreca **search listings** (paged) for S12a + each rarity
4. Keeps only **A-** and **B** listings, and stores **price + URL + stock**
5. Writes the merged dataset to `data/prices.json`

### Caching / API limits

To minimize calls and avoid rate limits, the script caches responses:

- `data/cache/ppt-s12a-cards.json`
- `data/cache/japan-toreca-s12a-listings.json`

To refresh everything:

```bash
pnpm run build:s12a:force
```

## Project structure (relevant)

```
app/                  # Next.js UI + API route
components/           # Dashboard components
lib/                  # Types + helpers
data/prices.json      # Generated dataset used by the dashboard
scripts/build-s12a.js # Main data builder
```

## Customer: Daily DB Refresh

This project includes two commands so you can refresh prices daily without manual coding.

### 1) Estimate first (recommended)

Run:

```bash
pnpm run scrape:estimate
```

This prints:
- how many cards are due for refresh
- estimated API calls
- estimated Browserless credit usage
- rough runtime estimate

### 2) Run daily scrape

Run:

```bash
pnpm run scrape:daily
```

What it does:
- selects cards using the scrape policy tiers (favorites/in-range/out-of-range)
- calls the internal scrape API (`/api/scrape-v2`) card-by-card
- writes results directly to PostgreSQL via Prisma
- prints a JSON summary (processed, success, offers, credits, errors)

### Optional limits (to control usage)

You can set caps and delays via env vars before running:

```bash
SCRAPE_DAILY_CAP=100 SCRAPE_DELAY_MIN_MS=3000 SCRAPE_DELAY_MAX_MS=9000 pnpm run scrape:daily
```

Useful env vars:
- `SCRAPE_DAILY_CAP` (default from policy: 300)
- `SCRAPE_DELAY_MIN_MS` (default: 3000)
- `SCRAPE_DELAY_MAX_MS` (default: 9000)
- `SCRAPE_BASE_URL` (default: `http://localhost:3000`)

### Dry-run mode (no writes)

To test selection/planning without scraping:

```bash
SCRAPE_DRY_RUN=1 pnpm run scrape:daily
```

### Practical customer flow

1. Start app/API locally (`pnpm dev`) or use hosted deployment  
2. Run `pnpm run scrape:estimate`  
3. Run `pnpm run scrape:daily` once per day  
4. Check output JSON summary for success/errors

### Run fully automatic on local Mac

If the customer wants this to run daily without touching the terminal, follow:

- [`docs/LOCAL_DAILY_AUTORUN_MAC.md`](docs/LOCAL_DAILY_AUTORUN_MAC.md)
