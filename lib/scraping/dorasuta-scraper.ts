/**
 * Dorasuta Scraping Strategy
 * Uses keyword search via Browserless /unblock endpoint
 */

// Known Dorasuta set IDs for set-based browsing
export const DORASUTA_SET_IDS: Record<string, string> = {
  'SV3': '7127',    // 黒炎の支配者
  'SV2A': '6993',   // 151
  'S12A': '6203',   // VSTAR Universe
};

export interface DorasutaProduct {
  name: string;
  priceJPY: number;
  condition: 'A-' | 'B' | 'Unknown';
  inStock: boolean;
  url: string;
}

/**
 * Fetch a rendered page via Browserless /unblock
 */
async function browserlessUnblock(url: string): Promise<{ html: string; url: string } | null> {
  const TOKEN = process.env.BROWSERLESS_TOKEN;
  if (!TOKEN) {
    console.warn('[Browserless] Token not configured');
    return null;
  }

  const endpoint = `https://production-sfo.browserless.io/unblock?token=${TOKEN}`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      console.warn('[Browserless] Unblock error:', response.status);
      return null;
    }
    const data = await response.json();
    const html = data?.content || data?.html || '';
    return { html, url };
  } catch (error) {
    console.error('[Browserless] Request failed:', error);
    return null;
  }
}

/**
 * Scrape Dorasuta using set-based browsing
 */
export async function scrapeDorasutaCard(
  setCode: string,
  cardNumber: string,
  cardName: string
): Promise<DorasutaProduct | null> {
  const sid = DORASUTA_SET_IDS[setCode.toUpperCase()] || null;
  const normalizedNumber = cardNumber.replace(/^0+/, '');
  const kwUrl = `https://dorasuta.jp/pokemon-card/product-list?kw=${encodeURIComponent(cardNumber)}`;
  const sidUrl = sid ? `https://dorasuta.jp/pokemon-card/product-list?sid=${sid}&kw=${encodeURIComponent(cardNumber)}` : null;
  
  try {
    // 1) Try direct keyword search by card number.
    const kwResult = await browserlessUnblock(kwUrl);
    if (kwResult?.html) {
      const parsed = parseDorasutaProducts(kwResult.html, cardNumber, cardName, normalizedNumber, kwUrl);
      if (parsed) return parsed;
    }

    // 2) Fallback: set-constrained search when SID is known.
    if (sidUrl) {
      const sidResult = await browserlessUnblock(sidUrl);
      if (sidResult?.html) {
        const parsed = parseDorasutaProducts(sidResult.html, cardNumber, cardName, normalizedNumber, sidUrl);
        if (parsed) return parsed;
      }
    }
    
  } catch (error) {
    console.error('[Dorasuta] Scraping failed:', error);
  }
  return null;
}

/**
 * Parse products from Dorasuta HTML
 */
function parseDorasutaProducts(
  html: string, 
  cardNumber: string,
  cardName: string,
  normalizedNumber: string,
  pageUrl: string
): DorasutaProduct | null {
  // Parse listing blocks that include product URL + title + price.
  const blocks = [...html.matchAll(
    /<a href="(\/pokemon-card\/product\?pid=\d+)">[\s\S]*?<a href="\/pokemon-card\/product\?pid=\d+">[\s\S]*?([\s\S]*?)<\/a>[\s\S]*?<li>([\d,]+)円<\/li>/g
  )];

  for (const m of blocks) {
    const relUrl = m[1];
    const rawName = m[2].replace(/<[^>]+>/g, '').trim();
    const price = parseInt(m[3].replace(/,/g, ''), 10);
    if (!Number.isFinite(price) || price <= 0) continue;

    const nameNorm = rawName.replace(/\s+/g, '');
    const numNoLeading = cardNumber.replace(/^0+/, '');
    const hasNumber =
      nameNorm.includes(cardNumber) ||
      nameNorm.includes(normalizedNumber) ||
      nameNorm.includes(numNoLeading);
    const hasCardName = cardName ? nameNorm.includes(cardName.replace(/\s+/g, '')) : false;
    if (!hasNumber && !hasCardName) continue;

    const condition: 'A-' | 'B' | 'Unknown' =
      rawName.includes('プレイ用') || rawName.includes('並品') ? 'B' : 'A-';
    const inStock = !rawName.includes('売り切れ') && !rawName.includes('売切');

    return {
      name: rawName,
      priceJPY: price,
      condition,
      inStock,
      url: `https://dorasuta.jp${relUrl}`,
    };
  }

  // Fallback: no precise hit
  console.warn('[Dorasuta] No matching listing found for', { cardNumber, pageUrl });
  return null;
}
