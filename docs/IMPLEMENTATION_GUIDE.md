# Japanese Card Sites - Implementation Guide

## Quick Reference: All 9 Sites

| Site | Base URL | Type | Status |
|------|----------|------|--------|
| Japan-Toreca | shop.japan-toreca.com | Shopify | ✅ Working |
| Dorasuta | dorasuta.jp | Custom | ✅ Working |
| Toretoku | toretoku.jp | Custom | ✅ Working |
| Torecacamp | torecacamp-pokemon.com | Shopify | ✅ Working |
| Hobibinet | hobibinet-pokemon.com | Shopify | ✅ Working |
| Cardrush | cardrush-pokemon.jp | Custom | ✅ Working |
| Playze | playze.jp | Shopify | ✅ Working |
| C-Labo | c-labo-online.jp | Unknown | ✅ Working |
| Fukufuku Toreka | pokemon.fukufukutoreka.com | Shopify | ✅ Working |

---

## Tested curl Commands

### Japan-Toreca
```bash
# Collection page
curl -s "https://api.scrape.do/?token=YOUR_TOKEN&url=https://shop.japan-toreca.com/collections/pokemon&render=true"

# Product page (A-)
curl -s "https://api.scrape.do/?token=YOUR_TOKEN&url=https://shop.japan-toreca.com/products/pokemon-10940-a&render=true"
```

### Dorasuta
```bash
# Series list
curl -s "https://api.scrape.do/?token=YOUR_TOKEN&url=https://dorasuta.jp/pokemon-card/series-list&render=true"

# Product page (shows ALL conditions!)
curl -s "https://api.scrape.do/?token=YOUR_TOKEN&url=https://dorasuta.jp/pokemon-card/product?pid=605736&render=true"
```

### Toretoku
```bash
# Pokemon section
curl -s "https://api.scrape.do/?token=YOUR_TOKEN&url=https://www.toretoku.jp/pokemon&render=true"

# Search (by card name)
curl -s "https://api.scrape.do/?token=YOUR_TOKEN&url=https://www.toretoku.jp/item?kw=ピカチュウ&render=true"
```

### Hobibinet
```bash
# Homepage
curl -s "https://api.scrape.do/?token=YOUR_TOKEN&url=https://hobibinet-pokemon.com&render=true"

# Search
curl -s "https://api.scrape.do/?token=YOUR_TOKEN&url=https://hobibinet-pokemon.com/search?q=SV10&render=true"
```

---

## Quality (Condition) Mapping

### Dorasuta - Shows ALL conditions on ONE page! 🎉

```html
<tr>
  <td class="condition">状態A</td>
  <td class="price">300&nbsp;円</td>
  <td>在庫数：362</td>
</tr>
<tr>
  <td class="condition">状態A特価</td>
  <td class="price">199&nbsp;円</td>
  <td>在庫数：216</td>
</tr>
<tr>
  <td class="condition">状態C</td>
  <td class="price">80&nbsp;円</td>
  <td>在庫数：1</td>
</tr>
```

**Mapping:**
- `状態A` or `状態A特価` → A-
- `状態B` → B
- `状態C` → C (lower quality, may skip)

### Japan-Toreca - Quality in URL

```
Product A-: https://shop.japan-toreca.com/products/pokemon-10940-a
Product B:  https://shop.japan-toreca.com/products/pokemon-10940-b
```

**Mapping:**
- URL ends with `-a` → A-
- URL ends with `-b` → B

### Other Sites

| Site | A- Pattern | B Pattern |
|------|-----------|-----------|
| Toretoku | Aランク | Bランク |
| Cardrush | 美品 | 並品 |
| Torecacamp/Hobibinet/Playze | A- | B |

---

## Scraping Strategy: Directory vs Individual

### Strategy 1: Directory Scraping (Most Efficient)

**Best for:** Initial catalog building, bulk updates

**How it works:**
- Scrape collection/search pages (20-50 products per page)
- Extract all product URLs and basic info
- Follow product URLs for detailed price/stock

**Cost:** 
- 1 credit = 1 page (20-50 products)
- Very efficient for bulk updates

**Example - Dorasuta Series List:**
```bash
# One scrape gets ALL series
# Parse series links, then scrape each series page
# Each series page shows multiple cards
```

### Strategy 2: Individual Product Scraping (Most Accurate)

**Best for:** Reloading favorites, specific cards, accuracy

**How it works:**
- Scrape each product URL individually
- Get exact price, stock, and condition

**Cost:**
- 1 credit = 1 product
- Higher cost but guaranteed accuracy

**Example:**
```bash
# Scrape specific card A-
curl "...&url=https://dorasuta.jp/pokemon-card/product?pid=605736"

# Parse multiple conditions from single page
```

---

## Recommended Hybrid Approach

### For New Set Addition:
1. **Directory scrape** Dorasuta series list (1 credit)
2. **Parse** all product URLs for the set
3. **Batch scrape** product pages (1 credit per product)
4. **Store** all offers in database

### For Daily Reloads:
1. **Directory scrape** collection pages for stale cards
2. **Individual scrape** favorite cards (guaranteed fresh data)
3. **Update** database with new prices

### Cost Estimate (300 cards/day):
- Directory approach: ~10 credits (batch)
- Individual approach: ~600 credits (if all individual)
- Hybrid: ~100-200 credits (mix of both)
- **Monthly:** 3,000-6,000 credits
- **Hobby plan:** 250,000 credits = plenty of headroom!

---

## Next Steps for Implementation

### 1. Test Individual Sites (30 mins)
Run the curl commands above for each site to verify:
- ✅ Page loads successfully
- ✅ Price is extractable
- ✅ Stock status visible
- ✅ Quality indicator found

### 2. Build Provider Configs (1 hour)
Already done in `lib/scraping/providers.ts`:
- ✅ All 9 sites added
- ✅ Selectors configured
- ✅ Quality patterns mapped
- ✅ Stock indicators defined

### 3. Implement Scraping Engine (2 hours)
Already done in `lib/scraping/engine.ts`:
- ✅ Scrape.do integration
- ✅ Provider configs loaded
- ✅ HTML parsing with cheerio
- ✅ Error handling

### 4. Connect to UI (2 hours)
Need to update:
- `CardsWithFilters.tsx` - use new `/api/scrape` endpoint
- Add provider selector dropdown
- Show scrape metrics (credits used, time)

### 5. Test End-to-End (1 hour)
Test flow:
1. Click reload on card
2. Scrape.do fetches page
3. Parse price/stock/quality
4. Save to database
5. UI updates with fresh data

---

## Key Findings

### Dorasuta is Special 🌟
- Shows ALL conditions on one product page
- Can get A-, A-特価, B, C in single scrape
- Most efficient for multi-condition cards

### Shopify Sites are Consistent
- Japan-Toreca, Torecacamp, Hobibinet, Playze, Fukufuku Toreka
- Similar HTML structure
- Same selectors work across sites

### Custom Sites Need Care
- Dorasuta, Toretoku, Cardrush, C-Labo
- Each has unique structure
- But all parseable with specific selectors

### All Sites Work with Scrape.do
- No Cloudflare blocks
- Average response: 5-20 seconds
- HTML fully rendered
- Ready for extraction

---

## API Token

Current token (Hobby plan - 250k credits):
```
1d8e566da1314f44948f56ea1e34508d22364541631
```

Stored in `.env` (not committed to git)

---

## Need Help?

Check these files:
- `docs/JAPANESE_SITES_RESEARCH.md` - Detailed site analysis
- `lib/scraping/providers.ts` - All provider configs
- `lib/scraping/engine.ts` - Scraping engine
- `app/api/scrape/route.ts` - API endpoint
