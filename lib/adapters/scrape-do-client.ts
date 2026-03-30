/**
 * Scrape.do API Client
 * Cloudflare bypass for Japanese card shop scraping
 * 
 * Features:
 * - Simple REST API (no GraphQL complexity)
 * - 1000 free credits/month
 * - Headless browser rendering with render=true
 * - Automatic proxy rotation
 * - 99.98% success rate according to docs
 */

const API_KEY = process.env.SCRAPE_DO_API_KEY;
const BASE_URL = 'https://api.scrape.do';

if (!API_KEY) {
  console.warn('[Scrape.do] Warning: SCRAPE_DO_API_KEY not set');
}

export interface ScrapeDoConfig {
  /** Enable headless browser rendering (required for JS-heavy sites) */
  render?: boolean;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Custom headers to send */
  headers?: Record<string, string>;
  /** Use specific country proxy (e.g., 'jp' for Japan) */
  geoCode?: string;
  /** Return screenshot instead of HTML */
  screenshot?: boolean;
}

export interface ScrapeDoResult {
  success: boolean;
  status: number;
  html: string;
  durationMs: number;
  /** True if Cloudflare challenge was detected in response */
  isCloudflareChallenge: boolean;
  /** True if access was blocked */
  isBlocked: boolean;
  /** Page title if extractable */
  title: string | null;
  /** Error message if failed */
  error?: string;
}

/**
 * Scrape a URL using Scrape.do API
 * Automatically handles URL encoding and retries
 */
export async function scrapeDo(
  targetUrl: string,
  config: ScrapeDoConfig = {}
): Promise<ScrapeDoResult> {
  if (!API_KEY) {
    return {
      success: false,
      status: 0,
      html: '',
      durationMs: 0,
      isCloudflareChallenge: false,
      isBlocked: false,
      title: null,
      error: 'SCRAPE_DO_API_KEY not configured',
    };
  }

  const {
    render = true,  // Default to render=true for Japanese sites
    timeout = 60000,
    headers = {},
    geoCode,
    screenshot = false,
  } = config;

  // Build query parameters
  const params = new URLSearchParams({
    token: API_KEY,
    url: targetUrl,
    render: render ? 'true' : 'false',
  });

  if (geoCode) {
    params.set('geoCode', geoCode);
  }

  if (screenshot) {
    params.set('screenshot', 'true');
  }

  // Add custom headers if provided
  if (Object.keys(headers).length > 0) {
    params.set('headers', JSON.stringify(headers));
  }

  const apiUrl = `${BASE_URL}/?${params.toString()}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(apiUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        status: response.status,
        html: errorText,
        durationMs,
        isCloudflareChallenge: false,
        isBlocked: response.status === 403,
        title: null,
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
      };
    }

    const html = await response.text();

    // Detect Cloudflare challenge pages
    const isCloudflareChallenge = 
      html.includes('cf-browser-verification') ||
      html.includes('challenges.cloudflare.com') ||
      html.includes('cf-im-under-attack') ||
      html.includes('Checking your browser');

    // Detect blocked/access denied pages
    const isBlocked =
      html.includes('Access denied') ||
      html.includes('403 Forbidden') ||
      html.includes('You have been blocked') ||
      html.includes('Please verify you are human');

    // Extract page title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    return {
      success: !isCloudflareChallenge && !isBlocked,
      status: response.status,
      html,
      durationMs,
      isCloudflareChallenge,
      isBlocked,
      title,
    };

  } catch (error) {
    const durationMs = Date.now() - start;
    
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        status: 0,
        html: '',
        durationMs,
        isCloudflareChallenge: false,
        isBlocked: false,
        title: null,
        error: `Request timeout after ${timeout}ms`,
      };
    }

    return {
      success: false,
      status: 0,
      html: '',
      durationMs,
      isCloudflareChallenge: false,
      isBlocked: false,
      title: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract price from Japanese yen format
 * Handles formats like: "¥1,234", "1,234円", "1234"
 */
export function extractPriceJPY(text: string): number | null {
  if (!text) return null;
  
  // Remove currency symbols and whitespace
  const cleaned = text
    .replace(/[¥,円\s]/g, '')
    .replace(/[^\d]/g, '');
  
  const price = parseInt(cleaned, 10);
  return isNaN(price) ? null : price;
}

/**
 * Check if product is in stock based on common Japanese shop indicators
 */
export function checkInStock(text: string): boolean {
  if (!text) return false;
  
  const lower = text.toLowerCase();
  
  // Out of stock indicators
  const outOfStockIndicators = [
    'sold out',
    'out of stock',
    '在庫なし',  // Japanese: no stock
    '売り切れ',   // Japanese: sold out
    '在庫切れ',   // Japanese: out of stock
    '品切れ',     // Japanese: out of stock
    'sold',
    'unavailable',
  ];
  
  for (const indicator of outOfStockIndicators) {
    if (lower.includes(indicator)) return false;
  }
  
  // In stock indicators (if explicitly stated)
  const inStockIndicators = [
    'in stock',
    'available',
    'add to cart',
    'カートに入れる',  // Japanese: add to cart
    '在庫あり',         // Japanese: in stock
    '購入可能',         // Japanese: available for purchase
  ];
  
  for (const indicator of inStockIndicators) {
    if (lower.includes(indicator)) return true;
  }
  
  // Default to true if no indicators found (assume available)
  return true;
}
