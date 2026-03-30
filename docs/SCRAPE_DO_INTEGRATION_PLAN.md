# Scrape.do Integration Plan

## Decision Summary

**Replacing:** Direct fetches (failing due to Cloudflare) + Browserless BQL (more expensive)
**Using:** Scrape.do API for all Japanese provider scraping

## Why Scrape.do

1. **Cost-effective** - 1,000 free credits/month, then competitive pricing
2. **Simple REST API** - No GraphQL complexity, just HTTP GET with query params
3. **99.98% success rate** - Built-in Cloudflare bypass and CAPTCHA solving
4. **Headless rendering** - `render=true` parameter for JavaScript-heavy sites
5. **Automatic proxy rotation** - Built-in residential proxy pool
6. **Zero maintenance** - No browser management, sessions, or local agents

## Pricing

| Tier | Credits | Price | Our Use |
|------|---------|-------|---------|
| Free | 1,000/mo | $0 | Testing + light usage |
| Starter | 10,000/mo | ~$29 | ~30 cards/day |
| Growth | 50,000/mo | ~$99 | ~150 cards/day |

**Our Usage Estimate:**
- 300 cards/day target
- ~1-2 requests per card (product page load)
- **Total: ~600-900 requests/day = ~18,000-27,000/month**

**Cost:** Growth plan at ~$99/month

## Environment Setup

```bash
# .env
SCRAPE_DO_API_KEY=a86dacd8070048d3aa6574451ca74ed2a10c37a5ae5
```

## Architecture

```
lib/
  adapters/
    scrape-do-client.ts    # Core API client
    scrape-do-queries.ts   # Provider-specific selectors
    provider-scraper.ts    # Unified scrape interface
```

## Core Client

```typescript
// lib/adapters/scrape-do-client.ts
const API_KEY = process.env.SCRAPE_DO_API_KEY;

export async function scrapeDo(
  targetUrl: string,
  config: { render?: boolean; timeout?: number; geoCode?: string }
): Promise<ScrapeDoResult> {
  const params = new URLSearchParams({
    token: API_KEY,
    url: targetUrl,
    render: config.render ? 'true' : 'false',
  });
  
  if (config.geoCode) {
    params.set('geoCode', config.geoCode);
  }
  
  const apiUrl = `https://api.scrape.do/?${params.toString()}`;
  const response = await fetch(apiUrl);
  
  return {
    html: await response.text(),
    success: response.ok,
    // ... parsing
  };
}
```

## Provider Selectors

```typescript
// lib/adapters/scrape-do-queries.ts
export const PROVIDER_SELECTORS: Record<string, ProviderSelectors> = {
  'japan-toreca': {
    price: '.product-price .money, [data-price] .money',
    stock: '.product-form__inventory, .inventory-quantity',
    title: 'h1.product-title',
    condition: '.variant-sku',  // Contains -a or -b
  },
  
  'dorasuta': {
    price: '.price-current, .product-price .current-price',
    stock: '.stock-status, .availability',
    title: 'h1.product-title',
  },
  
  // ... other providers
};
```

## Usage Example

```typescript
// Scrape a single card from Japan-Toreca
const result = await scrapeProvider({
  cardId: 'sv3-123',
  url: 'https://shop.japan-toreca.com/products/pokemon-xxxxx-a',
  provider: 'japan-toreca',
  expectedCondition: 'A-',
});

// Result includes:
// - priceJPY: number | null
// - inStock: boolean
// - title: string | null
// - success: boolean
// - durationMs: number
// - cloudflareDetected: boolean
```

## Integration with Dashboard

### API Routes Update

Update `/api/cards/persist` to use the new scraper:

```typescript
// app/api/cards/persist/route.ts
import { scrapeCardProviders } from '@/lib/adapters/provider-scraper';

export async function POST(request: Request) {
  // ... existing code ...
  
  // When reloading Japanese prices
  if (reloadJapanese) {
    const results = await scrapeCardProviders(cardId, japanesePrices);
    
    // Check for failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.warn('Some providers failed:', failures);
    }
  }
}
```

### Frontend Update

No changes needed - the existing reload flow works the same way.

## Capacity Analysis

**Current Plan: 1,000 credits/month free**

| Activity | Credits | Daily Budget |
|----------|---------|--------------|
| Test runs | ~50 | - |
| Favorites reload | ~50 cards × 2 providers = 100 | 3 cards/day |
| Priority tier | ~100 cards × 2 providers = 200 | 6 cards/day |
| Routine tier | ~150 cards × 2 providers = 300 | 9 cards/day |
| **Total** | **~650** | **~18 cards/day** |

**Free tier gets us ~18 cards/day reliably**

For 300 cards/day, we need the Growth plan (~$99/month).

## Rate Limiting & Best Practices

1. **Sequential by default** - Scrape.do handles concurrency on their end
2. **2-3 second delays** between requests to same provider
3. **Use geoCode=jp** for Japanese sites (better performance)
4. **Always use render=true** for JavaScript-heavy sites
5. **60 second timeout** for headless rendering

## Monitoring

```typescript
// Log metrics for each scrape
logScrapeMetrics(provider, {
  success: true,
  durationMs: 34000,
  cloudflareDetected: false,
  priceJPY: 1234,
});

// Output:
// [Scrape.do] { provider: 'japan-toreca', success: true, durationMs: 34000, ... }
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| Timeout | Page too slow | Increase timeout, retry |
| CF Challenge | New protection | Scrape.do updates automatically |
| No price found | Selector outdated | Update selector in queries.ts |
| 403 Forbidden | IP blocked | Scrape.do rotates automatically |

## Implementation Roadmap

### Phase 1: Integration (1 day) ✅
- [x] Add SCRAPE_DO_API_KEY to .env
- [x] Create `lib/adapters/scrape-do-client.ts`
- [x] Create `lib/adapters/scrape-do-queries.ts`
- [x] Create `lib/adapters/provider-scraper.ts`
- [x] Test script verifies API works

### Phase 2: Provider Testing (1 day)
- [ ] Test Japan-Toreca (working ✅)
- [ ] Test Dorasuta (need URL)
- [ ] Test Toretoku
- [ ] Test Torecacamp
- [ ] Test Hobibinet

### Phase 3: Dashboard Integration (1 day)
- [ ] Update `/api/cards/persist` to use scraper
- [ ] Add fallback logic for failed scrapes
- [ ] Test end-to-end reload flow

### Phase 4: Production (1 day)
- [ ] Monitor success rates
- [ ] Track credit usage
- [ ] Optimize selectors if needed

## Success Metrics

- [ ] All 5 providers working via Scrape.do
- [ ] Success rate > 95% across all providers
- [ ] Monthly usage within credit budget
- [ ] Average scrape time < 40 seconds
- [ ] No cards stuck in "failed" state

## Comparison: Scrape.do vs Browserless

| Feature | Scrape.do | Browserless |
|---------|-----------|-------------|
| Setup | One-line API | GraphQL complexity |
| Cost | $99/mo for 50k | $200+/mo for similar |
| Credits | 50k on Growth | 20k on Prototyping |
| API | Simple REST | GraphQL |
| Browser | Managed | 4 concurrent |
| Maintenance | None | Session management |
| Proxy | Built-in | Built-in |

**Scrape.do wins on simplicity and cost for our use case.**
