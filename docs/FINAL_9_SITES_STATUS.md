# FINAL STATUS - ALL 9 SITES
**Date**: 2026-03-23 (Updated with Browserless.io testing)  
**Card**: リザードンex (Charizard ex) 139/108 SV3 UR

## CORRECT BASE URLs

| # | Site | Base URL |
|---|------|----------|
| 1 | Japan-Toreca | `https://shop.japan-toreca.com/` |
| 2 | Cardrush | `https://www.cardrush-pokemon.jp/` |
| 3 | TorecaCamp | `https://torecacamp-pokemon.com/` |
| 4 | Toretoku | `https://www.toretoku.jp/pokemon` |
| 5 | Dorasuta | `https://dorasuta.jp/pokemon-card` |
| 6 | Hobibinet | `https://hobibinet-pokemon.com/` |
| 7 | Playze | `https://playze.jp/collections/pokemon` |
| 8 | C-Labo | `https://www.c-labo-online.jp/page/125` |
| 9 | Fukufuku | `https://pokemon.fukufukutoreka.com/` |

---

## SITE-BY-SITE VERIFIED STATUS

### 1. ✅ Japan-Toreca (トレカキングダム) — FREE, Shopify JSON
- **Homepage**: ✅ Direct access
- **Search**: `https://shop.japan-toreca.com/search?q={keyword}&type=product`
- **Product JSON**: `https://shop.japan-toreca.com/products/{handle}.json`
- **Card Found**: YES (3 conditions: A ¥6,900 / A- ¥5,200 / B ¥3,500)
- **In Stock**: No
- **Notes**: Separate product page per condition. Price in JSON is plain yen (not cents).

### 2. ✅ Cardrush (カードラッシュ) — Scrape.do, Custom Platform
- **Homepage**: ✅ via Scrape.do (no render needed)
- **Product Page**: ✅ `https://www.cardrush-pokemon.jp/product/{id}`
- **Search**: ❓ URL pattern unknown — search is JS-driven
- **Set Browsing**: Uses `product-list` with category IDs, needs investigation
- **Price Format**: `{price}円(税込)`
- **Stock Format**: `在庫数 {number}枚`
- **Condition**: In title as `〔状態X〕`
- **Notes**: Individual product pages work, but search/listing endpoints return 404 or timeout

### 3. ✅ TorecaCamp (トレカキャンプ) — FREE, Shopify JSON
- **Homepage**: ✅ Direct access
- **Search**: `https://torecacamp-pokemon.com/search?q={keyword}&type=product`
- **Product JSON**: `https://torecacamp-pokemon.com/products/{handle}.js`
- **Card Found**: YES (5 conditions: A ¥8,980 / A- ¥7,980 / B+ ¥6,980 / B ¥5,980 / C ¥4,980)
- **In Stock**: YES (Condition C)
- **Notes**: Multi-condition on single page. Prices in cents (divide by 100).

### 4. ✅ Toretoku (トレトク) — Detail Pages Work, Search Blocked
- **Homepage**: ✅ Direct access at `https://www.toretoku.jp/pokemon`
- **Product Detail**: ✅ `https://www.toretoku.jp/item/details/{id}` — **WORKS via Browserless**
- **Example**: `/item/details/131835` → アルセウスVSTAR UR, A:¥19,800 B:¥11,800 C:¥5,800
- **Data**: Name, prices per condition (A/B/C), stock counts, set name, model number, rarity
- **Search Page**: ❌ `https://www.toretoku.jp/item?kw={keyword}&genre=pokemon` — always returns "no results" (bot detection)
- **Suggestion API**: ✅ `https://www.toretoku.jp/ajax/getSuggestionList` — FREE, returns 2935 Pokemon items with item_name, model_number, rarity_name (genre_id=5)
- **SV3 Charizard 139/108 UR**: NOT in suggestion list (never listed / sold out)
- **SV3 Charizard 134/108 SAR**: In suggestion list (item_id=110848, but this is NOT the detail page ID)
- **Strategy**: Use existing product IDs from `prices.json` for detail page scraping. Suggestion API useful for discovery. Detail page IDs are different from suggestion item_ids.
- **Cost**: FREE (no Scrape.do needed, direct Browserless /content for detail pages)

### 5. ✅ Dorasuta (ドラゴンスター) — WORKING via Browserless /unblock
- **Homepage**: ✅ via Browserless /unblock at `https://dorasuta.jp/pokemon-card`
- **Series List**: ✅ `https://dorasuta.jp/pokemon-card/series-list`
- **Search**: ✅ `https://dorasuta.jp/pokemon-card/product-list?keyword=リザードンex` — returns full HTML with products
- **Product Detail**: `https://dorasuta.jp/pokemon-card/product?pid={id}` (meta tags only, full data needs JS)
- **SV3 Set ID**: `sid=7127` (set page still minimal, use search instead)
- **Card Found**: YES — リザードンex(139/108 UR), pid=464905, ¥7,500, SOLD OUT
- **Data per product** (from search results HTML):
  - Name: `リザードンex(139/108 UR)`
  - Rarity: `UR`
  - Product Number: `PN139108`
  - Price: `7,500円`
  - Stock: SOLDOUT
  - Image: `/contents/product/0/11_0000464905_0_0_m94USI.jpg`
  - URL: `/pokemon-card/product?pid=464905`
- **Cloudflare**: Bypassed by Browserless /unblock API (NOT by Scrape.do)
- **Browserless key**: `2UE1P15Z8J8yQHB56a47635b570ca9fe4331c2c5147152b9d`
- **Cost**: Browserless credits per request

### 6. ✅ Hobibinet (ホビビネット) — FREE, Shopify HTML
- **Homepage**: ✅ Direct access
- **Search**: `https://hobibinet-pokemon.com/search?q={keyword}&type=product`
- **Card Found**: YES (2 conditions: A ¥6,980 / A- ¥5,970)
- **In Stock**: No
- **Notes**: Separate product per condition. Parse HTML for prices.

### 7. ✅ Playze (プレイズ) — FREE, Shopify HTML
- **Homepage**: ✅ Direct access at `https://playze.jp/collections/pokemon`
- **Search**: `https://playze.jp/search?q={keyword}&type=product`
- **Product Page**: `https://playze.jp/products/{id}`
- **Card Found**: YES (3 conditions: A ¥8,008 / B ¥6,468 / C ¥4,818)
- **In Stock**: No
- **Notes**: Multi-condition on single page. Parse HTML for A/B/C tabs with prices.

### 8. ✅ C-Labo (カードラボ) — FREE, Direct HTML
- **Homepage**: ✅ Direct access at `https://www.c-labo-online.jp/page/125`
- **Set Browsing**: `https://www.c-labo-online.jp/product-list/{category_id}/`
- **SV3 Set Page**: `https://www.c-labo-online.jp/product-list/2551/?num=120&available=1`
- **Product Page**: `https://www.c-labo-online.jp/product/{id}`
- **Card Found**: YES — リザードンex SAR 134/108 at ¥44,800 in stock
- **UR 139/108**: NOT listed (sold out / not available)
- **Price Format**: `{price}円(税込) 在庫数{number}枚`
- **Notes**: No search by keyword found. Browse by set category. Correct domain is `c-labo-online.jp` NOT `c-labo.com`!

### 9. ✅ Fukufuku Toreka (福福トレカ) — FREE, EC-CUBE
- **Homepage**: ✅ Direct access at `https://pokemon.fukufukutoreka.com/`
- **Search**: `https://pokemon.fukufukutoreka.com/products/list?name={keyword}`
- **Product Page**: `https://pokemon.fukufukutoreka.com/products/detail/{id}`
- **Card Found**: YES (2 listings: NM + B condition — both sold out)
- **Notes**: EC-CUBE platform. Set browsing via `category_id` param.

---

## SUMMARY TABLE

| Site | Access | Card Data | Search Works | Tool | Credits |
|------|--------|-----------|--------------|------|---------|
| Japan-Toreca | ✅ Free | ✅ JSON | ✅ Yes | Direct | 0 |
| TorecaCamp | ✅ Free | ✅ JSON | ✅ Yes | Direct | 0 |
| Hobibinet | ✅ Free | ✅ HTML | ✅ Yes | Direct | 0 |
| Playze | ✅ Free | ✅ HTML | ✅ Yes | Direct | 0 |
| C-Labo | ✅ Free | ✅ HTML | ⚠️ By set only | Direct | 0 |
| Fukufuku | ✅ Free | ✅ HTML | ✅ Yes | Direct | 0 |
| Cardrush | ✅ Scrape.do | ✅ HTML | ⚠️ No search URL | Scrape.do | 1/req |
| Toretoku | ✅ Browserless | ✅ HTML | ⚠️ Detail pages only | Browserless | 1/req |
| Dorasuta | ✅ Browserless | ✅ HTML | ✅ Keyword search | Browserless /unblock | 1/req |

**WORKING**: 9/9 sites have a working data extraction path  
**FULL DATA**: 9/9 sites return card data (prices, stock, conditions)  
**SEARCH**: 7/9 sites have working search/browse (Cardrush needs search URL, Toretoku needs known IDs)  

---

## PRICE COMPARISON (Verified Data)

| Condition | Best Price | Site | Available |
|-----------|------------|------|-----------|
| A | ¥6,900 | Japan-Toreca | ❌ |
| A- | ¥5,200 | Japan-Toreca | ❌ |
| B+ | ¥6,980 | TorecaCamp | ❌ |
| B | ¥3,500 | Japan-Toreca | ❌ |
| C | ¥4,818 | Playze | ❌ |
| C | ¥4,980 | TorecaCamp | ✅ IN STOCK |
| SAR 134/108 | ¥44,800 | C-Labo | ✅ IN STOCK |

---

## SCRAPING IMPLEMENTATION PLAN

### Tier 1: Ready to Build (6 sites, all FREE)
| Site | Method | Multi-condition | Endpoint |
|------|--------|-----------------|----------|
| TorecaCamp | JSON | ✅ Yes | `.js` endpoint |
| Japan-Toreca | JSON | ❌ Per-page | `.json` endpoint |
| Playze | HTML | ✅ Yes | Product page |
| Hobibinet | HTML | ❌ Per-page | Search/product |
| C-Labo | HTML | ❌ Single | Set browse |
| Fukufuku | HTML | ❌ Per-page | Search |

### Tier 2: Needs Your Help (2 remaining gaps)
| Site | What Works | What's Missing |
|------|------------|----------------|
| Cardrush | Product detail pages via Scrape.do | Search/browse URL pattern — need you to find a set listing URL from browsing the site manually |
| Toretoku | Detail pages via Browserless, suggestion API | Mapping suggestion item_ids → detail page IDs (they're different numbering systems) |

---

## HOW TO USE FOR SET SCRAPING

### For any set, the approach is:
1. **TorecaCamp**: Search by set name → get product handles → fetch `.js` for each
2. **Japan-Toreca**: Search by set name → get product handles → fetch `.json` for each
3. **Playze**: Browse collection or search → parse HTML product pages
4. **Hobibinet**: Search by set name → parse HTML search results
5. **C-Labo**: Browse by set category ID → parse HTML listing page
6. **Fukufuku**: Search by set name → parse HTML listing page
7. **Cardrush**: Browse by set (need category URL from you) → parse via Scrape.do
8. **Toretoku**: Use known product IDs from `prices.json` → fetch detail pages via Browserless
9. **Dorasuta**: Search by keyword via Browserless /unblock → parse HTML product list
