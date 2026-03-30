# Scrape.do Integration Plan

## Decision Summary

**Replacing:** Direct fetches (failing due to Cloudflare) + Browserless BQL (more expensive)
**Using:** Cost-optimized smart fetch - tries direct first (FREE), falls back to Scrape.do only when blocked

## Cost Optimization Strategy

### Smart Fetch Pattern
1. **Try direct fetch first** - FREE, 15 second timeout
2. **If Cloudflare blocks (403/challenge)** → Use Scrape.do (1 credit)
3. **Track costs** - Log which method succeeded

### Why This Saves Money

| Provider | Direct Works? | Savings |
|----------|--------------|---------|
| Japan-Toreca | Maybe (light CF) | ~50% of requests FREE |
| Dorasuta | No (heavy CF) | Always needs Scrape.do |
| Toretoku | Unknown | Test needed |
| Torecacamp | Unknown | Test needed |
| Hobibinet | Unknown | Test needed |

**Potential savings: 30-50% of requests can use direct fetch (FREE)**

## Pricing

Based on screenshot you shared:

| Plan | Credits | Price | Our Coverage |
|------|---------|-------|--------------|
| Hobby | 250,000 | **$29/mo** | ✅ 13.8× our usage |
| Pro | 1,250,000 | $99/mo | 69× our usage |

**With smart fetch cost reduction:**
- Worst case (all need Scrape.do): 18,000 credits/month
- Best case (50% direct): 9,000 credits/month
- **Actual: Likely 12,000-15,000 credits/month**

**Cost:** Hobby plan at **$29/month** is plenty!

## Environment Setup

```bash
# .env
SCRAPE_DO_API_KEY=a86dacd8070048d3aa6574451ca74ed2a10c37a5ae5
```

## Architecture

```
lib/
  adapters/
    smart-fetch.ts       # Cost-optimized: direct first, Scrape.do fallback
    scrape-do-client.ts  # Core Scrape.do API client
    scrape-do-queries.ts # Provider-specific selectors
    provider-scraper.ts  # Unified scrape interface with cost tracking
```

## Smart Fetch Implementation

```typescript
// lib/adapters/smart-fetch.ts
export async function smartFetch(url: string): Promise<SmartFetchResult> {
  // Step 1: Try direct fetch (FREE)
  const direct = await fetchWithTimeout(url, 15000);
  if (!isCloudflareBlocked(direct)) {
    return { success: true, html: direct.html, method: 'direct', cost: 0 };
  }
  
  // Step 2: Fallback to Scrape.do (1 credit)
  const scrapeDo = await scrapeDo(url, { render: true });
  return { success: true, html: scrapeDo.html, method: 'scrape-do', cost: 1 };
}
```

## Usage with Cost Tracking

```typescript
// Scrape a single card
const result = await scrapeProvider({
  cardId: 'sv3-123',
  url: 'https://dorasuta.jp/product?pid=123',
  provider: 'dorasuta',
  expectedCondition: 'A-',
});

// Result includes:
// - priceJPY: number | null
// - fetchMethod: 'direct' | 'scrape-do'  <-- NEW
// - scrapeDoCost: 0 | 1                  <-- NEW

// Batch with metrics
const { results, metrics } = await scrapeBatch(requests);
console.log(metrics);
// {
//   total: 100,
//   direct: 45,      // 45 requests used direct (FREE)
//   scrapeDo: 55,    // 55 requests used Scrape.do (55 credits)
//   totalCost: 55,   // Total credits used
//   savings: 45,    // Credits saved vs using Scrape.do for all
//   successRate: 0.98
// }
```

## Verified Working Providers

| Provider | Status | Method | Test Result |
|----------|--------|--------|-------------|
| Japan-Toreca | ✅ Working | Scrape.do | 34s, price extracted |
| Dorasuta | ✅ Working | Scrape.do | 40s, Cloudflare bypassed |
| Toretoku | 🔲 Not tested | - | - |
| Torecacamp | 🔲 Not tested | - | - |
| Hobibinet | 🔲 Not tested | - | - |

## Capacity Analysis

**Hobby Plan: 250,000 credits/month @ $29**

| Scenario | Daily Cards | Credits/Day | Monthly | Cost |
|----------|-------------|-------------|---------|------|
| All Scrape.do | 300 | 600 | 18,000 | $29 (Hobby) |
| 50% Smart fetch | 300 | 300 | 9,000 | $29 (Hobby) |
| High volume | 1,000 | 1,000-2,000 | 30,000-60,000 | $29 (Hobby) |
| Max capacity | 4,000+ | - | 250,000 | $29 (Hobby limit) |

**We're well within Hobby plan limits!**

## Monitoring

```typescript
// Each scrape logs method and cost
console.log('[Scrape]', {
  provider: 'dorasuta',
  success: true,
  fetchMethod: 'scrape-do',
  cost: 1,
  savings: 0,  // 0 because direct failed
});

console.log('[Scrape]', {
  provider: 'toretoku',
  success: true,
  fetchMethod: 'direct',
  cost: 0,
  savings: 1,  // Saved 1 credit!
});
```

## Implementation Roadmap

### Phase 1: Smart Fetch ✅
- [x] Add SCRAPE_DO_API_KEY to .env
- [x] Create `lib/adapters/smart-fetch.ts`
- [x] Update `lib/adapters/provider-scraper.ts` with cost tracking
- [x] Verified Japan-Toreca works
- [x] Verified Dorasuta works

### Phase 2: Remaining Providers
- [ ] Test Toretoku (check if direct works)
- [ ] Test Torecacamp
- [ ] Test Hobibinet
- [ ] Document which providers can use direct fetch

### Phase 3: Dashboard Integration
- [ ] Update `/api/cards/persist` to use smart scraper
- [ ] Add cost metrics to API responses
- [ ] Build simple usage dashboard

### Phase 4: Production
- [ ] Monitor monthly credit usage
- [ ] Optimize by provider (use direct where possible)
- [ ] Stay within Hobby plan ($29/mo)

## Comparison: Scrape.do Smart Fetch vs Browserless

| Metric | Scrape.do (Smart) | Browserless BQL |
|--------|-------------------|-----------------|
| **Monthly Cost** | **$29** (Hobby) | $500+ (Starter) |
| **Credits** | 250,000 | 180,000 |
| **Our Usage** | ~12,000/mo (with smart fetch) | ~18,000/mo |
| **Cost per 1k scrapes** | ~$2.40 | ~$27.80 |
| **Setup** | Simple REST | GraphQL |
| **Savings** | **$471+/month (94%)** | - |

**Scrape.do with smart fetch = 94% cheaper than Browserless!**
