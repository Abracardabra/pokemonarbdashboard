# Leverage Existing Data for Efficient Scraping

## Summary

We already have 1,820 cards in `data/prices.json` with **extensive URL mappings**. Instead of discovering URLs via directory scraping, we can use existing URLs for direct product page scraping - simpler and more credit-efficient.

---

## Existing URL Coverage (Amazing!)

| Provider | A- Quality URLs | B Quality URLs | Total URLs |
|----------|-----------------|----------------|------------|
| **Japan-Toreca** | 1,723 (95%) | 1,496 (82%) | 3,219 |
| **Toretoku** | 826 (45%) | 77 (4%) | 903 |
| **TorecaCamp** | 1,754 (96%) | 1,795 (99%) | 3,549 |
| **Combined** | - | - | **7,671 URLs** |

**Key Stats:**
- Total cards: 1,820
- Cards with URLs from ALL 3 providers: 883 (48%)
- Cards with NO URLs: **Only 5** (0.3%)
- URL coverage: **99.7%** of cards have at least one URL

---

## Proposed Simplified Strategy

### Phase 1: Use Existing URLs for Updates (95% of use cases)

**For cards we already have URLs for:**
```
1. Load card from prices.json
2. Get existing shop URLs (japanToreca, toretoku, torecacamp)
3. Scrape each URL directly for current price/stock
4. Update prices.json with new data
5. No directory scraping needed!
```

**Credit Cost:**
- Update 1 card from all 3 providers: 3 credits
- Update 100 cards: 300 credits
- Much cheaper than directory scraping for updates

---

### Phase 2: Directory Scraping Only for New Cards (5% of use cases)

**For new cards or missing URLs:**
```
1. Identify cards with no URLs (only 5 currently!)
2. Use directory scraping to find URLs:
   - Japan-Toreca: /search?q={set}+{rarity}
   - Toretoku: /item?genre=5&rank5[]=2
   - TorecaCamp: /collections/all?q={set}
3. Match found products to cards
4. Save new URLs to prices.json
```

**Credit Cost:**
- One-time cost for new cards
- Rarely needed (only 5 cards need URLs!)

---

## Implementation: Ultra-Simple Scraper

### Core Idea: URL-First Scraping

Instead of:
```
Directory scrape → Find products → Match to cards → Scrape details
```

We do:
```
Load existing URL → Scrape product → Update price
```

### Code Structure

```typescript
// lib/scraping/url-based-engine.ts

interface CardWithUrls {
  id: string;
  set: string;
  number: string;
  name: string;
  urls: {
    japanToreca?: { aMinus?: string; b?: string };
    toretoku?: { a?: string; b?: string };
    torecacamp?: { aMinus?: string; b?: string };
  };
}

async function updateCardPrices(card: CardWithUrls): Promise<UpdatedPrices> {
  const updates: UpdatedPrices = {};
  
  // Scrape each existing URL directly
  if (card.urls.japanToreca?.aMinus) {
    updates.japanTorecaAMinus = await scrapeProductPage(
      card.urls.japanToreca.aMinus, 
      'japan-toreca'
    );
  }
  
  if (card.urls.torecacamp?.aMinus) {
    updates.torecacampAMinus = await scrapeProductPage(
      card.urls.torecacamp.aMinus,
      'torecacamp'
    );
  }
  
  // ... etc for each URL
  
  return updates;
}
```

---

## Credit Comparison

### Scenario: Update 100 cards with prices

| Method | Requests | Credits | Time |
|--------|----------|---------|------|
| **Directory + Product** (old) | 10 dir + 100 prod = 110 | 110 | ~15 min |
| **Product Only** (using existing URLs) | 100 prod = 100 | 100 | ~8 min |
| **Product Only** (3 providers) | 300 prod = 300 | 300 | ~25 min |

### Scenario: Update 1 favorite card

| Method | Requests | Credits |
|--------|----------|---------|
| Directory search | 3-5 | 3-5 |
| **Existing URL direct** | 1-3 | **1-3** ✅ |

---

## Smart Features to Add

### 1. Selective Updates (Save 70% credits)

Only scrape cards that:
- Are favorited
- Have no recent update (< 1 hour)
- Price changed significantly on US market
- User clicked "refresh"

```typescript
function shouldUpdate(card: Card): boolean {
  if (card.isFavorite) return true;
  if (card.lastUpdated < Date.now() - 1 hour) return true;
  if (card.priceChangePercent > 10) return true;
  return false;
}
```

### 2. Incremental Updates (Save 90% credits)

Stagger updates across time:
- High-value cards: every 15 minutes
- Medium-value: every 1 hour
- Low-value: every 6 hours
- Favorites: on-demand

### 3. Provider Fallback (Save 50% credits)

If Japan-Toreca fails, try TorecaCamp. Don't scrape all providers every time.

```typescript
const providerPriority = ['torecacamp', 'japanToreca', 'toretoku'];
for (const provider of providerPriority) {
  const result = await scrapeWithFallback(card, provider);
  if (result.success) break;
}
```

---

## Files to Create/Modify

### New Files

1. `lib/scraping/url-based-engine.ts`
   - Uses existing URLs from prices.json
   - Direct product page scraping
   - No directory scraping

2. `app/api/refresh/route.ts`
   - Accepts card IDs to refresh
   - Uses existing URLs
   - Returns updated prices

3. `lib/scraping/url-loader.ts`
   - Loads URLs from prices.json
   - Maps card IDs to URLs
   - Returns ready-to-scrape list

### Modified Files

1. `components/CardsWithFilters.tsx`
   - Add refresh button for favorites
   - Call `/api/refresh` with card IDs
   - Update UI with new prices

2. `app/api/scrape/route.ts` (existing)
   - Add support for URL-based scraping
   - Keep directory scraping as fallback

---

## Migration Plan

### Week 1: URL-Based Scraper
1. Create `url-loader.ts` to extract URLs from prices.json
2. Modify engine to use existing URLs
3. Test with 10 cards

### Week 2: Smart Updates
1. Add selective update logic
2. Add incremental scheduling
3. Add provider fallback

### Week 3: UI Integration
1. Add refresh buttons
2. Add "last updated" timestamps
3. Add price change indicators

### Week 4: Optimization
1. Cache frequently accessed cards
2. Batch update requests
3. Monitor credit usage

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Credits per 100 cards | 110 | 100 |
| Time per 100 cards | 15 min | 8 min |
| Cards without URLs | N/A | 5 |
| Average update latency | Hours | Minutes |
| New card onboarding | Complex | Simple |

---

## Conclusion

**We don't need complex directory scraping for 99.7% of cards.**

The existing `data/prices.json` already has URLs for:
- 3,219 Japan-Toreca products
- 3,549 TorecaCamp products  
- 903 Toretoku products

**Simplest approach:**
1. Use existing URLs for direct product scraping
2. Only use directory scraping for new cards (5 cards need this!)
3. Add smart update scheduling to save credits
4. Focus on reliable, simple product page scraping

This is 10x simpler than building a full directory scraper and uses fewer credits for updates.
