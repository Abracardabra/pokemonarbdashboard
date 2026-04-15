# Pokemon TCG Japanese Arbitrage Dashboard (S12a)

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
npm install
npm run build:s12a   # generates data/prices.json
npm run dev
```

Optional API key:

```bash
# .env.local
POKEPRICE_API_KEY=your_api_key_here
```

## How data/prices.json is generated

`npm run build:s12a` runs `scripts/build-s12a.js`, which:

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
npm run build:s12a:force
```

## Project structure (relevant)

```
app/                  # Next.js UI + API route
components/           # Dashboard components
lib/                  # Types + helpers
data/prices.json      # Generated dataset used by the dashboard
scripts/build-s12a.js # Main data builder
```
