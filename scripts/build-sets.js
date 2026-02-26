#!/usr/bin/env node
/**
 * Build data/prices.json for multiple Japanese sets
 *
 * Data sources:
 * - US price + TCGPlayer link: PokemonPriceTracker API
 * - JP buy prices + listing links: shop.japan-toreca.com search listing pages (A- and B only)
 *
 * Usage:
 *   node scripts/build-sets.js --sets s12a,sv2a,sv2d,sv2p
 *   node scripts/build-sets.js --sets s12a,sv2a --force
 *   node scripts/build-sets.js --sets sv2a,sv2d --toretoku sv
 *
 * Options:
 *   --toretoku <mode>    "none" | "s12a" (default) | "sv" | "all" | "cache" (cache-only; never fetch)
 *   --torecacamp <mode>  "none" | "s12a" | "all" (default)
 *   --merge              Merge updated sets into existing data/prices.json instead of overwriting it
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// New scraper modules
const { scrapeHareruya2Listings } = require('./scrape-hareruya2.js');
const { scrapeHobibinetListings } = require('./scrape-hobibinet.js');
const { scrapeDorasutaListings } = require('./scrape-dorasuta.js');

const ALLOWED_RARITIES = new Set(['AR', 'SAR', 'SR', 'CHR', 'UR', 'SSR', 'RRR']);
const ALLOWED_QUALITIES = new Set(['A-', 'B']);

const TORECACAMP_BASE = 'https://torecacamp-pokemon.com';
const TORECACAMP_RATE_LIMIT_MS_SEARCH = Number(process.env.TORECACAMP_RATE_LIMIT_MS_SEARCH || 1100);
const TORECACAMP_RATE_LIMIT_MS_PRODUCT = Number(process.env.TORECACAMP_RATE_LIMIT_MS_PRODUCT || 1100);
const TORECACAMP_MAX_PAGES_PER_RARITY = Number(process.env.TORECACAMP_MAX_PAGES_PER_RARITY || 12);
const TORECACAMP_MAX_HANDLES_PER_SET = Number(process.env.TORECACAMP_MAX_HANDLES_PER_SET || 1200);
const TORECACAMP_HANDLES_TTL_HOURS = Number(process.env.TORECACAMP_HANDLES_TTL_HOURS || 12);
const TORECACAMP_PRODUCT_TTL_HOURS = Number(process.env.TORECACAMP_PRODUCT_TTL_HOURS || 24);

// Optional strict check (anti-contamination): if we know the set's total numbering, enforce it.
// Add more as needed.
const SET_DENOMINATORS = {
  S12A: 172,
  SV2A: 165,
  SV2D: 71,
  SV2P: 71,
};

// Memoize per-handle product.json in-process (shared across sets) to reduce requests.
const torecacampProductMemo = new Map();

const API_BASE_URL = 'https://www.pokemonpricetracker.com/api/v2';
const API_KEY = process.env.POKEPRICE_API_KEY || process.env.POKEMONPRICETRACKER_API_KEY;

if (!API_KEY) {
  console.error('Missing API key. Set POKEMONPRICETRACKER_API_KEY (preferred) or POKEPRICE_API_KEY.');
  process.exit(1);
}

const workspaceRoot = path.join(__dirname, '..');
const outputPath = path.join(workspaceRoot, 'data', 'prices.json');
const cacheDir = path.join(workspaceRoot, 'data', 'cache');

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const MERGE = argv.includes('--merge');

function getArgValue(name) {
  const idx = argv.findIndex((a) => a === name);
  if (idx === -1) return null;
  return argv[idx + 1] || null;
}

const setsArg = getArgValue('--sets');
if (!setsArg) {
  console.error('Usage: node scripts/build-sets.js --sets s12a,sv2a,sv2d,sv2p [--force] [--merge] [--toretoku none|s12a|sv|all|cache] [--torecacamp none|s12a|all]');
  process.exit(1);
}

const toretokuMode = (getArgValue('--toretoku') || 's12a').toLowerCase();
if (!['none', 's12a', 'sv', 'all', 'cache'].includes(toretokuMode)) {
  console.error('Invalid --toretoku mode. Use: none | s12a | sv | all | cache');
  process.exit(1);
}

const torecacampMode = (getArgValue('--torecacamp') || 'all').toLowerCase();
if (!['none', 's12a', 'all'].includes(torecacampMode)) {
  console.error('Invalid --torecacamp mode. Use: none | s12a | all');
  process.exit(1);
}

// New shop scraper modes
const hareruya2Mode = (getArgValue('--hareruya2') || 's12a').toLowerCase();
if (!['none', 's12a', 'sv', 'all', 'cache'].includes(hareruya2Mode)) {
  console.error('Invalid --hareruya2 mode. Use: none | s12a | sv | all | cache');
  process.exit(1);
}

const hobibinetMode = (getArgValue('--hobibinet') || 's12a').toLowerCase();
if (!['none', 's12a', 'sv', 'all', 'cache'].includes(hobibinetMode)) {
  console.error('Invalid --hobibinet mode. Use: none | s12a | sv | all | cache');
  process.exit(1);
}

const dorasutaMode = (getArgValue('--dorasuta') || 's12a').toLowerCase();
if (!['none', 's12a', 'sv', 'all', 'cache'].includes(dorasutaMode)) {
  console.error('Invalid --dorasuta mode. Use: none | s12a | sv | all | cache');
  process.exit(1);
}

const SETS = setsArg
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFileFresh(filePath, maxAgeMs) {
  try {
    const st = fs.statSync(filePath);
    const ageMs = Date.now() - st.mtimeMs;
    return ageMs >= 0 && ageMs <= maxAgeMs;
  } catch {
    return false;
  }
}

function readJsonIfFresh(filePath, maxAgeMs) {
  if (!isFileFresh(filePath, maxAgeMs)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function safeCacheKey(s) {
  // Shopify handles are generally safe, but belt + suspenders.
  return String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 120);
}

function jitter(ms, pct = 0.15) {
  const delta = ms * pct;
  const j = (Math.random() * 2 - 1) * delta;
  return Math.max(0, Math.round(ms + j));
}

function normalizeQuality(q) {
  const t = String(q || '').toUpperCase().replace('－', '-');
  if (t === 'A-') return 'A-';
  if (t === 'B') return 'B';
  if (t === 'A') return 'A';
  return null;
}

function parseMoneyJPY(text) {
  const m = String(text || '').match(/¥\s*([\d,]+)/);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ''), 10);
}

function parseCardInfoFromHeading(heading) {
  // Example: "【状態A-】アルセウスVSTAR UR (262/172) [S12a]"
  const m = String(heading || '').match(/】\s*(.+?)\s+(AR|SAR|SR|CHR|UR|SSR|RRR)\s*\((\d+\/\d+)\)\s*\[\s*([^\]]+)\s*\]/i);
  if (!m) return null;
  return { nameJP: m[1].trim(), rarity: m[2].toUpperCase(), cardNumber: m[3], setCode: String(m[4] || '').trim() };
}

async function fetchJson(url, { rateLimitMs = 1300, maxRetries = 5 } = {}) {
  // Gentle pacing + retry on 429 to stay within minute windows.
  let attempt = 0;

  while (true) {
    attempt += 1;
    await delay(rateLimitMs);

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    if (res.status === 429 && attempt <= maxRetries) {
      const retryAfter = Number(res.headers.get('retry-after') || 0);
      const backoffMs = Math.max(60000, retryAfter * 1000, 15000 * attempt);
      const body = await res.text().catch(() => '');
      console.warn(`⚠ 429 rate-limited. Waiting ${Math.round(backoffMs / 1000)}s then retrying (${attempt}/${maxRetries}). ${body.slice(0, 120)}`);
      await delay(backoffMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
    }

    return res.json();
  }
}

async function fetchHtml(url, {
  headers = {},
  timeoutMs = 25000,
  maxRetries = 4,
  retryBackoffMs = 3000,
  rateLimitMs = 650,
} = {}) {
  let attempt = 0;

  while (true) {
    attempt += 1;
    await delay(rateLimitMs);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html',
          ...headers,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // Retry transient 5xx and 429.
        if ((res.status >= 500 || res.status === 429) && attempt <= maxRetries) {
          const backoff = retryBackoffMs * attempt;
          console.warn(`⚠ HTTP ${res.status} for ${url}. Retrying in ${Math.round(backoff / 1000)}s (${attempt}/${maxRetries})`);
          await delay(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
      }

      return await res.text();
    } catch (err) {
      const isLast = attempt > maxRetries;
      if (isLast) throw err;
      const backoff = retryBackoffMs * attempt;
      console.warn(`⚠ fetchHtml failed (${attempt}/${maxRetries}) for ${url}: ${err?.message || err}. Retrying in ${Math.round(backoff / 1000)}s`);
      await delay(backoff);
    } finally {
      clearTimeout(t);
    }
  }
}

async function fetchAllCardsFromApi(apiSetId) {
  ensureDir(cacheDir);
  const cacheApiPath = path.join(cacheDir, `ppt-${apiSetId}-cards.json`);

  if (!FORCE && fs.existsSync(cacheApiPath)) {
    const cached = JSON.parse(fs.readFileSync(cacheApiPath, 'utf8'));
    if (cached?.data?.length) {
      console.log(`📦 Using cached API set dump: ${path.relative(workspaceRoot, cacheApiPath)}`);
      return cached;
    }
  }

  console.log(`📡 Fetching full set from PokemonPriceTracker API: ${apiSetId} (japanese)`);

  const limit = 50;
  let offset = 0;
  let all = [];
  let metadata = null;

  while (true) {
    const params = new URLSearchParams({
      set: apiSetId,
      language: 'japanese',
      limit: String(limit),
      offset: String(offset),
    });

    const url = `${API_BASE_URL}/cards?${params.toString()}`;
    const page = await fetchJson(url);

    metadata = page.metadata || metadata;
    const chunk = Array.isArray(page.data) ? page.data : [];
    all.push(...chunk);

    const hasMore = Boolean(page.metadata?.hasMore);
    console.log(`  ✓ API page offset=${offset} count=${chunk.length} hasMore=${hasMore}`);

    if (!hasMore || chunk.length === 0) break;
    offset += limit;
  }

  const out = { data: all, metadata };
  fs.writeFileSync(cacheApiPath, JSON.stringify(out, null, 2));
  console.log(`💾 Wrote API cache: ${path.relative(workspaceRoot, cacheApiPath)} (${all.length} cards)`);
  return out;
}

function mapApiRarityToCode(rarity) {
  const r = String(rarity || '').trim().toLowerCase();
  if (r === 'art rare') return 'AR';
  if (r === 'special art rare') return 'SAR';
  if (r === 'super rare') return 'SR';
  if (r === 'character rare') return 'CHR';
  if (r === 'ultra rare') return 'UR';
  if (r === 'shiny super rare') return 'SSR';
  if (r === 'triple rare') return 'RRR';
  return null;
}

async function scrapeJapanTorecaListings(apiSetId, displaySetCode) {
  ensureDir(cacheDir);
  const cacheJTPath = path.join(cacheDir, `japan-toreca-${apiSetId}-listings.json`);

  if (!FORCE && fs.existsSync(cacheJTPath)) {
    const cached = JSON.parse(fs.readFileSync(cacheJTPath, 'utf8'));
    if (Array.isArray(cached) && cached.length) {
      const needsUpgrade = cached.some((r) => typeof r?.inStock !== 'boolean');
      if (!needsUpgrade) {
        console.log(`📦 Using cached Japan-Toreca listings: ${path.relative(workspaceRoot, cacheJTPath)}`);
        return cached;
      }
      console.log(`♻️  Cached Japan-Toreca listings missing inStock; re-scraping: ${path.relative(workspaceRoot, cacheJTPath)}`);
    }
  }

  console.log(`🛒 Scraping Japan-Toreca search listings for ${displaySetCode} (A-/B only)`);

  const rarities = Array.from(ALLOWED_RARITIES);
  const all = [];
  const seenUrls = new Set();

  for (const rarity of rarities) {
    const base = `https://shop.japan-toreca.com/search?q=${encodeURIComponent(`${displaySetCode.toLowerCase()} ${rarity.toLowerCase()}`)}`;
    let page = 1;

    while (page <= 20) {
      const url = page === 1 ? base : `${base}&page=${page}`;
      console.log(`  📄 ${rarity}: page ${page}`);

      let html;
      try {
        html = await fetchHtml(url, { rateLimitMs: 450, timeoutMs: 25000, maxRetries: 4, retryBackoffMs: 2500 });
      } catch (err) {
        console.warn(`    ⚠ Failed to fetch ${url}: ${err?.message || err}`);
        break;
      }
      const $ = cheerio.load(html);

      const anchors = $('a[href*="/products/pokemon-"]');
      if (anchors.length === 0) break;

      let foundOnPage = 0;

      anchors.each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href');
        if (!href || href.includes('#')) return;

        const heading = $a.find('h3').text().trim() || $a.text().trim();
        if (!heading) return;

        const qualityRaw = heading.match(/状態\s*([A-ZＡ-Ｚ\-－]+)/)?.[1] || null;
        const quality = normalizeQuality(qualityRaw);
        if (!quality || !ALLOWED_QUALITIES.has(quality)) return;

        const info = parseCardInfoFromHeading(heading);
        if (!info) return;
        if (!ALLOWED_RARITIES.has(info.rarity)) return;
        if (String(info.setCode || '').toUpperCase() !== displaySetCode.toUpperCase()) return;

        const absUrl = href.startsWith('http') ? href : `https://shop.japan-toreca.com${href}`;
        if (seenUrls.has(absUrl)) return;

        const priceText = $a.closest('div').text();
        const priceJPY = parseMoneyJPY(priceText);
        if (!priceJPY) return;

        const soldOutText = priceText.toLowerCase();
        const inStock = !(
          soldOutText.includes('sold out') ||
          soldOutText.includes('売り切') ||
          soldOutText.includes('在庫切')
        );

        all.push({
          set: displaySetCode,
          rarity: info.rarity,
          cardNumber: info.cardNumber,
          nameJP: info.nameJP,
          quality,
          priceJPY,
          url: absUrl,
          inStock,
        });

        seenUrls.add(absUrl);
        foundOnPage += 1;
      });

      if (foundOnPage === 0) break;
      page += 1;
      await delay(400);
    }
  }

  fs.writeFileSync(cacheJTPath, JSON.stringify(all, null, 2));
  console.log(`💾 Wrote Japan-Toreca cache: ${path.relative(workspaceRoot, cacheJTPath)} (${all.length} listings)`);
  return all;
}

async function scrapeToretokuListings(apiSetId, displaySetCode, { maxPages = 35, cacheOnly = false } = {}) {
  // Toretoku search results pages already contain card number / rarity / rank / price.
  // We only scrape in-stock items.
  ensureDir(cacheDir);
  const cachePath = path.join(cacheDir, `toretoku-${apiSetId}-listings.json`);

  if (!FORCE && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Array.isArray(cached)) {
      console.log(`📦 Using cached Toretoku listings: ${path.relative(workspaceRoot, cachePath)} (${cached.length} listings)`);
      return cached;
    }
  }

  if (cacheOnly) {
    console.log(`🧊 No cached Toretoku listings for ${displaySetCode}; cache-only mode enabled (skipping live fetch)`);
    return [];
  }

  console.log(`🛒 Scraping Toretoku listings for ${displaySetCode} (A/B only, in-stock)`);

  const all = [];
  const seen = new Set();
  let hadFetchError = false;

  // Based on UI behavior: rank5[]=2 and rank5[]=3 correspond to ranks A and B.
  // Keep query minimal and stable.
  const baseParams = new URLSearchParams({
    genre: '5',
    kw: displaySetCode.toLowerCase(),
    stock: '1',
  });
  baseParams.append('rank5[]', '2');
  baseParams.append('rank5[]', '3');

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams(baseParams);
    if (page > 1) params.set('page', String(page));

    const url = `https://www.toretoku.jp/item?${params.toString()}`;
    console.log(`  📄 page ${page}`);

    let html;
    try {
      html = await fetchHtml(url, { rateLimitMs: 650, timeoutMs: 30000, maxRetries: 5, retryBackoffMs: 3000 });
    } catch (err) {
      hadFetchError = true;
      console.warn(`    ⚠ Failed to fetch ${url}: ${err?.message || err}`);
      break;
    }
    const $ = cheerio.load(html);

    const items = $('li.list');
    if (items.length === 0) break;

    let found = 0;

    items.each((_, el) => {
      const $li = $(el);
      const href = $li.find('a[href*="/item/details/"]').first().attr('href');
      if (!href) return;

      const absUrl = href.startsWith('http') ? href : `https://www.toretoku.jp${href}`;
      if (seen.has(absUrl)) return;
      seen.add(absUrl);

      const text = $li.text().replace(/\s+/g, ' ').trim();

      // Example text:
      // 日本語 ギラティナVSTAR UR S12a 261/172 A 27,800円 在庫数:3
      const m = text.match(/日本語\s+(.+?)\s+(AR|SAR|SR|CHR|UR|SSR|RRR)\s+([A-Za-z0-9+]+)\s+(\d+\/\d+)\s+([ABCD])\s+([\d,]+)円/);
      if (!m) return;

      const nameJP = m[1].trim();
      const rarity = m[2].toUpperCase();
      const set = m[3].toUpperCase();
      const cardNumber = m[4];
      const rank = m[5].toUpperCase();
      const priceJPY = parseInt(m[6].replace(/,/g, ''), 10);

      if (set !== displaySetCode.toUpperCase()) return;
      if (!ALLOWED_RARITIES.has(rarity)) return;
      if (!(rank === 'A' || rank === 'B')) return;

      const stockMatch = text.match(/在庫数\s*:\s*(\d+)/);
      const stock = stockMatch ? parseInt(stockMatch[1], 10) : null;

      all.push({
        set: displaySetCode,
        rarity,
        cardNumber,
        nameJP,
        quality: rank === 'A' ? 'A-' : 'B',
        priceJPY,
        stock,
        url: absUrl,
      });

      found += 1;
    });

    if (found === 0) break;

    // Gentle pace (toretoku is sensitive to bursts)
    await delay(650);
  }

  if (hadFetchError && all.length === 0) {
    console.warn(`⚠ Toretoku scrape failed for ${displaySetCode} and found 0 listings; NOT writing empty cache: ${path.relative(workspaceRoot, cachePath)}`);
    return all;
  }

  fs.writeFileSync(cachePath, JSON.stringify(all, null, 2));
  console.log(`💾 Wrote Toretoku cache: ${path.relative(workspaceRoot, cachePath)} (${all.length} listings)`);

  if (hadFetchError) {
    console.warn(`⚠ Toretoku scrape for ${displaySetCode} completed with fetch errors; cache may be partial.`);
  }

  return all;
}

async function scrapeTorecacampListings(apiSetId, displaySetCode) {
  // Shopify store. We scrape by:
  // 1) discovering product handles via search HTML (cached)
  // 2) fetching /products/<handle>.js for structured variants (A-/B) (cached per-handle)
  // Guardrails (anti-contamination):
  // - title must contain the exact set code
  // - card number must be present; if we know the set denominator, it must match
  // - only accept allowed rarities; exclude graded/PSA items
  ensureDir(cacheDir);

  const cachePath = path.join(cacheDir, `torecacamp-${apiSetId}-listings.json`);
  const handlesCachePath = path.join(cacheDir, `torecacamp-${apiSetId}-handles.json`);
  const productsCacheDir = path.join(cacheDir, 'torecacamp-products');
  ensureDir(productsCacheDir);

  if (!FORCE && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Array.isArray(cached)) {
      console.log(`📦 Using cached Torecacamp listings: ${path.relative(workspaceRoot, cachePath)}`);
      return cached;
    }
  }

  console.log(`🛒 Scraping Torecacamp listings for ${displaySetCode} (A-/B only)`);

  const handlesTtlMs = TORECACAMP_HANDLES_TTL_HOURS * 60 * 60 * 1000;
  const productTtlMs = TORECACAMP_PRODUCT_TTL_HOURS * 60 * 60 * 1000;

  let handles = [];

  const cachedHandles = FORCE ? null : readJsonIfFresh(handlesCachePath, handlesTtlMs);
  if (cachedHandles && Array.isArray(cachedHandles.handles) && cachedHandles.handles.length) {
    handles = cachedHandles.handles;
    console.log(
      `📦 Using cached Torecacamp handle discovery: ${path.relative(workspaceRoot, handlesCachePath)} (${handles.length} handles)`
    );
  } else {
    console.log(`🔎 Discovering Torecacamp product handles for ${displaySetCode} via search pages...`);

    // Discover handles via rarity searches (bounded)
    const handleSet = new Set();

    outer: for (const rarity of Array.from(ALLOWED_RARITIES)) {
      const q = `${displaySetCode.toLowerCase()} ${rarity.toLowerCase()}`;

      for (let page = 1; page <= TORECACAMP_MAX_PAGES_PER_RARITY; page++) {
        if (handleSet.size >= TORECACAMP_MAX_HANDLES_PER_SET) break outer;

        const url = `${TORECACAMP_BASE}/search?q=${encodeURIComponent(q)}&page=${page}`;
        let html;
        try {
          html = await fetchHtml(url, {
            rateLimitMs: jitter(TORECACAMP_RATE_LIMIT_MS_SEARCH),
            timeoutMs: 30000,
            maxRetries: 5,
            retryBackoffMs: 3500,
          });
        } catch (err) {
          console.warn(`    ⚠ Torecacamp search failed: ${url}: ${err?.message || err}`);
          break;
        }

        const $ = cheerio.load(html);
        const anchors = $('a[href^="/products/"]');
        if (anchors.length === 0) break;

        let found = 0;
        anchors.each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          const m = href.match(/\/products\/([^\/?#]+)/);
          if (!m) return;
          const handle = m[1];
          if (!handle) return;

          handleSet.add(handle);
          found += 1;
        });

        if (found === 0) break;
      }
    }

    handles = Array.from(handleSet);

    fs.writeFileSync(
      handlesCachePath,
      JSON.stringify({ set: displaySetCode.toUpperCase(), handles, discoveredAt: new Date().toISOString() }, null, 2)
    );
    console.log(`💾 Wrote Torecacamp handles cache: ${path.relative(workspaceRoot, handlesCachePath)} (${handles.length} handles)`);
  }

  const expectedDenom = SET_DENOMINATORS[displaySetCode.toUpperCase()] || null;
  const setRe = new RegExp(`(^|[^A-Z0-9])${escapeRegExp(displaySetCode)}([^A-Z0-9]|$)`, 'i');

  const out = [];

  const dbg = process.env.TORECACAMP_DEBUG === '1';
  const dbgCounts = { totalHandles: handles.length, keptSet: 0, keptNum: 0, keptDenom: 0, keptRarity: 0, keptVariants: 0, offers: 0 };

  for (const handle of handles) {
    let product = torecacampProductMemo.get(handle) || null;

    const productCachePath = path.join(productsCacheDir, `product-${safeCacheKey(handle)}.json`);

    if (!product && !FORCE) {
      const cachedProduct = readJsonIfFresh(productCachePath, productTtlMs);
      if (cachedProduct) product = cachedProduct;
    }

    if (!product) {
      const url = `${TORECACAMP_BASE}/products/${handle}.js`;
      let body;
      try {
        body = await fetchHtml(url, {
          headers: { Accept: 'application/json' },
          rateLimitMs: jitter(TORECACAMP_RATE_LIMIT_MS_PRODUCT),
          timeoutMs: 30000,
          maxRetries: 6,
          retryBackoffMs: 4000,
        });
      } catch (err) {
        console.warn(`    ⚠ Torecacamp product.js failed: ${url}: ${err?.message || err}`);
        continue;
      }

      try {
        product = JSON.parse(body);
      } catch {
        continue;
      }

      // Best-effort write; cache is only an optimization.
      try {
        fs.writeFileSync(productCachePath, JSON.stringify(product, null, 2));
      } catch {}
    }

    if (product) torecacampProductMemo.set(handle, product);

    const title = String(product?.title || '').trim();
    const tags = product?.tags || '';

    // Exclude graded/PSA
    const tagsText = Array.isArray(tags) ? tags.join(' ') : String(tags);
    if (/\bPSA\b/i.test(title) || tagsText.includes('鑑定品')) continue;

    // Strict set check (avoid cross-set contamination from search noise)
    if (!setRe.test(title)) continue;
    dbgCounts.keptSet += 1;

    // Card number + denominator check
    const numMatch = title.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
    if (!numMatch) continue;
    dbgCounts.keptNum += 1;

    const cardNumber = `${numMatch[1]}/${numMatch[2]}`;
    const num = parseInt(numMatch[1], 10);
    const denom = parseInt(numMatch[2], 10);

    // Note: many JP sets have secret rares with num > denom (e.g. 171/165). Allow that.
    if (!Number.isFinite(num) || !Number.isFinite(denom) || denom <= 0 || num <= 0) continue;
    dbgCounts.keptDenom += 1;
    if (expectedDenom && denom !== expectedDenom) continue;

    const rarityMatch = title.match(/\b(AR|SAR|SR|CHR|UR|SSR|RRR)\b/i);
    if (!rarityMatch) continue;
    const rarity = rarityMatch[1].toUpperCase();
    if (!ALLOWED_RARITIES.has(rarity)) continue;
    dbgCounts.keptRarity += 1;

    const variants = Array.isArray(product?.variants) ? product.variants : [];

    const pickVariant = (kind) => {
      // kind: 'A-' or 'B'
      const titles = variants.map((x) => String(x?.public_title || x?.title || ''));

      const findAny = (needles) => {
        for (const n of needles) {
          const idx = titles.findIndex((t) => t.includes(n));
          if (idx !== -1) return variants[idx];
        }
        return null;
      };

      // Some shops use 状態A instead of 状態A-; normalize A -> A-
      const v =
        kind === 'A-'
          ? findAny(['状態A-', '状態A'])
          : findAny(['状態B']);
      if (!v) return null;
      const priceCents = Number(v?.price ?? 0);
      const priceJPY = Math.round(priceCents / 100);
      if (!priceJPY) return null;
      return {
        priceJPY,
        url: `${TORECACAMP_BASE}/products/${handle}`,
        quality: kind,
        inStock: Boolean(v?.available),
      };
    };

    const aMinus = pickVariant('A-');
    const b = pickVariant('B');
    if (!aMinus && !b) continue;
    dbgCounts.keptVariants += 1;

    if (aMinus) {
      dbgCounts.offers += 1;
      out.push({
        set: displaySetCode,
        rarity,
        cardNumber,
        nameJP: title,
        quality: 'A-',
        priceJPY: aMinus.priceJPY,
        url: aMinus.url,
        inStock: aMinus.inStock,
      });
    }

    if (b) {
      dbgCounts.offers += 1;
      out.push({
        set: displaySetCode,
        rarity,
        cardNumber,
        nameJP: title,
        quality: 'B',
        priceJPY: b.priceJPY,
        url: b.url,
        inStock: b.inStock,
      });
    }
  }

  if (dbg) {
    console.log(`🧪 Torecacamp debug ${displaySetCode}:`, dbgCounts);
  }

  fs.writeFileSync(cachePath, JSON.stringify(out, null, 2));
  console.log(`💾 Wrote Torecacamp cache: ${path.relative(workspaceRoot, cachePath)} (${out.length} offers)`);
  return out;
}

function bestJTByCard(listings) {
  /**
   * listings[] for one set; returns map cardNumber -> { 'A-': best, 'B': best }
   * "best" = lowest price for that condition.
   */
  const map = new Map();

  for (const row of listings) {
    const key = row.cardNumber;
    if (!map.has(key)) map.set(key, { 'A-': null, B: null });

    const bucket = map.get(key);
    const cur = bucket[row.quality];
    if (!cur || row.priceJPY < cur.priceJPY) bucket[row.quality] = row;
  }

  return map;
}

function pickUsMarket(apiCard) {
  // API v2 shape (as seen in cached dumps):
  // - market price: apiCard.prices.market
  // - url: apiCard.tcgPlayerUrl
  // - sellers: apiCard.prices.sellers
  const prices = apiCard?.prices || null;
  const market = prices?.market ?? null;
  const url = apiCard?.tcgPlayerUrl || null;
  const sellerCount = prices?.sellers ?? null;

  return {
    marketPrice: market != null ? Number(market) : null,
    url,
    sellerCount: sellerCount != null ? Number(sellerCount) : null,
  };
}

function pickCanonicalSetPrefix(apiCards, apiSetId) {
  // The API sometimes returns multiple setName prefixes for one set code
  // (e.g. querying "s12" returns both "S12:" and "S12a:").
  // Also, suffix casing varies across sets (SV2D vs SV6a).
  //
  // Strategy: choose the most frequent setName prefix whose code part equals
  // the requested apiSetId (case-insensitive), then filter to that.
  const wanted = String(apiSetId || '').trim().toLowerCase();

  const counts = new Map();

  for (const c of apiCards) {
    const setName = String(c?.setName || '').trim();
    const prefix = setName.split(':')[0];
    if (!prefix) continue;

    if (prefix.toLowerCase() !== wanted) continue;

    counts.set(prefix, (counts.get(prefix) || 0) + 1);
  }

  if (counts.size === 0) return null;

  let best = null;
  let bestCount = -1;
  for (const [p, n] of counts.entries()) {
    if (n > bestCount) {
      best = p;
      bestCount = n;
    }
  }

  return best ? `${best}:` : null;
}

function buildDatasetForSet({ apiSetId, displaySetCode, apiDump, jtListings, toretokuListings, torecacampListings, hareruya2Listings = [], hobibinetListings = [], dorasutaListings = [] }) {
  const jtByCard = bestJTByCard(jtListings);

  const ttByCard = bestJTByCard(
    (toretokuListings || []).map((r) => ({
      cardNumber: r.cardNumber,
      quality: r.quality, // already normalized to A-/B
      priceJPY: r.priceJPY,
      url: r.url,
      stock: r.stock ?? null,
      inStock: true,
    }))
  );

  const tcByCard = bestJTByCard(
    (torecacampListings || []).map((r) => ({
      cardNumber: r.cardNumber,
      quality: r.quality,
      priceJPY: r.priceJPY,
      url: r.url,
      inStock: r.inStock !== false,
    }))
  );

  const h2ByCard = bestJTByCard(
    (hareruya2Listings || []).map((r) => ({
      cardNumber: r.cardNumber,
      quality: r.quality,
      priceJPY: r.priceJPY,
      url: r.url,
      inStock: r.inStock !== false,
    }))
  );

  const hbByCard = bestJTByCard(
    (hobibinetListings || []).map((r) => ({
      cardNumber: r.cardNumber,
      quality: r.quality,
      priceJPY: r.priceJPY,
      url: r.url,
      inStock: r.inStock !== false,
    }))
  );

  const dsByCard = bestJTByCard(
    (dorasutaListings || []).map((r) => ({
      cardNumber: r.cardNumber,
      quality: r.quality,
      priceJPY: r.priceJPY,
      url: r.url,
      inStock: r.inStock !== false,
    }))
  );

  const outCards = [];

  const apiCards = Array.isArray(apiDump.data) ? apiDump.data : [];
  const expectedPrefix = pickCanonicalSetPrefix(apiCards, apiSetId);

  const filteredApiCards = expectedPrefix
    ? apiCards.filter((c) => String(c?.setName || '').trim().startsWith(expectedPrefix))
    : apiCards;

  if (expectedPrefix && filteredApiCards.length !== apiCards.length) {
    console.warn(
      `⚠ Set contamination: ${displaySetCode} (set=${apiSetId}) API returned ${apiCards.length} cards, ` +
        `but only ${filteredApiCards.length} match canonical setName prefix "${expectedPrefix}".`
    );
  }

  for (const apiCard of filteredApiCards) {
    const rarityCode = mapApiRarityToCode(apiCard.rarity);
    if (!rarityCode || !ALLOWED_RARITIES.has(rarityCode)) continue;

    const cardNumber = apiCard.cardNumber || apiCard.number || null;
    if (!cardNumber) continue;

    // cardNumber already contains "262/172" style in this API
    const cardNumberSlash = null;

    const us = pickUsMarket(apiCard);

    const jt = jtByCard.get(cardNumberSlash || cardNumber) || jtByCard.get(cardNumber) || { 'A-': null, B: null };
    const tt = ttByCard.get(cardNumberSlash || cardNumber) || ttByCard.get(cardNumber) || { 'A-': null, B: null };
    const tc = tcByCard.get(cardNumberSlash || cardNumber) || tcByCard.get(cardNumber) || { 'A-': null, B: null };
    const h2 = h2ByCard.get(cardNumberSlash || cardNumber) || h2ByCard.get(cardNumber) || { 'A-': null, B: null };
    const hb = hbByCard.get(cardNumberSlash || cardNumber) || hbByCard.get(cardNumber) || { 'A-': null, B: null };
    const ds = dsByCard.get(cardNumberSlash || cardNumber) || dsByCard.get(cardNumber) || { 'A-': null, B: null };

    const jpAminus = jt['A-']
      ? {
          priceJPY: jt['A-'].priceJPY,
          url: jt['A-'].url,
          quality: 'A-',
          inStock: jt['A-'].inStock !== false,
        }
      : null;
    const jpB = jt.B
      ? {
          priceJPY: jt.B.priceJPY,
          url: jt.B.url,
          quality: 'B',
          inStock: jt.B.inStock !== false,
        }
      : null;

    const ttA = tt['A-'] ? { priceJPY: tt['A-'].priceJPY, url: tt['A-'].url, quality: 'A-' } : null;
    const ttB = tt.B ? { priceJPY: tt.B.priceJPY, url: tt.B.url, quality: 'B' } : null;

    const tcAminus = tc['A-']
      ? {
          priceJPY: tc['A-'].priceJPY,
          url: tc['A-'].url,
          quality: 'A-',
          inStock: tc['A-'].inStock !== false,
        }
      : null;
    const tcB = tc.B
      ? {
          priceJPY: tc.B.priceJPY,
          url: tc.B.url,
          quality: 'B',
          inStock: tc.B.inStock !== false,
        }
      : null;

    outCards.push({
      set: displaySetCode.toUpperCase(),
      setId: apiSetId,
      number: cardNumber,
      name: apiCard.name || null,
      rarity: rarityCode,
      images: {
        small: apiCard.imageCdnUrl200 || apiCard.imageCdnUrl || apiCard.imageUrl || null,
        large: apiCard.imageCdnUrl800 || apiCard.imageCdnUrl400 || apiCard.imageCdnUrl || apiCard.imageUrl || null,
      },
      japanToreca: {
        aMinus: jpAminus,
        b: jpB,
      },
      toretoku: {
        a: ttA,
        b: ttB,
        stockA: tt['A-']?.stock ?? null,
        stockB: tt.B?.stock ?? null,
      },
      torecacamp: {
        aMinus: tcAminus,
        b: tcB,
      },
      usMarket: {
        tcgplayer: {
          marketPrice: us.marketPrice,
          url: us.url,
          sellerCount: us.sellerCount,
        },
      },
      updatedAt: new Date().toISOString(),
    });
  }

  return outCards;
}

async function main() {
  console.log('======================================================================');
  console.log(`🏗️  Build dataset: ${SETS.join(', ')}`);
  console.log('======================================================================');

  ensureDir(cacheDir);

  const allCards = [];

  for (const apiSetId of SETS) {
    const displaySetCode = apiSetId.toUpperCase();

    const apiDump = await fetchAllCardsFromApi(apiSetId);
    const jtListings = await scrapeJapanTorecaListings(apiSetId, displaySetCode);

    const apiSetIdLc = apiSetId.toLowerCase();
    const isSv = apiSetIdLc.startsWith('sv');

    // Torecacamp scraping is opt-in by mode (Shopify store; keep it gentle).
    // Modes:
    // - none: never scrape
    // - s12a: only scrape S12A
    // - all: scrape all sets
    const shouldScrapeTorecacamp =
      torecacampMode === 'all' ||
      (torecacampMode === 's12a' && apiSetIdLc === 's12a');

    const torecacampListings = shouldScrapeTorecacamp
      ? await scrapeTorecacampListings(apiSetId, displaySetCode)
      : [];

    // Toretoku scraping is opt-in by mode to avoid hammering the shop.
    // Modes:
    // - none: never scrape
    // - s12a: only scrape S12A
    // - sv: scrape all SV* sets + S12A
    // - all: scrape all sets
    // - cache: use cache only; never fetch (treat empty cache as valid)
    const shouldScrapeToretoku =
      toretokuMode === 'cache' ||
      toretokuMode === 'all' ||
      (toretokuMode === 'sv' && (isSv || apiSetIdLc === 's12a')) ||
      (toretokuMode === 's12a' && apiSetIdLc === 's12a');

    const toretokuListings = shouldScrapeToretoku
      ? await scrapeToretokuListings(apiSetId, displaySetCode, { maxPages: isSv ? 35 : 50, cacheOnly: toretokuMode === 'cache' })
      : [];

    const setCards = buildDatasetForSet({ apiSetId, displaySetCode, apiDump, jtListings, toretokuListings, torecacampListings });

    console.log(`🎯 ${displaySetCode}: kept ${setCards.length} cards (special rarities)`);
    allCards.push(...setCards);
  }

  const dataset = {
    meta: {
      sets: SETS.map((s) => s.toUpperCase()),
      rarities: Array.from(ALLOWED_RARITIES),
      qualities: Array.from(ALLOWED_QUALITIES),
      builtAt: new Date().toISOString(),
    },
    cards: allCards,
  };

  ensureDir(path.dirname(outputPath));

  if (MERGE && fs.existsSync(outputPath)) {
    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    } catch (err) {
      throw new Error(`--merge enabled but failed to parse existing ${path.relative(workspaceRoot, outputPath)}: ${err?.message || err}`);
    }

    if (!existing || !Array.isArray(existing.cards)) {
      throw new Error(`--merge enabled but existing ${path.relative(workspaceRoot, outputPath)} has unexpected structure (missing cards[])`);
    }

    const requestedSetIds = new Set(SETS.map((s) => s.toLowerCase()));
    const keptCards = existing.cards.filter((c) => !requestedSetIds.has(String(c?.setId || '').toLowerCase()));
    const mergedCards = [...keptCards, ...allCards];

    const existingSets = Array.isArray(existing?.meta?.sets) ? existing.meta.sets.map((s) => String(s).toUpperCase()) : [];
    const mergedSets = [...existingSets];
    for (const s of SETS.map((x) => x.toUpperCase())) {
      if (!mergedSets.includes(s)) mergedSets.push(s);
    }

    const mergedDataset = {
      meta: {
        sets: mergedSets,
        rarities: Array.from(ALLOWED_RARITIES),
        qualities: Array.from(ALLOWED_QUALITIES),
        builtAt: new Date().toISOString(),
      },
      cards: mergedCards,
    };

    fs.writeFileSync(outputPath, JSON.stringify(mergedDataset, null, 2));
    console.log(`\n✅ Merged into ${path.relative(workspaceRoot, outputPath)}: +${allCards.length} updated cards; total=${mergedCards.length}`);
  } else {
    fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2));
    console.log(`\n✅ Wrote ${path.relative(workspaceRoot, outputPath)} with ${allCards.length} cards total`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
