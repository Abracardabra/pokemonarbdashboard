# Scraping Implementation Plan
**Date**: 2026-03-23  
**Goal**: Replace all Scrape.do usage with Browserless + direct scraping  
**Status**: All 9 sites verified, implementation ready

---

## Overview

| # | Site | Platform | Access Method | Cost | Status |
|---|------|----------|---------------|------|--------|
| 1 | Japan-Toreca | Shopify | Direct JSON | Free | ✅ Ready |
| 2 | TorecaCamp | Shopify | Direct .js | Free | ✅ Ready |
| 3 | Hobibinet | Shopify | Direct HTML | Free | ✅ Ready |
| 4 | Playze | Shopify | Direct HTML | Free | ✅ Ready |
| 5 | C-Labo | Custom | Direct HTML | Free | ✅ Ready |
| 6 | Fukufuku | EC-CUBE | Direct HTML | Free | ✅ Ready |
| 7 | Cardrush | Custom | Browserless | 1 credit/req | ⚠️ Needs search URL |
| 8 | Toretoku | Custom SPA | Browserless | 1 credit/req | ✅ Detail pages ready |
| 9 | Dorasuta | EC-CUBE | Browserless /unblock | 1 credit/req | ✅ Ready |

---

## Implementation by Site

### 1. Japan-Toreca (トレカキングダム)
**Type**: Shopify  
**Priority**: HIGH (free, reliable)

```javascript
// Search endpoint
GET https://shop.japan-toreca.com/search?q={keyword}&type=product

// Product JSON (after extracting handle from search results)
GET https://shop.japan-toreca.com/products/{handle}.json

// Response structure:
{
  product: {
    title: "カード名",
    variants: [
      {
        title: "A- 状態A-",  // condition in title
        price: "5200",        // yen (not cents)
        available: true        // stock status
      }
    ]
  }
}
```

**Implementation Notes**:
- One product page per condition (A, A-, B, etc.)
- Parse condition from variant title
- Prices are plain yen (not cents)
- Search returns HTML, extract handles with regex: `/products/([^"\'\s]+)`

---

### 2. TorecaCamp (トレカキャンプ)
**Type**: Shopify  
**Priority**: HIGH (free, multi-condition)

```javascript
// Search endpoint
GET https://torecacamp-pokemon.com/search?q={keyword}&type=product

// Product .js endpoint (returns JS with embedded JSON)
GET https://torecacamp-pokemon.com/products/{handle}.js

// Response is JavaScript:
// var product = {...};
// Extract with regex: /var product = ({.+?});/s

// Response structure:
{
  title: "カード名",
  variants: [
    {
      title: "A",
      price: 548000,      // CENTS! Divide by 100
      available: true
    }
  ]
}
```

**Implementation Notes**:
- Multi-condition on single page (A, A-, B+, B, C on one product)
- Prices are in CENTS - divide by 100 to get yen
- Extract JSON from JavaScript response

---

### 3. Hobibinet (ホビビネット)
**Type**: Shopify  
**Priority**: MEDIUM (free)

```javascript
// Search endpoint
GET https://hobibinet-pokemon.com/search?q={keyword}&type=product

// Product page (HTML)
GET https://hobibinet-pokemon.com/products/{handle}

// Parse HTML for:
// - Price: regex /(\d{1,3}(?:,\d{3})*)円/
// - Stock: check for "在庫あり" or sold out text
```

**Implementation Notes**:
- Separate product per condition
- Parse HTML (not JSON)
- Prices in yen

---

### 4. Playze (プレイズ)
**Type**: Shopify  
**Priority**: MEDIUM (free, multi-condition)

```javascript
// Search endpoint
GET https://playze.jp/search?q={keyword}&type=product

// Product page (HTML)
GET https://playze.jp/products/{handle}

// Parse HTML for tabs:
// - Condition tabs: A, B, C
// - Price in each tab: regex /(\d{1,3}(?:,\d{3})*)円/
// - Stock status per condition
```

**Implementation Notes**:
- Multi-condition on single page (tabs for A/B/C)
- Parse HTML for tab content
- Check for SOLDOUT class or text

---

### 5. C-Labo (カードラボ)
**Type**: Custom (EC-CUBE-like)  
**Priority**: MEDIUM (free, by set only)

```javascript
// Set browsing (SV3 = category 2551)
GET https://www.c-labo-online.jp/product-list/2551/?num=120&available=1

// Product page
GET https://www.c-labo-online.jp/product/{id}

// Parse HTML:
// - Price: /(\d{1,3}(?:,\d{3})*)円/
// - Stock: /在庫数(\d+)枚/
```

**Implementation Notes**:
- NO keyword search - browse by set category only
- Need set → category ID mapping
- SV3 = 2551 (confirmed)
- Simple HTML parsing

---

### 6. Fukufuku Toreka (福福トレカ)
**Type**: EC-CUBE  
**Priority**: MEDIUM (free)

```javascript
// Search endpoint
GET https://pokemon.fukufukutoreka.com/products/list?name={keyword}

// Product detail
GET https://pokemon.fukufukutoreka.com/products/detail/{id}

// Parse HTML for prices and stock
```

**Implementation Notes**:
- Standard EC-CUBE structure
- Search by name parameter
- HTML parsing

---

### 7. Cardrush (カードラッシュ)
**Type**: Custom  
**Priority**: HIGH (but needs investigation)  
**Tool**: Browserless /content (replaces Scrape.do)

```javascript
// Product page (known to work)
GET https://www.cardrush-pokemon.jp/product/{id}

// Search: URL PATTERN UNKNOWN
// Need to find set listing URL from manual browsing

// Once found, parse HTML:
// - Price: /(\d{1,3}(?:,\d{3})*)円\(税込\)/
// - Stock: /在庫数 (\d+)枚/
// - Condition: /〔状態([A-D])〕/ in title
```

**Implementation Notes**:
- Product pages work via Browserless
- Search/browse URL pattern needs investigation
- Condition is in product title as 〔状態X〕

---

### 8. Toretoku (トレトク)
**Type**: Custom SPA (Vue/React)  
**Priority**: MEDIUM  
**Tool**: Browserless /content

```javascript
// Detail page (WORKS - tested)
GET https://www.toretoku.jp/item/details/{id}

// Suggestion API (FREE - useful for discovery)
GET https://www.toretoku.jp/ajax/getSuggestionList
// Returns JSON with 2935 Pokemon items:
// { item_id, item_name, model_number, rarity_name }

// Parse detail page HTML:
// - Prices by condition: A, B, C
// - Stock counts
// - Set name, model number
```

**Implementation Notes**:
- Search page blocked by bot detection
- Use existing IDs from prices.json for detail pages
- Suggestion API for discovering new cards
- Detail page IDs differ from suggestion item_ids

---

### 9. Dorasuta (ドラゴンスター)
**Type**: EC-CUBE  
**Priority**: HIGH  
**Tool**: Browserless /unblock (bypasses Cloudflare)

```javascript
// Search (WORKS - tested)
GET https://dorasuta.jp/pokemon-card/product-list?keyword={keyword}

// Set browsing
GET https://dorasuta.jp/pokemon-card/product-list?sid={set_id}
// SV3 set ID = 7127

// Parse search results HTML:
// - Product containers: .description
// - Name: item name + card number
// - Price: /(\d{1,3}(?:,\d{3})*)円/
// - Stock: check for class="soldout" or SOLDOUT text
// - Product URL: /pokemon-card/product?pid={id}
```

**Implementation Notes**:
- Cloudflare protected - requires Browserless /unblock
- Search by keyword works
- Set browsing by sid parameter
- Rich HTML with all data in search results

---

## Code Architecture

### New Scraper Structure

```typescript
// lib/scrapers/base.ts
abstract class BaseScraper {
  abstract name: string;
  abstract search(keyword: string): Promise<ScrapeResult[]>;
  abstract getProductDetails(url: string): Promise<ProductDetails>;
}

// lib/scrapers/japan-toreca.ts
class JapanTorecaScraper extends BaseScraper {
  name = "Japan-Toreca";
  
  async search(keyword: string) {
    const url = `https://shop.japan-toreca.com/search?q=${encodeURIComponent(keyword)}&type=product`;
    const html = await fetch(url);
    const handles = extractHandles(html);
    return handles.map(h => ({ handle: h, url: `https://shop.japan-toreca.com/products/${h}` }));
  }
  
  async getProductDetails(handle: string) {
    const json = await fetch(`https://shop.japan-toreca.com/products/${handle}.json`);
    return parseShopifyProduct(json);
  }
}

// lib/scrapers/dorasuta.ts
class DorasutaScraper extends BaseScraper {
  name = "Dorasuta";
  browserlessToken: string;
  
  async search(keyword: string) {
    const url = `https://dorasuta.jp/pokemon-card/product-list?keyword=${encodeURIComponent(keyword)}`;
    const html = await this.browserlessUnblock(url);
    return parseDorasutaSearchResults(html);
  }
  
  private async browserlessUnblock(url: string) {
    // POST to Browserless /unblock endpoint
  }
}
```

### Environment Variables

```bash
# .env.local
BROWSERLESS_TOKEN=2UE1P15Z8J8yQHB56a47635b570ca9fe4331c2c5147152b9d

# Remove old Scrape.do key
# SCRAPE_DO_TOKEN=... (REMOVE THIS)
```

### API Route for Scraping

```typescript
// app/api/scrape/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { scrapers } from '@/lib/scrapers';

export async function POST(req: NextRequest) {
  const { card, sites } = await req.json();
  
  const results = await Promise.all(
    sites.map(async (siteName: string) => {
      const scraper = scrapers[siteName];
      if (!scraper) return { site: siteName, error: 'Not implemented' };
      
      try {
        const keyword = `${card.japaneseName} ${card.number}`;
        const searchResults = await scraper.search(keyword);
        
        // Find matching card
        const match = findBestMatch(searchResults, card);
        if (match) {
          const details = await scraper.getProductDetails(match.url);
          return { site: siteName, success: true, data: details };
        }
        
        return { site: siteName, success: false, error: 'Card not found' };
      } catch (e) {
        return { site: siteName, success: false, error: e.message };
      }
    })
  );
  
  return NextResponse.json({ results });
}
```

---

## Migration Steps

### Phase 1: Remove Scrape.do (Week 1)
1. Remove `SCRAPE_DO_TOKEN` from environment variables
2. Add `BROWSERLESS_TOKEN` to environment variables
3. Update `lib/scrape-do.ts` → rename to `lib/browserless.ts`
4. Replace Scrape.do API calls with Browserless equivalents:
   - `/content` for most pages
   - `/unblock` for Cloudflare sites (Dorasuta, Cardrush)

### Phase 2: Implement Free Scrapers (Week 1-2)
1. Implement Japan-Toreca scraper (Shopify JSON)
2. Implement TorecaCamp scraper (Shopify .js)
3. Implement Hobibinet scraper (Shopify HTML)
4. Implement Playze scraper (Shopify HTML)
5. Implement C-Labo scraper (Set browsing)
6. Implement Fukufuku scraper (EC-CUBE)

### Phase 3: Implement Browserless Scrapers (Week 2)
1. Implement Dorasuta scraper with /unblock
2. Implement Toretoku scraper (detail pages)
3. Implement Cardrush scraper (needs search URL investigation)

### Phase 4: Testing & Integration (Week 3)
1. Test all 9 scrapers with sample cards
2. Update price aggregation logic
3. Update UI to show new data sources
4. Monitor credit usage on Browserless

---

## Credit Usage Estimate

| Site | Requests per Full Scrape | Credits |
|------|-------------------------|---------|
| Japan-Toreca | 0 (free) | 0 |
| TorecaCamp | 0 (free) | 0 |
| Hobibinet | 0 (free) | 0 |
| Playze | 0 (free) | 0 |
| C-Labo | 0 (free) | 0 |
| Fukufuku | 0 (free) | 0 |
| Cardrush | ~100 (1 per card) | 100 |
| Toretoku | ~100 (1 per card) | 100 |
| Dorasuta | ~50 (1 per search, 50 cards per page) | 50 |
| **Total** | | **~250 credits** |

With 1820 cards × 9 sites = 16,380 potential data points:
- Free sites: 10,920 data points (6 sites × 1820 cards)
- Browserless: 5,460 data points (3 sites × 1820 cards)

**Browserless plan recommendation**: Starter plan ($20/month) = 3,000 credits
- Covers ~30 full scrapes per month
- Or incremental updates: 300 cards/day × 30 days = 9,000 credits (Growth plan)

---

## What You Need to Provide

1. **Cardrush search URL**: Browse to any set page on cardrush-pokemon.jp and share the URL pattern
2. **Set ID mappings**: For C-Labo, confirm these category IDs:
   - SV3 = 2551 (confirmed)
   - Need others as we expand

---

## Success Metrics

After implementation:
- ✅ All 9 sites returning data
- ✅ No Scrape.do dependencies
- ✅ Scrape completes in < 5 minutes (parallel requests)
- ✅ Cost reduced from Scrape.do subscription to Browserless only
- ✅ Real-time price updates working
