# URL Coverage Gap Analysis

## Current URL Coverage (from prices.json)

| Provider | URLs | Coverage | Status |
|----------|------|----------|--------|
| **Japan-Toreca** | 3,219 | 96.4% | ✅ Good |
| **TorecaCamp** | 3,549 | 98.6% | ✅ Good |
| **Toretoku** | 903 | 49.6% | ⚠️ Partial |
| **Dorasuta** | 171 | 9.4% | ❌ Poor (only B quality) |
| **Hobibinet** | 66 | 2.3% | ❌ Poor |
| **Cardrush** | 0 | 0% | ❌ Missing |
| **Playze** | 0 | 0% | ❌ Missing |
| **C-Labo** | 0 | 0% | ❌ Missing |
| **Fukufuku Toreka** | 0 | 0% | ❌ Missing |

**Gap:** 4 sites have NO URLs, 2 sites have minimal URLs

---

## The Problem

**For routine updates:** Use existing URLs ✅  
**For new cards/sets:** Need URL discovery ❌

We need a **hybrid approach**:
1. **Scrape existing URLs** for routine updates (efficient)
2. **Directory scraping** for URL discovery when needed

---

## URL Discovery Strategy

### Tier 1: Good Coverage (Use Direct Scraping)

**Japan-Toreca (96%) + TorecaCamp (98%)**
- Use existing URLs from DB
- One-time directory scrape to find missing 2-4%
- No ongoing index scraping needed

---

### Tier 2: Partial Coverage (Need URL Discovery)

**Toretoku (49.6%)**

**Discovery Method**:
```
URL: https://www.toretoku.jp/item?genre=5&page={n}
Method: Search by category, paginate through results
```

**From build-sets.js**:
```javascript
// Scrape listing pages
const listingUrl = `https://www.toretoku.jp/item?genre=5&stock=1&rank5[]=2&rank5[]=3&page=${page}`;

// Parse li.list elements
$('li.list').each((_, el) => {
  const link = $(el).find('a').attr('href');
  const id = link.match(/details\/(\d+)/)?.[1];
  // Match to cards by name/number
});
```

**Credit Cost**: ~50 credits to fill 900 missing URLs

---

**Dorasuta (9.4%) - Rik's main source!**

**Discovery Method**:
```
URL: https://dorasuta.jp/pokemon-card/series-list
       https://dorasuta.jp/pokemon-card/series/{series_code}
Method: Series list → Series page → Product links
```

**Test**:
```bash
curl "https://api.scrape.do/?token=TOKEN&url=https://dorasuta.jp/pokemon-card/series/S12A&render=true"
```

**From HTML**:
```html
<!-- Find product links -->
<a href="/pokemon-card/product?pid=605736">Card Name</a>
```

**Credit Cost**: ~100-200 credits for full coverage

**Note**: Series pages may timeout - need careful testing

---

### Tier 3: Minimal/No Coverage (Full Discovery Needed)

**Hobibinet (2.3%)**

**Discovery Method**:
```
URL: https://hobibinet-pokemon.com/search?q={set_code}
Method: Search by set, extract product handles
```

**From HTML**:
```javascript
// Parse meta JSON from search results
const metaMatch = html.match(/var meta = ({[\s\S]*?});/);
const meta = JSON.parse(metaMatch[1]);
meta.products.forEach(p => {
  const url = `https://hobibinet-pokemon.com/products/${p.handle}`;
  // Match to cards by title
});
```

**Credit Cost**: ~20-30 credits for full coverage

---

**Cardrush (0%) - NEW SITE**

**Discovery Method**:
```
URL: https://www.cardrush-pokemon.jp/products/list.php
Method: Category listing → Product grid
```

**Unknown**: Need to test
```bash
curl "https://api.scrape.do/?token=TOKEN&url=https://www.cardrush-pokemon.jp/products/list.php"
```

**Credit Cost**: Unknown (needs research)

---

**Playze (0%) - NEW SITE**

**Discovery Method**:
```
URL: https://playze.jp/collections/pokemon
Method: Collection page → Product grid
```

**Expected** (Shopify):
```javascript
// Parse collection page
$('a[href^="/products/"]').each((_, el) => {
  const handle = $(el).attr('href').replace('/products/', '');
  const url = `https://playze.jp/products/${handle}`;
  // Match to cards
});
```

**Credit Cost**: ~20-30 credits for full coverage

---

**C-Labo (0%) - NEW SITE**

**Discovery Method**:
```
URL: https://www.c-labo-online.jp/page/125
Method: Pokemon page → Product links
```

**Unknown**: Need to test
```bash
curl "https://api.scrape.do/?token=TOKEN&url=https://www.c-labo-online.jp/page/125"
```

**Credit Cost**: Unknown (needs research)

---

**Fukufuku Toreka (0%) - NEW SITE**

**Discovery Method**:
```
URL: https://pokemon.fukufukutoreka.com
Method: Homepage → Category → Product
```

**Unknown**: Need to test
```bash
curl "https://api.scrape.do/?token=TOKEN&url=https://pokemon.fukufukutoreka.com"
```

**Credit Cost**: Unknown (needs research)

---

## Implementation: Two-Phase Approach

### Phase 1: URL Discovery (One-Time)

**Goal**: Fill gaps for missing URLs

```typescript
// lib/scraping/url-discovery.ts

export async function discoverUrlsForProvider(
  provider: string,
  cards: Card[]
): Promise<DiscoveredUrl[]> {
  const missingCards = cards.filter(c => !hasUrl(c, provider));
  
  switch (provider) {
    case 'toretoku':
      return discoverToretokuUrls(missingCards);
    case 'dorasuta':
      return discoverDorasutaUrls(missingCards);
    case 'hobibinet':
      return discoverHobibinetUrls(missingCards);
    case 'cardrush':
      return discoverCardrushUrls(missingCards);
    case 'playze':
      return discoverPlayzeUrls(missingCards);
    case 'c-labo':
      return discoverCLaboUrls(missingCards);
    case 'fukufukutoreka':
      return discoverFukufukuUrls(missingCards);
    default:
      return [];
  }
}

// Example: Toretoku discovery
async function discoverToretokuUrls(cards: Card[]): Promise<DiscoveredUrl[]> {
  const discovered: DiscoveredUrl[] = [];
  
  // Scrape listing pages by set
  for (const set of getUniqueSets(cards)) {
    for (let page = 1; page <= 10; page++) {
      const url = `https://www.toretoku.jp/item?genre=5&kw=${set}&page=${page}`;
      const html = await scrapeDo(url);
      const $ = cheerio.load(html);
      
      // Parse product links
      $('li.list a').each((_, el) => {
        const href = $(el).attr('href');
        const id = href.match(/details\/(\d+)/)?.[1];
        const name = $(el).text();
        
        // Match to card by name
        const matchedCard = matchCardByName(cards, name);
        if (matchedCard) {
          discovered.push({
            cardId: matchedCard.id,
            provider: 'toretoku',
            url: `https://www.toretoku.jp/item/details/${id}`,
            quality: extractQualityFromName(name)
          });
        }
      });
    }
  }
  
  return discovered;
}
```

**Budget**: ~500 credits one-time to fill all gaps

---

### Phase 2: Routine Updates (Ongoing)

**Goal**: Fast updates using discovered URLs

```typescript
// lib/scraping/routine-update.ts

export async function routineUpdate(
  cards: Card[],
  options: { priority?: string[] } = {}
): Promise<UpdateResult> {
  // Use existing URLs from DB
  const results: UpdateResult = { updated: 0, creditsUsed: 0 };
  
  for (const card of cards) {
    // Try each provider
    for (const provider of PROVIDERS) {
      const url = getUrlFromDB(card, provider);
      if (!url) continue;
      
      try {
        const data = await scrapeProvider(provider, url);
        await savePriceToDB(card.id, provider, data);
        results.updated++;
        results.creditsUsed++;
      } catch (e) {
        console.error(`Failed to update ${card.id} from ${provider}`);
      }
    }
  }
  
  return results;
}
```

**Daily Budget**: ~500 credits

---

## Credit Budget (Full Implementation)

### One-Time: URL Discovery

| Provider | Missing URLs | Est. Credits | Method |
|----------|--------------|--------------|--------|
| Toretoku | ~900 | 90 | Paginated search |
| Dorasuta | ~1,650 | 165 | Series pages |
| Hobibinet | ~1,750 | 175 | Search by set |
| Cardrush | ~1,820 | 182 | List pages |
| Playze | ~1,820 | 182 | Collection |
| C-Labo | ~1,820 | 182 | Category |
| Fukufuku | ~1,820 | 182 | Category |
| **Total** | **~9,740** | **~1,158** | |

**One-time cost**: ~1,200 credits ($20)

### Ongoing: Routine Updates

| Strategy | Daily Credits | Monthly Cost |
|----------|---------------|--------------|
| All cards, all providers | 5,460 | $90 ❌ |
| Smart (favorites + high-value) | 500 | $8 ✅ |
| Minimal (free endpoints only) | 200 | $3 ✅ |

---

## Recommended Implementation Order

### Week 1: URL Discovery for Existing Sites
1. Toretoku (900 missing URLs)
2. Dorasuta (1,650 missing URLs - Rik's priority!)
3. Hobibinet (1,750 missing URLs)

### Week 2: URL Discovery for New Sites
4. Cardrush (test + implement)
5. Playze (test + implement)
6. C-Labo (test + implement)
7. Fukufuku Toreka (test + implement)

### Week 3: Routine Update System
8. Implement unified scrapers
9. Add smart scheduling
10. Test with 100 cards

### Week 4: UI Integration
11. Add refresh buttons
12. Show update status
13. Credit tracking display

---

## Conclusion

**The Reality**:
- 3 sites have good URL coverage (96-98%)
- 1 site has partial coverage (50%)
- 2 sites have minimal coverage (2-9%)
- 3 sites have NO URLs (0%)

**The Solution**:
1. One-time URL discovery (~1,200 credits)
2. Ongoing routine updates (~500 credits/day)
3. Unified scraping method for all sites

**Key Insight**: We need directory scraping for URL discovery, but NOT for routine updates. Once URLs are in the DB, we use direct product scraping.
