# Shop URL Matching - Detailed Walkthrough (Real Card Example)

Date: 2026-03-23

## Why this doc
You asked for a very detailed explanation with a real currently tracked card so it is clear how URLs from different shops end up on one card record.

This uses a real card from your current `data/prices.json`:
- **Set**: `M1L`
- **Card number**: `091/063`
- **Name**: `Lillie's Determination - 091/063`
- **Rarity**: `SAR`

US source row:
- `https://www.tcgplayer.com/product/647200`

Mapped JP shop URLs currently attached to this same card:
- Japan-Toreca A-: `https://shop.japan-toreca.com/products/pokemon-221343-a-damaged?_pos=10&_sid=6791a10dd&_ss=r`
- Japan-Toreca B: `https://shop.japan-toreca.com/products/pokemon-221343-b?_pos=15&_sid=6791a10dd&_ss=r`
- Toretoku A: `https://www.toretoku.jp/item/details/208194`
- TorecaCamp A-/B: `https://torecacamp-pokemon.com/products/rc_it3a62bon0w9_5hzt`
- Hobibinet A-: `https://hobibinet-pokemon.com/products/rc_itx1c4fixbwq_6cqa`
- Hobibinet B: `https://hobibinet-pokemon.com/products/rc_itc0953816y8_i1bh`
- Dorasuta B (as currently stored): `https://torecacamp-pokemon.com/products/rc_it3a62bon0w9_5hzt`

---

## Core rule (important)
There is **no direct URL conversion** between sources.

The system does **not** do:
- `tcgplayer product id` -> `japan-toreca product id`
- or `toretoku details id` -> `torecacamp handle`

Instead it does:
1. scrape each source independently
2. normalize each scraped row into a common shape
3. join rows by card identity (`set` + `cardNumber`, with rarity/quality guardrails)
4. write best A-/B offers per source onto one card object

---

## Step-by-step with this exact card

## Step 1) Build anchor card from US API
`scripts/build-sets.js` fetches set cards from PokemonPriceTracker API.

For this card, anchor fields look like:
- `setId = m1l`
- `set = M1L`
- `cardNumber = 091/063`
- `rarity = SAR`
- `usMarket.tcgplayer.url = https://www.tcgplayer.com/product/647200`

This anchor row is the base card record that JP offers attach to.

## Step 2) Scrape each JP source independently
Each source scraper creates rows containing (at minimum):
- `cardNumber`
- `quality` (`A-` or `B`)
- `priceJPY`
- `url`
- `inStock` (or stock that is converted to inStock)

For this card, current stored values are:

### Japan-Toreca
- A-: `¥32,000`, `inStock: true`, URL `pokemon-221343-a-damaged`
- B: `¥24,000`, `inStock: false`, URL `pokemon-221343-b`

### Toretoku
- A-: `¥41,800`, `stockA: 1` -> treated in UI as in stock
- B: not found

### TorecaCamp
- A-: `¥32,800`, `inStock: true`
- B: `¥29,800`, `inStock: false`

### Hobibinet
- A-: `¥39,700`, `inStock: true`
- B: `¥34,700`, `inStock: true`

### Dorasuta
- A-: not found
- B: `¥29,800`, `inStock: false`, URL currently same as TorecaCamp for this card

---

## Step 3) Normalize and reduce rows per source
Before merging:
- `quality` gets normalized to `A-` / `B`
- rows are grouped by `cardNumber`
- for each quality, best row is selected (lowest `priceJPY`)

Conceptually:
```txt
Map<cardNumber, { 'A-': bestOffer | null, 'B': bestOffer | null }>
```

This is done source-by-source, not across all sources yet.

---

## Step 4) Join source maps onto the anchor card
When building final `cards[]`, code does:
1. take one API card (`cardNumber = 091/063`)
2. lookup this key in each source map (`jtByCard`, `ttByCard`, `tcByCard`, etc)
3. attach whichever A-/B offers exist

That is exactly how one card ends up with:
- `japanToreca.*`
- `toretoku.*`
- `torecacamp.*`
- `hobibinet.*`
- `dorasuta.*`
- and one US row (`usMarket.tcgplayer.*`)

---

## Why this feels “magical”
From UI view, it looks like unrelated URLs were “found from” the TCGPlayer URL.
In reality:
- TCGPlayer URL is just one field on the anchor card.
- JP URLs are discovered by independent shop scraping.
- The merge key is card identity (`set` + `cardNumber`) and quality filtering.

So the connection is card metadata, not URL ID translation.

---

## How baseline/profit is then computed (using these offers)
Homepage converts builder record to `japanesePrices[]`, then picks baseline with this policy:
1. in-stock A- (cheapest)
2. in-stock B (cheapest)
3. out-of-stock A- (cheapest)
4. out-of-stock B (cheapest)

Using current card values:
- in-stock A- candidates:
  - Japan-Toreca A-: `¥32,000` (in)
  - Toretoku A-: `¥41,800` (stock 1)
  - TorecaCamp A-: `¥32,800` (in)
  - Hobibinet A-: `¥39,700` (in)
- baseline becomes **Japan-Toreca A- ¥32,000** (cheapest in-stock A-).

US side:
- market price = `$145.87`

Margin displayed is computed against baseline USD conversion.

---

## Edge cases to watch (important)
1. **Set contamination**
   - search pages can include wrong-set items; builder has set-prefix/denominator guardrails in some sources.
2. **Card number parsing drift**
   - if source title format changes, rows may fail to join by `cardNumber`.
3. **Quality label differences**
   - some sources use `A`; code normalizes where implemented.
4. **Stock interpretation differences**
   - some sources expose explicit stock counts, others rely on textual hints.
5. **URL anomalies**
   - if one source field contains an unexpected URL (example: Dorasuta field matching TorecaCamp URL), join still works by cardNumber, but source URL quality should be audited.

---

## Practical debugging checklist for a single card
If a shop URL is missing/wrong for one card:
1. confirm API anchor exists for set+number
2. confirm each source scraper produced a row with same `cardNumber`
3. confirm quality normalized to A-/B
4. confirm row survived source guardrails
5. inspect reduced “best by quality” row chosen for that source
6. inspect final merged card object in `data/prices.json`

---

## Bottom line
For this card (`M1L 091/063`), all attached shop URLs are not derived from each other.
They are independently scraped and then joined by shared card identity fields, which is why the final record can contain one TCGPlayer URL and multiple different JP shop URLs simultaneously.

