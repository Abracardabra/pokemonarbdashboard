/**
 * Toretoku Scraping Strategy
 * Uses Browserless /function endpoint with wait for JS rendering
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ToretokuPrice {
  a: number | null;
  b: number | null;
  stockA: number;
  stockB: number;
  url: string;
}

// Cache for detail ID mappings
let detailIdCache: Map<string, string> | null = null;

/**
 * Extract Toretoku detail IDs from existing prices.json data
 */
export function extractToretokuDetailIds(): Map<string, string> {
  if (detailIdCache) return detailIdCache;

  const idMap = new Map<string, string>();
  
  try {
    const pricesPath = path.join(process.cwd(), 'data', 'prices.json');
    if (!fs.existsSync(pricesPath)) {
      console.warn('[Toretoku] prices.json not found');
      return idMap;
    }

    const data = JSON.parse(fs.readFileSync(pricesPath, 'utf-8'));
    
    if (!data.cards || !Array.isArray(data.cards)) {
      return idMap;
    }

    for (const card of data.cards) {
      const key = `${card.setId}:${card.number}`;
      
      // Extract detail ID from toretoku URL
      if (card.toretoku) {
        const url = card.toretoku.b?.url || card.toretoku.a?.url;
        
        if (url) {
          const match = url.match(/\/item\/details\/(\d+)/);
          if (match) {
            idMap.set(key, match[1]);
          }
        }
      }
    }

    console.log(`[Toretoku] Loaded ${idMap.size} detail IDs`);
    detailIdCache = idMap;
    return idMap;
    
  } catch (error) {
    console.error('[Toretoku] Failed to extract detail IDs:', error);
    return idMap;
  }
}

/**
 * Execute Browserless function with Puppeteer
 */
async function browserlessFunction(code: string): Promise<{ html: string; url: string } | null> {
  const TOKEN = process.env.BROWSERLESS_TOKEN;
  if (!TOKEN) {
    console.warn('[Browserless] Token not configured');
    return null;
  }

  const endpoint = `https://production-sfo.browserless.io/function?token=${TOKEN}`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: {} }),
    });

    if (!response.ok) {
      console.warn('[Browserless] Function error:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[Browserless] Request failed:', error);
    return null;
  }
}

/**
 * Scrape Toretoku product detail page using /function with wait
 */
export async function scrapeToretokuDetail(detailId: string): Promise<ToretokuPrice | null> {
  const url = `https://www.toretoku.jp/item/details/${detailId}`;
  
  try {
    // Use Browserless /function endpoint with wait for JS
    const code = `
      export default async function ({ page }) {
        await page.goto('${url}', { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        // Wait for React/JS to render
        await new Promise(r => setTimeout(r, 5000));
        
        // Try to wait for price elements
        try {
          await page.waitForSelector('[class*="price"], [class*="円"], .price, .amount', { timeout: 5000 });
        } catch (e) {
          // Continue even if selector not found
        }
        
        const html = await page.content();
        return { html, url: page.url() };
      }
    `;
    
    const result = await browserlessFunction(code);
    
    if (!result) {
      console.warn(`[Toretoku] Function returned null for ${detailId}`);
      return null;
    }

    return parseToretokuDetailPage(result.html, url);
    
  } catch (error) {
    console.error(`[Toretoku] Error scraping ${detailId}:`, error);
    return null;
  }
}

/**
 * Parse prices from Toretoku detail page HTML
 */
function parseToretokuDetailPage(html: string, url: string): ToretokuPrice | null {
  const price: ToretokuPrice = {
    a: null,
    b: null,
    stockA: 0,
    stockB: 0,
    url,
  };

  try {
    // Find all prices in the page (format: X,XXX円 or XXX円)
    const allPrices = [...html.matchAll(/(\d{1,3}(?:,\d{3})*)\s*円/g)];
    const uniquePrices = [...new Set(allPrices.map(m => parseInt(m[1].replace(',', ''))))].sort((a, b) => a - b);
    
    console.log(`[Toretoku] Found ${uniquePrices.length} unique prices: ${uniquePrices.join(', ')}`);

    // Look for condition indicators in the HTML
    const hasACondition = html.includes('"A"') || html.includes('>A<') || html.includes('美品');
    const hasBCondition = html.includes('"B"') || html.includes('>B<') || html.includes('並品');
    
    // Check stock indicators
    const inStockIndicators = ['在庫あり', '購入可能', 'カートに入れる', 'add to cart', '追加'];
    const outStockIndicators = ['売り切れ', '在庫なし', 'sold out', '品切れ'];
    
    const hasInStock = inStockIndicators.some(ind => html.includes(ind));
    const hasOutStock = outStockIndicators.some(ind => html.includes(ind));

    if (uniquePrices.length >= 2 && hasACondition && hasBCondition) {
      // Assume lower price is B, higher is A (or vice versa depending on site structure)
      price.a = uniquePrices[uniquePrices.length - 1]; // Higher price = A (better condition)
      price.b = uniquePrices[0]; // Lower price = B
      price.stockA = hasInStock ? 1 : 0;
      price.stockB = hasInStock ? 1 : 0;
    } else if (uniquePrices.length === 1) {
      // Single price - assign to B (more common)
      price.b = uniquePrices[0];
      price.stockB = hasInStock ? 1 : 0;
    } else if (uniquePrices.length > 0) {
      // Multiple prices but no clear condition indicators - use first two
      price.a = uniquePrices[0];
      price.b = uniquePrices[1] || null;
      price.stockA = hasInStock ? 1 : 0;
      price.stockB = hasInStock ? 1 : 0;
    }

    return price;
    
  } catch (error) {
    console.error('[Toretoku] Parse error:', error);
    return null;
  }
}

/**
 * Scrape a specific card from Toretoku
 */
export async function scrapeToretokuCard(
  setId: string,
  cardNumber: string
): Promise<ToretokuPrice | null> {
  const idMap = extractToretokuDetailIds();
  const key = `${setId}:${cardNumber}`;
  const detailId = idMap.get(key) || idMap.get(`${setId}-${cardNumber}`);
  
  if (!detailId) {
    console.log(`[Toretoku] No detail ID for ${key}`);
    return null;
  }

  return await scrapeToretokuDetail(detailId);
}

/**
 * Clear the detail ID cache
 */
export function clearToretokuCache(): void {
  detailIdCache = null;
}
