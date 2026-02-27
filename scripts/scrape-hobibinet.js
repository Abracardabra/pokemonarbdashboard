#!/usr/bin/env node
/**
 * Scrape Hobibinet (hobibinet-pokemon.com) - Shopify JSON data
 * Embedded in meta variable: meta.products
 * Title format: 【状態{X}】{name}[{num}/{total}][{rarity}][{set}]
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_RARITIES = new Set(['AR', 'SAR', 'SR', 'CHR', 'UR', 'SSR', 'RRR']);
const ALLOWED_QUALITIES = new Set(['A-', 'B']);

const WORKSPACE_ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(WORKSPACE_ROOT, 'data', 'cache');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url, options = {}) {
  const { timeoutMs = 20000, maxRetries = 3, retryBackoffMs = 3000, rateLimitMs = 800 } = options;
  let attempt = 0;
  while (true) {
    attempt++;
    await delay(rateLimitMs);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja-JP',
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      console.warn(`  Retry ${attempt}/${maxRetries}: ${err.message}`);
      await delay(retryBackoffMs * attempt);
    } finally {
      clearTimeout(t);
    }
  }
}

function parseProductName(name) {
  // Pattern: 【状態X】name[num/total][rarity][set] or 【状態X】name[num/total][-][set]
  const match = name.match(/【状態\s*([^】]+)】\s*([^\[]+)\[(\d+)\s*[\/\\]\s*(\d+)\]\s*\[([^\]]*)\]\s*\[([^\]]+)\]/);
  if (!match) return null;
  
  const [, conditionRaw, nameRaw, num, total, rarityRaw, set] = match;
  const condition = conditionRaw.trim().toUpperCase().replace('－', '-').replace('‒', '-');
  const nameJP = nameRaw.trim();
  const rarity = rarityRaw.trim().toUpperCase();
  
  if (!ALLOWED_QUALITIES.has(condition)) return null;
  if (!ALLOWED_RARITIES.has(rarity) && rarity !== '-') return null;
  
  return {
    condition,
    nameJP,
    cardNumber: `${num}/${total}`,
    rarity: rarity === '-' ? 'AR' : rarity, // AR仕様 cards have [-] rarity
    setCode: set.toUpperCase(),
  };
}

async function scrapeHobibinetListings(setCode, { force = false, verbose = false } = {}) {
  ensureDir(CACHE_DIR);
  const cachePath = path.join(CACHE_DIR, `hobibinet-${setCode.toLowerCase()}-listings.json`);
  
  if (!force && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Array.isArray(cached) && cached.length) {
      console.log(`📦 Using cached Hobibinet: ${cached.length} listings`);
      return cached;
    }
  }
  
  console.log(`🛒 Scraping Hobibinet for ${setCode.toUpperCase()}`);
  const all = [];
  const seen = new Set();
  
  for (const rarity of ALLOWED_RARITIES) {
    const searchQuery = `${setCode.toUpperCase()}+${rarity}`;
    const url = `https://hobibinet-pokemon.com/search?type=product&q=${encodeURIComponent(searchQuery)}`;
    
    if (verbose) console.log(`  🔍 ${rarity}: ${url}`);
    
    let html;
    try {
      html = await fetchHtml(url, { rateLimitMs: 1200 });
    } catch (err) {
      console.warn(`  ⚠ Failed ${rarity}: ${err.message}`);
      continue;
    }
    
    // Extract meta.products JSON
    const metaMatch = html.match(/var\s+meta\s*=\s*({[^;]+});/);
    if (!metaMatch) {
      if (verbose) console.log(`  ⚠ No meta.products found`);
      continue;
    }
    
    let products;
    try {
      const meta = JSON.parse(metaMatch[1]);
      products = meta.products || [];
    } catch (e) {
      if (verbose) console.log(`  ⚠ JSON parse error`);
      continue;
    }
    
    if (verbose) console.log(`  📄 ${rarity}: ${products.length} products`);
    
    for (const product of products) {
      // Skip products not matching set
      const productTitle = product.variants?.[0]?.name || '';
      if (!productTitle.includes(`[${setCode.toUpperCase()}]`)) continue;
      
      // Parse the variant name
      const parse = parseProductName(productTitle);
      if (!parse) continue;
      
      // Verify condition is A- or B
      if (!ALLOWED_QUALITIES.has(parse.condition)) continue;
      
      const variant = product.variants?.[0];
      if (!variant) continue;
      
      const priceCents = variant.price;
      const priceJPY = priceCents / 100; // Shopify stores prices in cents
      
      const idKey = `${parse.setCode}-${parse.cardNumber}-${parse.rarity}-${parse.condition}`;
      if (seen.has(idKey)) continue;
      
      all.push({
        set: parse.setCode,
        rarity: parse.rarity,
        cardNumber: parse.cardNumber,
        nameJP: parse.nameJP,
        quality: parse.condition,
        priceJPY: Math.round(priceJPY),
        url: `https://hobibinet-pokemon.com/products/${product.handle}`,
        inStock: true,
        _debug: { cents: priceCents, id: variant.id },
      });
      
      seen.add(idKey);
    }
    
    await delay(1000);
  }
  
  fs.writeFileSync(cachePath, JSON.stringify(all, null, 2));
  console.log(`💾 Wrote Hobibinet cache: ${cachePath} (${all.length} listings)`);
  
  // Show summary
  const aMinus = all.filter(l => l.quality === 'A-').length;
  const b = all.filter(l => l.quality === 'B').length;
  console.log(`  📊 A-: ${aMinus}, B: ${b}`);
  
  return all;
}

// CLI
async function main() {
  const setCode = process.argv[2];
  if (!setCode) {
    console.log('Usage: node scrape-hobibinet.js <setCode> [--force] [--verbose]');
    process.exit(1);
  }
  
  const force = process.argv.includes('--force');
  const verbose = process.argv.includes('--verbose');
  const listings = await scrapeHobibinetListings(setCode, { force, verbose });
  
  console.log(`\nFound ${listings.length} listings for ${setCode.toUpperCase()}`);
  
  if (listings.length > 0) {
    console.log('\nSample:');
    listings.slice(0, 5).forEach(l => {
      console.log(`  ${l.quality} | ${l.rarity} | ${l.nameJP.padEnd(12)} | ¥${l.priceJPY.toLocaleString()}`);
    });
  }
}

module.exports = { scrapeHobibinetListings, parseProductName };

if (require.main === module) {
  main().catch(console.error);
}