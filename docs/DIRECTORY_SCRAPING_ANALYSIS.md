# Directory Scraping Analysis

## Summary

**For Rik's requirement**: Find sites where we can scrape multiple cards from listing pages instead of individual product pages to save Scrape.do credits.

**Finding**: 4 out of 9 sites have proven directory scraping working in the existing codebase. However, live testing with Scrape.do `render=true` on collection pages is timing out.

---

## Sites with Working Directory Scraping

### 1. Japan-Toreca ✅ PROVEN WORKING

**Method**: Search listing pages (not collection pages)

**Working URLs from codebase:**
```
# Search by set + rarity + page
/search?q=S12A+SR&page=1
/search?q=M2A+UR&page=2
```

**From `scripts/build-sets.js`:**
```javascript
// Uses cheerio to find products in search results
$('a[href*="/products/pokemon-"]').each((_, el) => {
  const $a = $(el);
  const href = $a.attr('href');
  // Parses card info from link heading
  // Extracts ¥ price from container text
});
```

**Key Finding**: 
- Collection pages (`/collections/pokemon`) - 697KB, timing out with Scrape.do
- Search pages (`/search?q=...`) - **PROVEN WORKING** in build-sets.js
- Search returns products with prices in the listing

**Recommendation**: Use search-based scraping, not collection pages

---

### 2. Toretoku ✅ PROVEN WORKING

**Method**: Listing pages with query parameters

**Working URLs from codebase:**
```
/item?genre=5&stock=1&rank5[]=2&rank5[]=3&page=1
```

**From `scripts/build-sets.js`:**
```javascript
// Parses from li.list elements
// Regex extracts: JP name, rarity, set, card number, rank (A/B)
// Price: ¥... format from text
// Stock: 在庫数: <n> extracted
```

**Key Finding**:
- Query-parameter based listing pages work
- Returns multiple cards with prices
- Stock numbers included in listing

**Quality Mapping**:
- A => A-
- B => B

---

### 3. TorecaCamp ✅ PROVEN WORKING

**Method**: 2-stage scraping

**Stage 1**: Search HTML to discover product handles
```
/collections/all?q=M2A
```

**Stage 2**: Fetch structured variants via `.js` endpoint
```
/products/{handle}.js
```

**From `scripts/build-sets.js`:**
```javascript
// Stage 1: Get handles from search
const anchors = $('a[href^="/products/"]');

// Stage 2: Get structured data
const url = `${TORECACAMP_BASE}/products/${handle}.js`;
// Returns JSON with variants, prices, availability
```

**Key Finding**:
- Collection page loads (1.1MB HTML)
- Product `.js` endpoint returns clean JSON
- No HTML parsing needed for product details
- Shopify variant fields: `available` for stock

---

### 4. Hobibinet ✅ PROVEN WORKING

**Method**: Search HTML with embedded meta JSON

**From `scripts/scrape-hobibinet.js`:**
```javascript
// Parses embedded var meta = {...} from search results
const metaMatch = html.match(/var meta = (\{[\s\S]*?\});/);
const meta = JSON.parse(metaMatch[1]);

// meta.products contains array of products with:
// - handle
// - variants (with price in cents, title for condition)
```

**Key Finding**:
- Shopify search returns embedded JSON
- No separate product fetches needed
- Gets all data from one search request

---

## Sites Requiring Individual Product Pages

### 5. Dorasuta ⚠️ SINGLE PRODUCT ONLY

**Structure**:
- Series list: `/pokemon-card/series-list` - **timing out**
- Product page: `/pokemon-card/product?pid={id}` - **working**

**Key Finding**:
- One product page shows ALL conditions (A, C, A特価) - this is actually efficient
- No working directory scraping found
- Must scrape individual product pages

**Credit Usage**: 1 request per card (but gets all conditions)

---

### 6. Cardrush ❌ UNKNOWN

**Structure**:
- List page: `/products/list.php` - **404 in research**
- Individual product pages unknown

**Status**: Needs investigation

---

### 7. Playze ❌ UNKNOWN

**Structure**:
- Collection: `/collections/pokemon` - not tested in codebase

**Status**: Likely similar to TorecaCamp (Shopify)

---

### 8. C-Labo ❌ UNKNOWN

**Status**: No scraping logic in codebase

---

### 9. Fukufuku Toreka ❌ UNKNOWN

**Status**: No scraping logic in codebase

---

## Credit Cost Comparison

### Scenario: Scrape 100 cards from a set

| Method | Requests | Est. Credits |
|--------|----------|--------------|
| **Directory Scraping** (Japan-Toreca search) | 5-10 search pages | 5-10 credits |
| **Individual Pages** (all sites) | 100 product pages | 100 credits |
| **Dorasuta hybrid** | 100 pages (gets all conditions) | 100 credits |

**Savings**: Directory scraping saves ~90-95% of credits for bulk operations

---

## Live Test Results (Today)

| Site | Collection Page | Status |
|------|-----------------|--------|
| Japan-Toreca | `/collections/pokemon` | ❌ Timeout (75s) |
| Dorasuta | `/pokemon-card/series-list` | ❌ Timeout (60s) |
| Cardrush | `/products/list.php` | ❌ Timeout (30s) |
| Japan-Toreca Product | `/products/...` | ✅ Working (8s) |
| Dorasuta Product | `/product?pid=...` | ✅ Working (7s) |

**Issue**: Collection pages with `render=true` are timing out
**Solution**: Use search-based methods from existing codebase

---

## Recommendations

### For Bulk Set Scraping (Directory)

1. **Japan-Toreca**: Use `/search?q={set}+{rarity}&page={n}`
   - Proven working in build-sets.js
   - Returns prices in listing
   - Paginated results

2. **Toretoku**: Use `/item?genre=5&stock=1&rank5[]=2&page={n}`
   - Proven working in build-sets.js
   - Returns prices and stock

3. **TorecaCamp**: Use 2-stage approach
   - Stage 1: `/collections/all?q={set}` for handles
   - Stage 2: `/products/{handle}.js` for data
   - `.js` endpoint is fast and clean

4. **Hobibinet**: Use search with embedded meta
   - Single request gets multiple products
   - Parse `var meta = {...}` JSON

### For Individual Card Updates

Use product page scraping for:
- Favorites refresh
- Price updates
- Stock checks
- Dorasuta (no directory option)

---

## Implementation Priority

### Phase 1: Directory Scraping (High Value)
1. Japan-Toreca search (proven)
2. TorecaCamp 2-stage (proven)
3. Toretoku listing (proven)
4. Hobibinet meta parsing (proven)

### Phase 2: Remaining Sites
1. Test Playze (likely similar to TorecaCamp)
2. Investigate Cardrush list alternatives
3. Research C-Labo and Fukufuku Toreka

### Phase 3: Hybrid Approach
- Directory scraping for initial set loading
- Individual pages for favorites/updates
- Dorasuta always individual (but gets all conditions)

---

## Files with Working Directory Scrapers

1. `scripts/build-sets.js` - Japan-Toreca, Toretoku, TorecaCamp
2. `scripts/scrape-hobibinet.js` - Hobibinet
3. `scripts/scrape-m2a-ar.js` - Example of search-based scraping

---

## Conclusion

**Yes, directory scraping is possible for 4 sites** (Japan-Toreca, Toretoku, TorecaCamp, Hobibinet) and can save ~90% of credits compared to individual page scraping.

**However**, the naive collection page approach times out with Scrape.do. The existing codebase has proven search-based methods that work.

**Next Step**: Implement the proven directory scraping methods from `build-sets.js` using the new simplified scraping architecture.
