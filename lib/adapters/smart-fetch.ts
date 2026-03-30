/**
 * Cost-Optimized Smart Fetch
 * 
 * Strategy:
 * 1. Try direct fetch first (FREE)
 * 2. If Cloudflare blocked (403/Challenge page) → Use Scrape.do
 * 
 * This minimizes Scrape.do costs since many sites work without it
 */

import { scrapeDo } from './scrape-do-client';

export interface SmartFetchResult {
  success: boolean;
  html: string;
  status: number;
  durationMs: number;
  method: 'direct' | 'scrape-do';
  scrapeDoCost?: number;  // Credits used (1 for Scrape.do, 0 for direct)
  error?: string;
}

// Detection patterns for Cloudflare challenge pages
const CLOUDFLARE_PATTERNS = [
  'cf-browser-verification',
  'challenges.cloudflare.com',
  'cf-im-under-attack',
  'Checking your browser',
  'Please wait while we check your browser',
  'DDoS protection by Cloudflare',
];

/**
 * Check if response is a Cloudflare challenge page
 */
function isCloudflareChallenge(html: string): boolean {
  const lowerHtml = html.toLowerCase();
  return CLOUDFLARE_PATTERNS.some(pattern => 
    lowerHtml.includes(pattern.toLowerCase())
  );
}

/**
 * Check if response indicates blocking
 */
function isBlockedResponse(status: number, html: string): boolean {
  if (status === 403) return true;
  if (status === 503 && html.includes('cloudflare')) return true;
  return isCloudflareChallenge(html);
}

/**
 * Smart fetch - tries direct first, falls back to Scrape.do
 * 
 * @param url - Target URL to fetch
 * @param options - Configuration options
 * @returns Fetch result with method tracking
 * 
 * @example
 * const result = await smartFetch('https://example.com/product');
 * if (result.success) {
 *   console.log(`Fetched via ${result.method}, cost: ${result.scrapeDoCost} credits`);
 * }
 */
export async function smartFetch(
  url: string,
  options: {
    timeout?: number;
    geoCode?: string;
    render?: boolean;
  } = {}
): Promise<SmartFetchResult> {
  const { timeout = 15000, geoCode = 'jp', render = true } = options;
  const start = Date.now();

  // Step 1: Try direct fetch (FREE)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const html = await response.text();
    const durationMs = Date.now() - start;

    // Check if we got blocked
    if (isBlockedResponse(response.status, html)) {
      console.log(`[SmartFetch] Direct fetch blocked (status: ${response.status}), falling back to Scrape.do...`);
      // Fall through to Scrape.do
    } else {
      // Success with direct fetch!
      return {
        success: true,
        html,
        status: response.status,
        durationMs,
        method: 'direct',
        scrapeDoCost: 0,
      };
    }
  } catch (error) {
    const durationMs = Date.now() - start;
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('[SmartFetch] Direct fetch timeout, falling back to Scrape.do...');
    } else {
      console.log('[SmartFetch] Direct fetch error:', error instanceof Error ? error.message : 'Unknown', '- trying Scrape.do...');
    }
    // Fall through to Scrape.do
  }

  // Step 2: Use Scrape.do (COST: 1 credit)
  const scrapeDoStart = Date.now();
  
  try {
    const result = await scrapeDo(url, {
      render,
      timeout: 60000,  // Longer timeout for headless
      geoCode,
    });

    const durationMs = Date.now() - scrapeDoStart;

    return {
      success: result.success && !result.isCloudflareChallenge,
      html: result.html,
      status: result.status,
      durationMs: Date.now() - start,  // Total time including direct attempt
      method: 'scrape-do',
      scrapeDoCost: 1,
      error: result.isCloudflareChallenge ? 'Cloudflare challenge even with Scrape.do' : result.error,
    };
  } catch (error) {
    return {
      success: false,
      html: '',
      status: 0,
      durationMs: Date.now() - start,
      method: 'scrape-do',
      scrapeDoCost: 1,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch fetch with cost tracking
 */
export async function smartFetchBatch(
  urls: string[],
  options: {
    delayMs?: number;
    timeout?: number;
    geoCode?: string;
  } = {}
): Promise<{ results: SmartFetchResult[]; totalCost: number; costSavings: number }> {
  const { delayMs = 1000 } = options;
  
  const results: SmartFetchResult[] = [];
  let totalCost = 0;
  let costSavings = 0;

  for (const url of urls) {
    const result = await smartFetch(url, options);
    results.push(result);
    
    if (result.method === 'scrape-do') {
      totalCost += 1;
    } else {
      costSavings += 1;  // Would have cost 1 if we used Scrape.do directly
    }

    // Delay between requests
    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return { results, totalCost, costSavings };
}
