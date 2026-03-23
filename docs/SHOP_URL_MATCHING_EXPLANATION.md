# How Shop URL Matching Works

Date: 2026-03-23

## Short answer
The app does **not** convert one shop URL/ID directly into another shop URL/ID.

There is no rule like:
- TCGPlayer `571792` -> Japan-Toreca `pokemon-18485-a-damaged` -> Toretoku `131835` -> TorecaCamp `rc_itnhjt9dl14k_mzdl`

Instead, each source is scraped independently, and then records are merged by card identity fields:
- `set`
- `cardNumber` (for example `262/172`)
- `rarity`

That is why URLs can look like they are “magically found”: they are discovered per source and then attached to the same card record by matching card fields, not by converting IDs.

## Your example
Given:
- TCGPlayer URL: `https://www.tcgplayer.com/product/571792`
- Japan-Toreca URL: `https://shop.japan-toreca.com/products/pokemon-18485-a-damaged`
- Toretoku URL: `https://www.toretoku.jp/item/details/131835`
- TorecaCamp URL: `https://torecacamp-pokemon.com/products/rc_itnhjt9dl14k_mzdl`

What actually happens:
1. US API returns a card row with card metadata (name, set/card number/rarity, market price, tcgplayer URL).
2. JP scrapers discover offers per shop and parse each offer’s own set/card number/rarity/quality/price/url.
3. Builder joins rows where card identity matches (same set + card number).
4. Resulting single card object contains multiple shop URLs under that card.

## Detailed matching pipeline (current builder flow)

## 1) Build the US card list (anchor records)
`scripts/build-sets.js` fetches cards from PokemonPriceTracker API and keeps only allowed rarities.

Each API card includes:
- `cardNumber` (for example `262/172`)
- `rarity`
- US market data + `tcgPlayerUrl`

This becomes the anchor list of cards to enrich with JP shop offers.

## 2) Scrape each JP source independently

### Japan-Toreca
- Scrapes search listing pages by set+rarity.
- Parses heading to extract `cardNumber`, `rarity`, `quality`, plus `priceJPY` and `url`.
- Tracks `inStock` via sold-out signals.

### Toretoku
- Scrapes listing pages with rank filters (A/B).
- Regex extracts `cardNumber`, `rarity`, rank, `priceJPY`, and detail URL.
- Extracts `stock`.

### TorecaCamp
- Discovers product handles from search pages.
- Fetches `/products/<handle>.js` (Shopify JSON).
- Extracts `cardNumber`, `rarity`, A-/B variant prices, `inStock`, and product URL.

### Hobibinet (if enabled)
- Parses embedded Shopify `meta.products` in search HTML.
- Extracts condition, card number, price, URL.

## 3) Normalize offers by card number + quality
Before merging:
- Quality is normalized to `A-` / `B`.
- For each source, offers are reduced to best per card/quality (lowest price wins).

Conceptually:
- map key = `cardNumber`
- value = `{ 'A-': bestOffer, 'B': bestOffer }`

## 4) Merge JP offers onto each API card
For each API card:
- lookup each source map by `cardNumber`
- write matched offers into fields:
  - `japanToreca.aMinus/b`
  - `toretoku.a/b`
  - `torecacamp.aMinus/b`
  - etc.

So the “cross-source mapping” is card identity matching, not URL conversion.

## Why this is reliable (and where it can fail)

Reliable because:
- it uses explicit card metadata (`set + cardNumber + rarity`) from each source.
- builder includes contamination guardrails (set-prefix checks, denominator checks in some sources).

Can fail when:
- source pages have malformed/missing card numbers
- source titles are noisy/inconsistent
- rarity parsing fails or set contamination leaks through search

## Practical implication
If a shop URL is missing for a card, usually the issue is not ID translation.
It is one of:
- scraper did not discover that offer
- parser rejected it (set/rarity/quality guardrails)
- no A-/B offer currently available

## Bottom line
The system “knows” the JP URLs because it scrapes each shop and then links offers to cards by card metadata, not by converting TCGPlayer IDs into JP sub-IDs.

