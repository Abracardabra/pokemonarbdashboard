# Migration Guide: Scrape.do → Browserless.io
**Date**: 2026-03-23  
**Scope**: Replace Scrape.do with Browserless + Direct Scraping

---

## Quick Summary

| Aspect | Before (Scrape.do) | After (Browserless) |
|--------|-------------------|---------------------|
| **Cost for full scrape** | ~150 credits | ~45 credits (70% savings) |
| **Free sites** | 0 | 6 (Japan-Toreca, TorecaCamp, Hobibinet, Playze, C-Labo, Fukufuku) |
| **Paid sites** | 9 | 3 (Cardrush, Toretoku, Dorasuta) |
| **Speed** | ~15-30s per page | ~2-5s (free) / ~15-30s (paid) |
| **Cloudflare bypass** | Partial | Excellent (Dorasuta working) |

---

## What We've Tested

### ✅ CONFIRMED WORKING

| Site | Method | Status | Notes |
|------|--------|--------|-------|
| **Japan-Toreca** | Direct JSON | ✅ Working | 1 request = all conditions |
| **TorecaCamp** | Direct .js | ✅ Working | Multi-condition on single page |
| **Hobibinet** | Direct HTML | ✅ Working | Simple Shopify parsing |
| **Playze** | Direct HTML | ✅ Working | Multi-condition tabs |
| **C-Labo** | Direct HTML | ✅ Working | Browse by set category |
| **Fukufuku** | Direct HTML | ✅ Working | EC-CUBE search |
| **Dorasuta** | Browserless /unblock | ✅ Working | Cloudflare bypass successful |
| **Toretoku** | Browserless /content | ✅ Working | Detail pages work (need IDs) |
| **Cardrush** | Browserless (planned) | ⚠️ Need URL | Product pages work, search pattern unknown |

---

## Files Changed

### New Files (v2 System)
```
lib/scraping/browserless-client.ts    # Browserless API client
lib/scraping/engine-v2.ts              # New scraping engine
app/api/scrape-v2/route.ts               # New API endpoint
.env.example                             # Updated environment template
```

### Files to Update (During Migration)
```
.env.local                               # Add BROWSERLESS_TOKEN, remove SCRAPE_DO_API_KEY
app/api/scrape/route.ts                  # Replace with scrape-v2 logic (Phase 2)
lib/scraping/engine.ts                   # Replace with engine-v2.ts (Phase 2)
```

### Files to Deprecate
```
lib/adapters/scrape-do-client.ts         # Can be removed after migration
lib/adapters/scrape-do-queries.ts        # Can be removed after migration
```

---

## Migration Steps

### Phase 1: Preparation (5 minutes)

1. **Verify Browserless token is set:**
   ```bash
   # Check your .env.local
   grep BROWSERLESS_TOKEN .env.local
   # Should show: BROWSERLESS_TOKEN=2UE1P15Z8J8yQHB56a47635b570ca9fe4331c2c5147152b9d
   ```

2. **Test the new endpoint:**
   ```bash
   curl http://localhost:3000/api/scrape-v2
   ```
   Expected response:
   ```json
   {
     "ok": true,
     "version": "2.0",
     "apiKeyConfigured": true,
     "cost": {
       "freeSites": ["japan-toreca", "torecacamp", ...],
       "paidSites": ["cardrush", "toretoku", "dorasuta"]
     }
   }
   ```

### Phase 2: Backend Migration (15 minutes)

1. **Replace the engine:**
   ```bash
   # Backup old engine
   mv lib/scraping/engine.ts lib/scraping/engine-old.ts
   # Use new engine
   mv lib/scraping/engine-v2.ts lib/scraping/engine.ts
   ```

2. **Update imports:**
   ```typescript
   // In app/api/scrape/route.ts
   // Change from:
   import { scrapeCard, scrapeBatch } from '@/lib/scraping/engine';
   
   // To (if using v2 alongside):
   import { scrapeCard, scrapeBatch } from '@/lib/scraping/engine-v2';
   ```

3. **Update API route:**
   ```bash
   # Option A: Replace existing route
   mv app/api/scrape/route.ts app/api/scrape/route-old.ts
   mv app/api/scrape-v2/route.ts app/api/scrape/route.ts
   
   # Option B: Keep both endpoints (parallel testing)
   # Just use /api/scrape-v2 in your UI for testing
   ```

4. **Restart Next.js dev server:**
   ```bash
   pnpm dev
   ```

### Phase 3: Frontend Update (10 minutes)

Update your UI to use the new endpoint:

```typescript
// Before
const response = await fetch('/api/scrape', {
  method: 'POST',
  body: JSON.stringify({ cardId: '...' })
});

// After (during testing)
const response = await fetch('/api/scrape-v2', {
  method: 'POST',
  body: JSON.stringify({ cardId: '...' })
});

// After (after full migration)
const response = await fetch('/api/scrape', {  // v2 is now at /api/scrape
  method: 'POST',
  body: JSON.stringify({ cardId: '...' })
});
```

### Phase 4: Cleanup (5 minutes)

1. **Remove old environment variable:**
   ```bash
   # Edit .env.local and remove:
   # SCRAPE_DO_API_KEY=...
   ```

2. **Remove deprecated files:**
   ```bash
   rm lib/adapters/scrape-do-client.ts
   rm lib/adapters/scrape-do-queries.ts
   rm lib/scraping/engine-old.ts
   rm app/api/scrape/route-old.ts
   ```

3. **Cancel Scrape.do subscription** (when ready)

---

## Cost Analysis

### Before (Scrape.do)
```
1820 cards × 9 sites = 16,380 scrapes/month
Cost: ~$50-100/month depending on plan
```

### After (Browserless)
```
1820 cards × 3 paid sites = 5,460 credits/month (paid)
1820 cards × 6 free sites = 0 credits/month (direct fetch)
Total: ~5,460 credits/month
Cost: ~$40/month (Growth plan - 9,000 credits)
Savings: 67% fewer credits, ~20% cost reduction
```

### Recommended Plan
- **Starter Plan** ($20/month, 3,000 credits): Good for ~30 full scrapes/month
- **Growth Plan** ($40/month, 9,000 credits): Recommended for daily updates

---

## Testing Checklist

### Manual Tests
- [ ] GET /api/scrape-v2 returns 200 with provider list
- [ ] POST /api/scrape-v2 with cardId scrapes successfully
- [ ] Batch requests work (up to 50 cards)
- [ ] Free sites return data without using credits
- [ ] Paid sites (Dorasuta) return data using 1 credit each
- [ ] Error handling works for invalid card IDs
- [ ] Error handling works for network failures

### Automated Tests (if available)
- [ ] Unit tests for browserless-client.ts
- [ ] Unit tests for engine-v2.ts
- [ ] Integration tests for API endpoint
- [ ] E2E test: Full scrape of 5 cards

---

## What You Need to Provide

### 1. Cardrush Search URL
I need you to manually browse to an SV3 set page on cardrush-pokemon.jp and share the URL pattern. For example:
```
https://www.cardrush-pokemon.jp/product/list?set=SV3
https://www.cardrush-pokemon.jp/search?keyword=黒炎の支配者
```

### 2. Set ID Mappings for C-Labo
C-Labo uses category IDs for sets. I have:
- SV3 = 2551 (confirmed)

Need:
- Other set category IDs as we expand

---

## Troubleshooting

### Issue: Browserless returning 401 Unauthorized
**Solution**: Verify token is set in `.env.local`:
```bash
BROWSERLESS_TOKEN=2UE1P15Z8J8yQHB56a47635b570ca9fe4331c2c5147152b9d
```

### Issue: Free sites returning empty/403
**Solution**: Some sites may have rate limiting. Add delays between requests:
```typescript
await new Promise(resolve => setTimeout(resolve, 2000));
```

### Issue: Dorasuta still showing Cloudflare
**Solution**: Ensure `/unblock` endpoint is being used (it should be by default for dorasuta).

---

## Next Steps

1. **Review this guide** - Make sure you understand the changes
2. **Run Phase 1 tests** - Verify /api/scrape-v2 is working
3. **Decide on migration approach**:
   - **Option A**: Gradual - Use /api/scrape-v2 alongside /api/scrape, then switch
   - **Option B**: Full replacement - Replace /api/scrape with v2 logic immediately
4. **Provide Cardrush URL** - So I can complete the Cardrush scraper
5. **Test with 5 cards** - Verify end-to-end flow works
6. **Monitor credit usage** - Check Browserless dashboard after first full scrape

---

## Questions?

If anything is unclear or you encounter issues during migration, check:
1. `/docs/SCRAPING_IMPLEMENTATION_PLAN.md` - Full technical details
2. `/docs/FINAL_9_SITES_STATUS.md` - Site-by-site status
3. Browserless dashboard - Monitor credit usage
