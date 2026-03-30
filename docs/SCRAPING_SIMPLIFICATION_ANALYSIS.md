# Scraping System Analysis & Simplified Flow Proposal

## Current System Analysis

### 1. Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT SCRAPING FLOW                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  prices.json│────▶│  DB (Prisma)     │────▶│  Dashboard UI     │
│  (legacy)   │     │  Cards + Offers  │     │  CardsWithFilters │
└─────────────┘     └──────────────────┘     └───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SCRAPING LAYERS                            │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Legacy Scripts (Node.js + Puppeteer)                 │
│  - scripts/scrape-japanese.js                                   │
│  - scripts/scrape-all.js                                        │
│  - scripts/scrape-hobibinet.js                                  │
│  - Uses Puppeteer with stealth plugins                          │
│  - Failing due to Cloudflare blocks                             │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: API Routes (Next.js)                                   │
│  - /api/japan-toreca-product/route.ts                           │
│  - Direct fetch with User-Agent spoofing                        │
│  - Failing with 403/Cloudflare challenges                       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Scrape.do Integration (New)                            │
│  - lib/adapters/scrape-do-client.ts                             │
│  - lib/adapters/provider-scraper.ts                             │
│  - Working but not integrated into UI flow                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Current Pain Points

| Issue | Impact | Root Cause |
|-------|--------|------------|
| Cloudflare blocks | Scraping fails | Direct fetches detected as bot |
| Multiple scraping layers | Confusion | Legacy + API + New adapters coexist |
| Complex quality mapping | Data inconsistency | Each site uses different condition terms |
| UI using old API routes | 403 errors | `/api/japan-toreca-product` blocked |
| No unified provider interface | Code duplication | Each provider has custom logic |

### 3. Quality/Condition Mapping Complexity

```
┌──────────────────────────────────────────────────────────────────┐
│           QUALITY EXPRESSIONS BY PROVIDER                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Japan-Toreca:                                                    │
│    - 【状態A】  → A- (near mint)                                  │
│    - 【状態A-】 → A- (explicit)                                   │
│    - 【状態B】  → B (played)                                      │
│                                                                   │
│  Dorasuta:                                                        │
│    - 状態A      → A-                                              │
│    - 状態A特価  → A- (special price)                              │
│    - 状態B      → B                                               │
│                                                                   │
│  Toretoku:                                                        │
│    - Aランク    → A-                                              │
│    - Bランク    → B                                               │
│                                                                   │
│  Torecacamp:                                                      │
│    - A- (from URL pattern -a)                                    │
│    - B (from URL pattern -b)                                     │
│                                                                   │
│  Hobibinet:                                                       │
│    - A- or B (needs verification)                                │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 4. Translation Challenges

```
┌──────────────────────────────────────────────────────────────────┐
│              CARD IDENTIFIER CHALLENGES                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Problem: Same card has different identifiers per site            │
│                                                                   │
│  Example: Arceus VSTAR 262/172 (S12A)                             │
│                                                                   │
│  Japan-Toreca:  pokemon-18485-a-damaged                          │
│  Toretoku:      131835                                             │
│  Torecacamp:    rc_itnhjt9dl14k_mzdl                               │
│  Dorasuta:      pid=605736                                         │
│                                                                   │
│  Solution: Store URL mappings per provider in database            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Proposed Simplified Flow

### Core Principle: Single Source of Truth with Scrape.do

```
┌──────────────────────────────────────────────────────────────────┐
│              SIMPLIFIED SCRAPING ARCHITECTURE                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Cards     │───▶│  Scrape.do   │───▶│  Database    │       │
│  │   (DB)      │    │  (All Sites) │    │  (Updated)   │       │
│  └─────────────┘    └──────────────┘    └──────────────┘       │
│        │                                             │          │
│        │                                             ▼          │
│        │                                    ┌──────────────┐    │
│        └───────────────────────────────────│   Dashboard  │    │
│                                            │   (Realtime) │    │
│                                            └──────────────┘    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1. Unified Provider Interface

```typescript
// lib/scraping/types.ts

interface ScrapedOffer {
  cardId: string;           // Our internal ID (set:number)
  provider: Provider;       // 'japan-toreca' | 'dorasuta' | etc.
  condition: 'A-' | 'B';    // Normalized quality
  priceJPY: number;         // Extracted price
  inStock: boolean;         // Stock status
  url: string;              // Product URL
  title?: string;           // Product title (for verification)
  scrapedAt: Date;
}

type Provider = 
  | 'japan-toreca' 
  | 'dorasuta' 
  | 'toretoku' 
  | 'torecacamp' 
  | 'hobibinet';

interface ProviderConfig {
  name: Provider;
  baseUrl: string;
  selectors: {
    price: string;          // CSS selector for price
    stock: string;          // CSS selector for stock
    title: string;          // CSS selector for title
  };
  qualityPatterns: {        // Regex patterns for quality extraction
    aMinus: RegExp[];
    b: RegExp[];
  };
  stockIndicators: {        // Text patterns for stock detection
    inStock: string[];
    outOfStock: string[];
  };
}
```

### 2. Provider Configurations

```typescript
// lib/scraping/providers.ts

export const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  'japan-toreca': {
    name: 'japan-toreca',
    baseUrl: 'https://shop.japan-toreca.com',
    selectors: {
      price: '.product-price .money, [data-price] .money',
      stock: '.product-form__inventory, .inventory-quantity',
      title: 'h1.product-title',
    },
    qualityPatterns: {
      aMinus: [/【状態A】/, /【状態A-】/],
      b: [/【状態B】/],
    },
    stockIndicators: {
      inStock: ['在庫あり', 'カートに追加'],
      outOfStock: ['売り切れ', '在庫なし', 'Sold Out'],
    },
  },
  
  'dorasuta': {
    name: 'dorasuta',
    baseUrl: 'https://dorasuta.jp',
    selectors: {
      price: '.price, .price-current',
      stock: '[class*="stock"], .stock-status',
      title: 'h1',
    },
    qualityPatterns: {
      aMinus: [/状態A/, /状態A特価/],
      b: [/状態B/],
    },
    stockIndicators: {
      inStock: ['在庫数', 'カートに追加'],
      outOfStock: ['売り切れ', '在庫なし'],
    },
  },
  
  // ... similar for other providers
};
```

### 3. Simple Scraping Flow

```typescript
// lib/scraping/engine.ts

export async function scrapeCard(
  card: Card,
  provider: Provider
): Promise<ScrapedOffer[]> {
  const config = PROVIDER_CONFIGS[provider];
  
  // Get URLs for both conditions from card data
  const urls = getProviderUrls(card, provider);
  
  const results: ScrapedOffer[] = [];
  
  for (const { url, expectedCondition } of urls) {
    // Always use Scrape.do (simple, consistent)
    const html = await scrapeWithScrapeDo(url);
    
    // Parse using provider-specific config
    const offer = parseOffer(html, config, expectedCondition);
    
    if (offer) {
      results.push({
        cardId: card.id,
        provider,
        ...offer,
        url,
        scrapedAt: new Date(),
      });
    }
  }
  
  return results;
}

function parseOffer(
  html: string, 
  config: ProviderConfig,
  expectedCondition: 'A-' | 'B'
): Omit<ScrapedOffer, 'cardId' | 'provider' | 'url' | 'scrapedAt'> | null {
  const $ = cheerio.load(html);
  
  // Extract price
  const priceText = $(config.selectors.price).first().text();
  const priceJPY = extractPriceJPY(priceText);
  if (!priceJPY) return null;
  
  // Extract stock
  const stockText = $(config.selectors.stock).first().text();
  const inStock = detectStock(stockText, config.stockIndicators);
  
  // Detect quality from page (fallback to expected)
  const detectedQuality = detectQuality($, config.qualityPatterns);
  const condition = detectedQuality || expectedCondition;
  
  // Extract title for verification
  const title = $(config.selectors.title).first().text().trim();
  
  return { condition, priceJPY, inStock, title };
}
```

### 4. Database Schema (Prisma)

```prisma
// Already in place - verified working

model Card {
  id          String       @id  // "s12a:262/172"
  set         String
  setId       String
  number      String
  name        String?
  rarity      String
  favorite    Boolean      @default(false)
  imagesSmall String?
  imagesLarge String?
  updatedAt   DateTime
  japanOffers JapanOffer[]
  usMarket    UsMarket?
  createdAt   DateTime     @default(now())

  @@index([setId])
  @@index([number])
}

model JapanOffer {
  id          String   @id @default(cuid())
  cardId      String
  card        Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  source      String   // 'japan-toreca', 'dorasuta', etc.
  quality     String   // 'A-' or 'B'
  priceJPY    Int
  inStock     Boolean
  url         String
  extractedAt DateTime @default(now())
  updatedAt   DateTime @default(now())

  @@unique([cardId, source, quality])  // One offer per card/provider/quality
  @@index([source])
  @@index([cardId])
}
```

### 5. API Routes (Simplified)

```typescript
// app/api/scrape/route.ts

import { scrapeCard } from '@/lib/scraping/engine';

export async function POST(req: Request) {
  const { cardId, provider } = await req.json();
  
  // Get card from DB
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { japanOffers: true }
  });
  
  if (!card) {
    return Response.json({ error: 'Card not found' }, { status: 404 });
  }
  
  // Scrape using unified engine
  const offers = await scrapeCard(card, provider);
  
  // Persist to database
  for (const offer of offers) {
    await prisma.japanOffer.upsert({
      where: {
        cardId_source_quality: {
          cardId: offer.cardId,
          source: offer.provider,
          quality: offer.condition,
        }
      },
      create: {
        cardId: offer.cardId,
        source: offer.provider,
        quality: offer.condition,
        priceJPY: offer.priceJPY,
        inStock: offer.inStock,
        url: offer.url,
        extractedAt: offer.scrapedAt,
        updatedAt: offer.scrapedAt,
      },
      update: {
        priceJPY: offer.priceJPY,
        inStock: offer.inStock,
        url: offer.url,
        updatedAt: offer.scrapedAt,
      },
    });
  }
  
  // Return normalized data
  return Response.json({
    success: true,
    offers,
    metrics: {
      creditsUsed: offers.length,  // 1 per offer scraped
      duration: Date.now() - start,
    }
  });
}
```

### 6. Frontend Integration

```typescript
// components/CardsWithFilters.tsx

async function reloadCard(card: ArbitrageOpportunity, provider: Provider) {
  setReloadingCardId(card.id);
  
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: card.id, provider }),
    });
    
    const data = await res.json();
    
    if (data.success) {
      // Merge new offers into card data
      const updatedOffers = data.offers;
      // Trigger re-render with fresh data...
    }
  } finally {
    setReloadingCardId(null);
  }
}
```

---

## Implementation Plan

### Phase 1: Clean Slate (1 day)
1. ✅ Remove legacy Puppeteer scripts (or archive them)
2. ✅ Consolidate all scraping to use Scrape.do
3. ✅ Create unified provider configurations

### Phase 2: Single API Route (1 day)
1. ✅ Replace `/api/japan-toreca-product` with `/api/scrape`
2. ✅ Implement unified scraping engine
3. ✅ Add proper error handling and retries

### Phase 3: UI Integration (1 day)
1. ✅ Update `CardsWithFilters` to use new API
2. ✅ Add loading states and error messages
3. ✅ Show scrape metrics (credits used, time)

### Phase 4: Quality Mapping (1 day)
1. ✅ Finalize quality patterns for all providers
2. ✅ Handle edge cases (special prices, bundles)
3. ✅ Add validation for scraped data

---

## Cost Analysis (Scrape.do Hobby Plan)

| Metric | Value |
|--------|-------|
| Plan | Hobby - $29/month |
| Credits | 250,000/month |
| Per-card cost | 1 credit per condition |
| Avg card has | 2 conditions (A- + B) |
| Daily capacity | ~300 cards × 2 = 600 credits |
| Monthly usage | ~18,000 credits |
| Buffer | 232,000 unused credits (93% headroom) |

**Conclusion: Hobby plan ($29/mo) is more than sufficient**

---

## Key Benefits of Simplified Flow

1. **Single scraping method**: Always Scrape.do, no fallbacks needed
2. **Unified provider configs**: One place to update selectors
3. **Quality normalization**: All sites map to A-/B standard
4. **Simple database model**: One `JapanOffer` table for all providers
5. **Clear cost tracking**: 1 credit = 1 scrape = 1 DB row
6. **Easy to extend**: Add new provider = add config object
