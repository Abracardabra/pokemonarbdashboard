/**
 * Dorasuta Scraping Strategy
 * Uses set-based browsing via Browserless /function endpoint
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
 * Scrape Dorasuta using set-based browsing
 */
export async function scrapeDorasutaCard(
  setCode: string,
  cardNumber: string,
  cardName: string
): Promise<DorasutaProduct | null> {
  const sid = DORASUTA_SET_IDS[setCode.toUpperCase()];
  
  if (!sid) {
    console.warn(`[Dorasuta] Unknown set code: ${setCode}`);
    return null;
  }

  const url = `https://dorasuta.jp/pokemon-card/product-list?sid=${sid}`;
  
  try {
    // Use Browserless /function to wait for AJAX content
    const code = `
      export default async function ({ page }) {
        await page.goto('${url}', { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        // Wait for initial products
        await new Promise(r => setTimeout(r, 3000));
        
        // Scroll to trigger lazy loading
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        
        // Wait for more products
        await new Promise(r => setTimeout(r, 3000));
        
        const html = await page.content();
        return { html, url: page.url() };
      }
    `;
    
    const result = await browserlessFunction(code);
    
    if (!result) {
      console.warn('[Dorasuta] Function returned null');
      return null;
    }
    
    return parseDorasutaProducts(result.html, cardNumber, cardName, sid);
    
  } catch (error) {
    console.error('[Dorasuta] Scraping failed:', error);
    return null;
  }
}

/**
 * Parse products from Dorasuta HTML
 */
function parseDorasutaProducts(
  html: string, 
  cardNumber: string,
  cardName: string,
  sid: string
): DorasutaProduct | null {
  // Look for product name + price patterns
  const nameMatches = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/gi)];
  const priceMatches = [...html.matchAll(/(\d{1,3}(?:,\d{3})*)円/g)];
  
  for (let i = 0; i < nameMatches.length; i++) {
    const name = nameMatches[i][1].trim();
    
    // Match by card number in name
    if (name.includes(cardNumber) || name.includes(cardName.replace(' ', ''))) {
      const price = priceMatches[i] ? parseInt(priceMatches[i][1].replace(',', '')) : 0;
      
      // Determine condition from name
      let condition: 'A-' | 'B' | 'Unknown' = 'Unknown';
      if (name.includes('A') || name.includes('美品')) condition = 'A-';
      else if (name.includes('B') || name.includes('並品')) condition = 'B';
      
      // Check stock
      const inStock = !name.includes('売切') && !name.includes('Sold Out');
      
      return {
        name,
        priceJPY: price,
        condition,
        inStock,
        url: `https://dorasuta.jp/pokemon-card/product-list?sid=${sid}`,
      };
    }
  }
  
  return null;
}
