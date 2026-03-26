# Browserless (BQL) Integration Plan

## Decision Summary

**Replacing:** Cloudflare Crawl (unavailable) + Direct fetches for all providers  
**Using:** Browserless Query Language (BQL) for **all** provider scraping

## Why BQL for All Providers

1. **Consistent anti-bot protection** - Same stealth layer for every provider
2. **20k requests/month included** - Sufficient for ~66 cards/day average
3. **4 concurrent browsers** - Parallel processing with IP rotation
4. **Many IPs** - Automatic proxy rotation prevents rate limits
5. **Simpler architecture** - One fetch path for all providers
6. **No provider-specific edge cases** - If one blocks, BQL handles it

## Capacity Analysis

**Browserless Prototyping Plan:**
- 20,000 requests/month
- 4 concurrent browsers
- 15-minute session duration
- Multiple IPs (residential proxy pool)

**Our Usage:**
- 300 cards/day target (from SCRAPE_POLICY)
- ~9,000 cards/month
- ~1-2 requests per card (product page load)
- **Total: ~18,000 requests/month**

✅ **Well within 20k limit with buffer for retries**

## Environment Setup

```bash
# .env
BROWSERLESS_API_KEY=your_bql_key_here
BROWSERLESS_REGION=sfo  # sfo, lon, or ams
BROWSERLESS_ENDPOINT=https://production-sfo.browserless.io/chromium/bql
BROWSERLESS_TIMEOUT_MS=30000

# Concurrency (match plan limits)
BQL_CONCURRENT_BROWSERS=4
BQL_SESSION_DURATION_MS=900000  # 15 minutes

# Fallback (when BQL fails entirely)
BQL_FALLBACK_TO_STALE=true
```

## Architecture

```
lib/
  adapters/
    bql-client.ts          # Core BQL GraphQL client
    bql-queries.ts         # Provider-specific query builders
    provider-scraper.ts    # Unified scrape interface for all providers

All providers now route through BQL:
- japan-toreca → BQL
- toretoku → BQL  
- torecacamp → BQL
- hobibinet → BQL
- dorasuta → BQL (stealth endpoint)
```

## Core BQL Client

```typescript
// lib/adapters/bql-client.ts
const REGION = process.env.BROWSERLESS_REGION || 'sfo';
const API_KEY = process.env.BROWSERLESS_API_KEY;

const BQL_BASE = `https://production-${REGION}.browserless.io`;

// Endpoint selection by provider needs
const ENDPOINTS = {
  chromium: `${BQL_BASE}/chromium/bql`,     // Standard
  chrome: `${BQL_BASE}/chrome/bql`,         // Real Chrome (if needed)
  stealth: `${BQL_BASE}/stealth/bql`,       // Max stealth (Dorasuta fallback)
};

interface BQLConfig {
  endpoint?: 'chromium' | 'chrome' | 'stealth';
  timeoutMs?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export async function bqlQuery(
  query: string,
  config: BQLConfig = {}
): Promise<{ data?: any; errors?: any[] }> {
  const endpoint = config.endpoint || 'chromium';
  const url = `${ENDPOINTS[endpoint]}?token=${API_KEY}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`BQL HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}
```

## Universal Provider Query Builder

```typescript
// lib/adapters/bql-queries.ts

interface ProviderSelectors {
  price: string;
  stock?: string;
  title?: string;
  condition?: string;  // A-/B indicator
}

const PROVIDER_SELECTORS: Record<string, ProviderSelectors> = {
  'japan-toreca': {
    price: '.product-price .money',
    stock: '.product-form__inventory',
    title: 'h1.product-title',
    condition: '.variant-sku',  // Contains -a or -b
  },
  'toretoku': {
    price: '.price-area .price',
    stock: '.stock-area',
    title: 'h1.item-name',
  },
  'torecacamp': {
    price: '.price-item',
    stock: '.inventory-quantity',
    title: 'h1.product-name',
  },
  'hobibinet': {
    price: '.item-price',
    stock: '.stock-status',
    title: 'h1.item-title',
  },
  'dorasuta': {
    price: '.price-current',
    stock: '.stock-status',
    title: 'h1.product-title',
  },
};

export function buildProviderQuery(
  provider: string,
  url: string
): string {
  const selectors = PROVIDER_SELECTORS[provider];
  
  return `
    mutation Scrape${provider} {
      goto(url: "${url}", waitUntil: networkIdle) {
        status
        url
      }
      
      # Verify we passed any challenges
      verify(type: cloudflare) {
        found
        solved
        time
      }
      
      # Extract data
      price: text(selector: "${selectors.price}") {
        text
      }
      ${selectors.stock ? `stock: text(selector: "${selectors.stock}") { text }` : ''}
      ${selectors.title ? `title: text(selector: "${selectors.title}") { text }` : ''}
      ${selectors.condition ? `condition: text(selector: "${selectors.condition}") { text }` : ''}
    }
  `;
}
```

## Unified Provider Scraper

```typescript
// lib/adapters/provider-scraper.ts
import { bqlQuery } from './bql-client';
import { buildProviderQuery } from './bql-queries';
import { prisma } from '@/lib/prisma';
import { SCRAPE_POLICY } from '@/lib/scrape-policy';

interface ScrapeResult {
  success: boolean;
  priceJPY?: number;
  inStock?: boolean;
  title?: string;
  condition?: 'A-' | 'B';
  cloudflareSolved?: boolean;
  solveTimeMs?: number;
  error?: string;
}

export async function scrapeProvider(
  provider: string,
  url: string,
  cardId: string,
  expectedCondition: 'A-' | 'B'
): Promise<ScrapeResult> {
  try {
    // Build query for this provider
    const query = buildProviderQuery(provider, url);
    
    // Use stealth endpoint for known-problematic providers
    const endpoint = provider === 'dorasuta' ? 'stealth' : 'chromium';
    
    const result = await bqlQuery(query, { endpoint });
    
    if (result.errors?.length) {
      console.error(`BQL errors for ${provider}:`, result.errors);
      return { success: false, error: 'bql_failed' };
    }

    const data = result.data;
    
    // Check if we solved any challenges
    if (data?.verify?.found && !data?.verify?.solved) {
      return { 
        success: false, 
        error: 'challenge_failed',
        cloudflareSolved: false 
      };
    }

    // Parse extracted data
    const parsed = parseProviderData(provider, data, expectedCondition);
    
    // Persist to DB
    if (parsed.success) {
      await persistToDB(cardId, provider, expectedCondition, parsed);
    }
    
    return {
      ...parsed,
      cloudflareSolved: data?.verify?.solved || false,
      solveTimeMs: data?.verify?.time,
    };
    
  } catch (error) {
    console.error(`Scrape failed for ${provider}:`, error);
    
    // Fallback to stale data
    await markProviderStale(cardId, provider);
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'unknown_error'
    };
  }
}

function parseProviderData(
  provider: string,
  data: any,
  expectedCondition: 'A-' | 'B'
): ScrapeResult {
  const priceText = data?.price?.text || '';
  const stockText = data?.stock?.text || '';
  const titleText = data?.title?.text || '';
  
  // Extract price (remove ¥, commas)
  const priceMatch = priceText.match(/[\d,]+/);
  const priceJPY = priceMatch ? parseInt(priceMatch[0].replace(/,/g, '')) : null;
  
  // Determine stock status
  const inStock = !stockText.toLowerCase().includes('out') && 
                  !stockText.toLowerCase().includes('sold');
  
  if (!priceJPY) {
    return { success: false, error: 'parse_failed' };
  }
  
  return {
    success: true,
    priceJPY,
    inStock,
    title: titleText,
    condition: expectedCondition,
  };
}
```

## Session-Based Batching

Use 4 concurrent browsers efficiently:

```typescript
// lib/adapters/bql-batch.ts
interface BatchConfig {
  batchSize: number;
  sessionDurationMs: number;
}

const DEFAULT_BATCH: BatchConfig = {
  batchSize: 10,           // Cards per session
  sessionDurationMs: 15 * 60 * 1000,  // 15 minutes
};

class BQLBatchProcessor {
  private concurrentLimit = 4;  // Match plan limits
  private activeSessions = 0;
  
  async processBatch(
    cards: Array<{ cardId: string; url: string; provider: string }>
  ): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    
    // Chunk into batches of ~10 cards
    const batches = chunk(cards, DEFAULT_BATCH.batchSize);
    
    for (const batch of batches) {
      // Wait if at concurrent limit
      while (this.activeSessions >= this.concurrentLimit) {
        await sleep(1000);
      }
      
      this.activeSessions++;
      
      // Process batch in one session
      const batchResults = await this.processSession(batch);
      results.push(...batchResults);
      
      this.activeSessions--;
      
      // Pacing between batches
      await sleep(SCRAPE_POLICY.pacing.minDelayMs);
    }
    
    return results;
  }
  
  private async processSession(batch: typeof cards): Promise<ScrapeResult[]> {
    // Start a session
    const sessionQuery = `
      mutation {
        startSession {
          sessionId
        }
      }
    `;
    
    const sessionRes = await bqlQuery(sessionQuery);
    const sessionId = sessionRes.data?.startSession?.sessionId;
    
    const results: ScrapeResult[] = [];
    
    for (const card of batch) {
      // Reconnect to same session
      await bqlQuery(`
        mutation {
          reconnect(sessionId: "${sessionId}") {
            connected
          }
        }
      `);
      
      // Scrape this card
      const result = await scrapeProvider(
        card.provider,
        card.url,
        card.cardId,
        'A-'  // or determine from card data
      );
      
      results.push(result);
      
      // Small delay between cards in same session
      await sleep(2000);
    }
    
    return results;
  }
}

export const batchProcessor = new BQLBatchProcessor();
```

## Integration with SCRAPE_POLICY

```typescript
// lib/adapters/provider-scraper.ts

export async function reloadCardJPAndUS(card: ArbitrageOpportunity) {
  const allOffers = card.japanesePrices;
  const providers = [...new Set(allOffers.map(o => o.source))];
  
  // Scrape all providers via BQL in parallel (respecting concurrent limit)
  const scrapePromises = providers.map(async (provider) => {
    const offer = allOffers.find(o => o.source === provider);
    if (!offer?.url) return null;
    
    return scrapeProvider(
      provider,
      offer.url,
      card.id,
      offer.quality as 'A-' | 'B'
    );
  });
  
  const results = await Promise.all(scrapePromises);
  
  // Update card with fresh data
  const updatedOffers = results
    .filter(r => r?.success)
    .map(r => ({
      ...findExistingOffer(card, r!.provider, r!.condition),
      priceJPY: r!.priceJPY,
      inStock: r!.inStock,
      updatedAt: new Date().toISOString(),
    }));
  
  return updatedOffers;
}

// Daily reload batching
export async function reloadAllCards(cards: ArbitrageOpportunity[]) {
  // Apply SCRAPE_POLICY tier selection
  const favorites = cards.filter(c => c.favorite);
  const priority = cards.filter(c => isPrioritySet(c.set) && !c.favorite);
  const routine = cards.filter(c => !isPrioritySet(c.set) && !c.favorite);
  
  // Calculate BQL budget allocation
  const dailyCap = SCRAPE_POLICY.capacity.dailyCardCap;  // 300
  const bqlBudget = Math.min(cards.length, dailyCap);
  
  // Allocate across tiers
  const toReload = [
    ...favorites.slice(0, Math.floor(bqlBudget * 0.5)),
    ...priority.slice(0, Math.floor(bqlBudget * 0.35)),
    ...routine.slice(0, Math.floor(bqlBudget * 0.15)),
  ];
  
  // Process in BQL batches
  const results = await batchProcessor.processBatch(
    toReload.flatMap(card => 
      card.japanesePrices.map(offer => ({
        cardId: card.id,
        url: offer.url,
        provider: offer.source,
      }))
    )
  );
  
  return results;
}
```

## Monitoring & Cost Tracking

```typescript
// lib/adapters/bql-metrics.ts
interface BQLUsage {
  month: string;
  requestsUsed: number;
  requestsRemaining: number;
  successRate: number;
  avgSolveTimeMs: number;
  costsByProvider: Record<string, number>;
}

// Alert at 80% of monthly limit
const MONTHLY_LIMIT = 20000;
const ALERT_THRESHOLD = 16000;

export function trackBQLRequest(provider: string, success: boolean, solveTimeMs?: number) {
  // Log for monitoring
  console.log('[BQL]', {
    provider,
    success,
    solveTimeMs,
    timestamp: new Date().toISOString(),
  });
  
  // Check budget
  const used = getMonthlyRequestCount();
  if (used > ALERT_THRESHOLD) {
    console.warn(`[BQL] Monthly usage at ${(used/MONTHLY_LIMIT*100).toFixed(1)}%`);
  }
}
```

## Implementation Roadmap

### Phase 1: BQL Foundation (2 days)
- [ ] Sign up Browserless Prototyping plan
- [ ] Add `lib/adapters/bql-client.ts`
- [ ] Add `lib/adapters/bql-queries.ts` with all provider selectors
- [ ] Test each provider manually (5 cards each)

### Phase 2: Integration (2 days)
- [ ] Replace existing fetch logic with `scrapeProvider()`
- [ ] Wire into `/api/cards/persist` flow
- [ ] Test full reload flow for 50 cards
- [ ] Verify DB updates correctly

### Phase 3: Batch Optimization (1 day)
- [ ] Implement session-based batching
- [ ] Test 4 concurrent browsers
- [ ] Measure throughput (cards/minute)
- [ ] Tune batch sizes

### Phase 4: Monitoring (1 day)
- [ ] Add metrics logging
- [ ] Build simple usage dashboard
- [ ] Set up alerts at 80% monthly usage

### Phase 5: Production (ongoing)
- [ ] Monitor solve rates by provider
- [ ] Adjust selectors if sites change
- [ ] Optimize based on usage patterns

## Expected Performance

With 20k requests/month and 300 cards/day:
- **Daily BQL requests**: ~600 (2 per card avg)
- **Monthly BQL requests**: ~18,000
- **Buffer remaining**: ~2,000 for retries
- **Concurrent browsers**: 4
- **Estimated throughput**: 40-60 cards/hour with pacing

✅ **Sustainable within plan limits**

## Fallback Strategy

When BQL fails (rare but possible):
1. **Keep last DB value** - Never show empty
2. **Mark as stale** - Visual indicator in UI
3. **Retry next window** - Batched with next reload
4. **Escalate if persistent** - Alert if provider fails >5x in a row

## Success Metrics

- [ ] All 5 providers working via BQL
- [ ] Solve rate > 90% across all providers
- [ ] Monthly usage < 18,000 requests
- [ ] No cards stuck in "failed" state
- [ ] Reload 300 cards/day within 6 hours
- [ ] Cost per 1000 cards predictable
