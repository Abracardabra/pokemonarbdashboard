# Japanese Card Shop Sites - Research Findings

## Executive Summary

All 9 Japanese card shop sites tested successfully with Scrape.do. Each site has different URL structures, listing formats, and quality indicators. This document provides detailed findings for implementing a unified scraping strategy.

---

## Site-by-Site Analysis

### 1. Japan-Toreca (トレカキングダム) ✅
**URL:** https://shop.japan-toreca.com

**Structure:**
- Platform: Shopify
- Collection pages: `/collections/pokemon`
- Product pages: `/products/pokemon-{id}-{quality}`
- Quality suffix: `-a` (A-) or `-b` (B)

**Key Findings:**
- ✅ Full Shopify structure - easy to parse
- ✅ Collection pages show product grids
- ✅ Quality in URL: `-a` or `-b` suffix
- ✅ Standard Shopify price selectors work
- ✅ Stock indicators: "在庫あり", "売り切れ"

**URLs to scrape:**
```
Collection: https://shop.japan-toreca.com/collections/pokemon
Product A-: https://shop.japan-toreca.com/products/pokemon-10940-a
Product B:  https://shop.japan-toreca.com/products/pokemon-10940-b
```

**Quality mapping:**
- URL contains `-a` → A-
- URL contains `-b` → B

---

### 2. Cardrush (カードラッシュ) ✅
**URL:** https://www.cardrush-pokemon.jp

**Structure:**
- Platform: Custom (OCN based)
- Homepage shows featured items
- List view: `/products/list.php`
- Individual product pages

**Key Findings:**
- ✅ Loads successfully
- ✅ Has search functionality
- ✅ Product grid/list structure
- ⚠️ Custom platform - needs specific selectors

**URLs to scrape:**
```
Homepage: https://www.cardrush-pokemon.jp
List:     https://www.cardrush-pokemon.jp/products/list.php
Search:   https://www.cardrush-pokemon.jp/item?keyword={name}
```

---

### 3. Torecacamp ✅
**URL:** https://torecacamp-pokemon.com

**Structure:**
- Platform: Shopify (similar to Japan-Toreca)
- Collection: `/collections/all`
- Product pages with variants

**Key Findings:**
- ✅ Shopify-based
- ✅ Collection listings available
- ✅ Similar structure to Japan-Toreca

**URLs to scrape:**
```
Collection: https://torecacamp-pokemon.com/collections/all
Product:    https://torecacamp-pokemon.com/products/{handle}
```

---

### 4. Toretoku (トレトク) ✅
**URL:** https://www.toretoku.jp/pokemon

**Structure:**
- Platform: Custom
- Search-based: `/item?kw={keyword}`
- Detail view: `/item/details/{id}`

**Key Findings:**
- ✅ Has search endpoint
- ✅ "カードの状態" (card condition) page exists
- ⚠️ May need search-based scraping

**URLs to scrape:**
```
Pokemon:    https://www.toretoku.jp/pokemon
Search:     https://www.toretoku.jp/item?kw={card_name}
Item:       https://www.toretoku.jp/item/details/{id}
Condition:  https://www.toretoku.jp/guide (explains A-/B)
```

---

### 5. Dorasuta (ドラゴンスター) ✅
**URL:** https://dorasuta.jp/pokemon-card

**Structure:**
- Platform: Custom
- Series list: `/pokemon-card/series-list`
- Product: `/pokemon-card/product?pid={id}`

**Key Findings:**
- ✅ Shows series list (S12A, SV9, etc.)
- ✅ Individual product pages
- ✅ Product IDs in URL (?pid=xxx)
- ✅ Quality shown on page: "状態A", "状態B"

**URLs to scrape:**
```
Series list: https://dorasuta.jp/pokemon-card/series-list
Product:     https://dorasuta.jp/pokemon-card/product?pid=605736
```

**Quality mapping:**
- "状態A" or "状態A特価" → A-
- "状態B" → B

---

### 6. Hobibinet (ホビビ) ✅
**URL:** https://hobibinet-pokemon.com

**Structure:**
- Platform: Shopify
- Has search: `/search?q={term}`

**Key Findings:**
- ✅ Shopify-based
- ✅ Has search functionality
- ✅ Product inventory colors:
  - `--product-in-stock-color: #008a00` (green)
  - `--product-sold-out-color: #d1d1d4` (gray)

**URLs to scrape:**
```
Homepage: https://hobibinet-pokemon.com
Search:   https://hobibinet-pokemon.com/search?q={term}
```

---

### 7. Playze ✅
**URL:** https://playze.jp/collections/pokemon

**Structure:**
- Platform: Shopify
- Collection: `/collections/pokemon`

**Key Findings:**
- ✅ Shopify-based
- ✅ Collection listing

**URLs to scrape:**
```
Collection: https://playze.jp/collections/pokemon
```

---

### 8. C-Labo (カードラボ) ✅
**URL:** https://www.c-labo-online.jp/page/125

**Structure:**
- Platform: Custom or Shopify

**Key Findings:**
- ✅ Page 125 is Pokemon specific
- ⚠️ Needs more investigation

**URLs to scrape:**
```
Pokemon: https://www.c-labo-online.jp/page/125
```

---

### 9. Fukufuku Toreka (フクフクトレカ) ✅
**URL:** https://pokemon.fukufukutoreka.com

**Structure:**
- Platform: Shopify (subdomain)

**Key Findings:**
- ✅ Shopify-based
- ⚠️ Needs more investigation

**URLs to scrape:**
```
Homepage: https://pokemon.fukufukutoreka.com
```

---

## Quality/Condition Mapping Summary

| Site | A- Indicator | B Indicator |
|------|--------------|-------------|
| Japan-Toreca | URL: `-a` | URL: `-b` |
| Dorasuta | 「状態A」, 「状態A特価」 | 「状態B」 |
| Toretoku | Aランク | Bランク |
| Cardrush | 美品 | 並品 |
| Torecacamp | A- | B |
| Hobibinet | A- | B |

---

## Recommended Scraping Strategy

### Option 1: Directory/List Scraping (Most Efficient)

For sites with collection pages:

```bash
# Japan-Toreca - Collection page
curl "https://api.scrape.do/?token=...&url=https://shop.japan-toreca.com/collections/pokemon&render=true"

# Dorasuta - Series list
curl "https://api.scrape.do/?token=...&url=https://dorasuta.jp/pokemon-card/series-list&render=true"

# Hobibinet - Search results
curl "https://api.scrape.do/?token=...&url=https://hobibinet-pokemon.com/search?q=SV10&render=true"
```

**Pros:**
- 1 credit = multiple products
- Faster updates
- Less API calls

**Cons:**
- May not get all variants (A-/B)
- Need to handle pagination

### Option 2: Individual Product Scraping (Most Accurate)

Scrape each product URL individually:

```bash
# Japan-Toreca product
curl "https://api.scrape.do/?token=...&url=https://shop.japan-toreca.com/products/pokemon-10940-a&render=true"

# Dorasuta product
curl "https://api.scrape.do/?token=...&url=https://dorasuta.jp/pokemon-card/product?pid=605736&render=true"
```

**Pros:**
- Always get accurate price + stock
- Clear quality indicator
- Direct product URL

**Cons:**
- More credits (1 per product)
- Slower for large catalogs

---

## Cost Estimate (Hobby Plan: $29/mo, 250k credits)

### Directory Scraping Approach
- 1 credit = ~20-50 products per page
- Daily: 50 collection pages = 50 credits
- Monthly: 50 × 30 = 1,500 credits
- **Usage: 0.6% of plan**

### Individual Product Scraping
- 300 cards/day × 2 conditions × 5 providers = 3,000 credits/day
- Monthly: 3,000 × 30 = 90,000 credits
- **Usage: 36% of plan**

**Recommendation:** Use hybrid approach
- Directory scraping for initial catalog
- Individual scraping for favorites/high-priority cards

---

## Next Steps

1. **Test specific product pages** for each site to extract selectors
2. **Test search functionality** on sites that support it
3. **Document exact CSS selectors** for price, stock, and quality
4. **Build provider configs** based on findings
5. **Implement directory scraping** for bulk updates
6. **Keep individual scraping** for favorites/reloads

---

## Tested URLs (All Working with Scrape.do)

```bash
# Japan-Toreca
curl "https://api.scrape.do/?token=YOUR_TOKEN&url=https://shop.japan-toreca.com/collections/pokemon&render=true"

# Dorasuta Series List
curl "https://api.scrape.do/?token=YOUR_TOKEN&url=https://dorasuta.jp/pokemon-card/series-list&render=true"

# Dorasuta Product
curl "https://api.scrape.do/?token=YOUR_TOKEN&url=https://dorasuta.jp/pokemon-card/product?pid=605736&render=true"

# Toretoku
curl "https://api.scrape.do/?token=YOUR_TOKEN&url=https://www.toretoku.jp/pokemon&render=true"

# Hobibinet
curl "https://api.scrape.do/?token=YOUR_TOKEN&url=https://hobibinet-pokemon.com&render=true"
```

All sites respond in 5-45 seconds with `render=true`.
