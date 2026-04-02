# Site Exploration Results - My Research

## Date: March 31, 2026
## Method: Direct HTTP requests, sitemap checks, Scrape.do testing

---

## 1. Japan-Toreca (shop.japan-toreca.com)

### Sitemap Analysis
**Status**: ✅ Has sitemaps

```xml
<!-- sitemap.xml -->
<sitemapindex>
  <sitemap>https://shop.japan-toreca.com/sitemap_products_1.xml?from=7885030391960&amp;to=8388448780440</sitemap>
  <sitemap>https://shop.japan-toreca.com/sitemap_products_2.xml?from=8388448813208&amp;to=8388575625368</sitemap>
  ... 9 product sitemaps total
</sitemapindex>
```

**Product Sitemap URLs**:
- Format: `https://shop.japan-toreca.com/sitemap_products_{N}.xml?from={ID}&to={ID}`
- 9 separate product sitemaps
- Estimated: ~5,000+ products

**Access**: Direct curl works (no Cloudflare)
**Product URLs**: Already have 3,219 in DB (96% coverage)

**Discovery Method**: 
1. Use existing URLs from DB (primary)
2. For missing URLs: Parse sitemap_products_*.xml files
3. Match to cards by product title

**URL Pattern in Sitemap**:
```xml
<url>
  <loc>https://shop.japan-toreca.com/products/pokemon-{ID}-{condition}</loc>
  <lastmod>2026-03-15</lastmod>
</url>
```

---

## 2. TorecaCamp (torecacamp-pokemon.com)

### Sitemap Analysis
**Status**: ✅ Has sitemaps

```xml
<!-- sitemap.xml -->
<sitemapindex>
  <sitemap>https://torecacamp-pokemon.com/sitemap_products_1.xml?from=7804387786926&amp;to=7999176900782</sitemap>
  ... 9 product sitemaps
</sitemapindex>
```

**Access**: Direct curl works (no Cloudflare)
**Product URLs**: Already have 3,549 in DB (98% coverage)

**Discovery Method**:
1. Use existing URLs from DB (primary)
2. For missing URLs: Parse sitemap or collection pages
3. Match by title/set

**URL Pattern**:
```
https://torecacamp-pokemon.com/products/rc_{random_handle}
```

---

## 3. Dorasuta (dorasuta.jp)

### Sitemap/Robots Analysis
**Status**: ❌ Cloudflare protected

```html
<!-- robots.txt returns Cloudflare challenge -->
<title>Just a moment...</title>
<meta http-equiv="refresh" content="360">
<script>window._cf_chl_opt = { ... }</script>
```

**Protection**: Cloudflare managed challenge
**Tested**: Series list page times out with Scrape.do (25s+ response time)

### URL Structure Discovery

**From existing DB URLs (171 B-quality URLs)**:
```
Pattern: https://dorasuta.jp/pokemon-card/product?pid={NUMERIC_ID}
Examples from DB: 
- pid=605736 (tested, works)
```

**Hypothesized Discovery Path**:
1. Series list: `https://dorasuta.jp/pokemon-card/series-list`
2. Individual series: `https://dorasuta.jp/pokemon-card/series/{CODE}`
   - Example: `/series/S12A`, `/series/SV9`
3. Product pages: `https://dorasuta.jp/pokemon-card/product?pid={ID}`

**Problem**: 
- Series list times out with Scrape.do
- Need to test alternative approaches

**Alternative Discovery Methods**:

**Option A: Search by Card Name**
```
URL: https://dorasuta.jp/pokemon-card?keyword={CARD_NAME}
Method: Search and extract product links
```

**Option B: Direct Product ID Guessing**
```
Pattern: pid ranges from existing URLs (171 known)
Range: ~600,000 - 700,000 based on test URL (pid=605736)
Method: Not feasible (too many combinations)
```

**Option C: Series Pages (if accessible)**
```
URL: https://dorasuta.jp/pokemon-card/series/{SET_CODE}
Method: Scrape series page, extract product links
Needs: Testing with working set codes
```

**Recommendation**: 
- Use Scrape.do with longer timeout
- Try series pages directly: `/series/S12A`, `/series/SV9`, etc.
- Test search endpoint: `/pokemon-card?keyword={name}`

---

## 4. Toretoku (toretoku.jp)

### Structure Analysis
**Status**: ⚠️ Partial data in DB (50% coverage)

**From existing URLs (903 URLs)**:
```
Pattern: https://www.toretoku.jp/item/details/{NUMERIC_ID}
ID Range: 131,156 - 132,198 (from samples)
```

**Discovery Method (from build-sets.js)**:
```
URL: https://www.toretoku.jp/item?genre=5&kw={SET_CODE}&page={N}
Parameters:
  - genre=5 (Pokemon category)
  - kw={SET_CODE} (search keyword)
  - rank5[]=2 (A rank)
  - rank5[]=3 (B rank)
  - page={N} (pagination)
```

**Test**: Need to verify search endpoint works

---

## 5. Hobibinet (hobibinet-pokemon.com)

### Structure Analysis
**Status**: ❌ Minimal data (2.3% coverage)

**From existing URLs (66 URLs)**:
```
Pattern: https://hobibinet-pokemon.com/products/rc_{handle}
Same pattern as TorecaCamp (Shopify)
```

**Discovery Method**:
```
URL: https://hobibinet-pokemon.com/search?q={SET_CODE}
Method: Search returns embedded meta JSON
Extraction: var meta = { products: [...] }
```

**Test**: Need to verify search works and returns results

---

## 6. Cardrush (cardrush-pokemon.jp)

### Structure Analysis
**Status**: ❌ No URLs in DB (0% coverage)

**Sitemap**: Cloudflare protected (returns challenge page)

**Hypothesized Structure** (based on typical OCN platforms):
```
Homepage: https://www.cardrush-pokemon.jp/
List page: https://www.cardrush-pokemon.jp/products/list.php
Product page: https://www.cardrush-pokemon.jp/products/detail.php?product_id={ID}
```

**Needs**: Full exploration with Scrape.do

---

## 7. Playze (playze.jp)

### Sitemap Analysis
**Status**: ✅ Has sitemaps (Shopify)

```xml
<sitemapindex>
  <sitemap>https://playze.jp/sitemap_products_1.xml?from=7797571387589&amp;to=8203497275589</sitemap>
</sitemapindex>
```

**Discovery Method**:
1. Parse sitemap_products_*.xml
2. Or use collection page: `/collections/pokemon`
3. Match by product title

**Expected URL Pattern**:
```
https://playze.jp/products/{handle}
```

**Access**: Need to test with Scrape.do

---

## 8. C-Labo (c-labo-online.jp)

### Structure Analysis
**Status**: ❌ No URLs in DB (0% coverage)

**Known**: Has Pokemon page `/page/125`

**Needs**: Full exploration

---

## 9. Fukufuku Toreka (pokemon.fukufukutoreka.com)

### Structure Analysis
**Status**: ❌ No URLs in DB (0% coverage)

**Platform**: EC-CUBE (Japanese e-commerce)

**Needs**: Full exploration

---

## Summary Table

| Site | URLs in DB | Coverage | Sitemap | Cloudflare | Discovery Method |
|------|------------|----------|---------|------------|------------------|
| Japan-Toreca | 3,219 | 96% | ✅ | No | Use DB + sitemap backup |
| TorecaCamp | 3,549 | 98% | ✅ | No | Use DB + sitemap backup |
| Toretoku | 903 | 50% | ? | ? | Search by set code |
| Dorasuta | 171 | 9% | ❌ | ✅ | Series pages (NEEDS TEST) |
| Hobibinet | 66 | 2% | ? | ? | Search (NEEDS TEST) |
| Cardrush | 0 | 0% | ❌ | ✅ | Full exploration needed |
| Playze | 0 | 0% | ✅ | ? | Sitemap (NEEDS TEST) |
| C-Labo | 0 | 0% | ? | ? | Full exploration needed |
| Fukufuku | 0 | 0% | ? | ? | Full exploration needed |

---

## Next Steps for URL Discovery

### Immediate (Can Do Now)
1. ✅ Japan-Toreca - Use existing URLs
2. ✅ TorecaCamp - Use existing URLs
3. ⬜ Toretoku - Test search endpoint `/item?genre=5&kw={set}`

### Needs Scrape.do Testing
4. ⬜ Dorasuta - Test series pages with longer timeout
5. ⬜ Hobibinet - Test search endpoint
6. ⬜ Playze - Test sitemap access via Scrape.do

### Full Exploration Needed
7. ⬜ Cardrush - Test list.php and product structure
8. ⬜ C-Labo - Explore /page/125 structure
9. ⬜ Fukufuku Toreka - Explore homepage and categories

---

## Credit Estimates for URL Discovery

| Site | Method | Est. Pages | Est. Credits |
|------|--------|------------|--------------|
| Toretoku | Search by set | ~50 | 50 |
| Dorasuta | Series pages | ~200 | 200 |
| Hobibinet | Search | ~50 | 50 |
| Playze | Sitemap | ~10 | 10 |
| Cardrush | List pages | ~100 | 100 |
| C-Labo | Category | ~50 | 50 |
| Fukufuku | Category | ~50 | 50 |
| **Total** | | | **~510 credits** |

---

## My Findings

**What I confirmed**:
- Japan-Toreca and TorecaCamp have sitemaps (accessible)
- Dorasuta and Cardrush have Cloudflare (need Scrape.do)
- Playze has sitemap (Shopify)
- We have good URL coverage for 2 sites (96-98%)
- We have partial coverage for 1 site (50%)
- We have poor coverage for 6 sites (0-9%)

**What needs testing**:
- Dorasuta series pages (times out, need longer timeout)
- Toretoku search endpoint
- Hobibinet search endpoint  
- Playze sitemap via Scrape.do
- Cardrush full structure
- C-Labo and Fukufuku structure

**Recommendation**:
Start with the 3 sites we have URLs for, then systematically test the discovery methods for the other 6 sites using Scrape.do with appropriate timeouts.
