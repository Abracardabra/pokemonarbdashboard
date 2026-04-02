/**
 * Browserless.io API Client
 * Replaces Scrape.do for Cloudflare-protected sites
 * 
 * Features:
 * - /content endpoint for JS-rendered pages
 * - /unblock endpoint for Cloudflare bypass (Dorasuta, Cardrush)
 * - 1 credit per request
 * - Token-based authentication
 */

const TOKEN = process.env.BROWSERLESS_TOKEN;

if (!TOKEN) {
  console.warn('[Browserless] Warning: BROWSERLESS_TOKEN not set');
}

export interface BrowserlessConfig {
  /** Use /unblock endpoint for Cloudflare bypass (default: false) */
  unblock?: boolean;
  /** Wait until page is fully loaded */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
}

export interface BrowserlessResult {
  success: boolean;
  status: number;
  html: string;
  durationMs: number;
  isCloudflareChallenge: boolean;
  isBlocked: boolean;
  title: string | null;
  error?: string;
}

/**
 * Scrape a URL using Browserless /content endpoint
 * Standard headless browser rendering
 */
async function fetchContent(url: string, timeout: number): Promise<BrowserlessResult> {
  const endpoint = `https://production-sfo.browserless.io/content?token=${TOKEN}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 },
        bestAttempt: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        status: response.status,
        html: '',
        durationMs,
        isCloudflareChallenge: false,
        isBlocked: response.status === 403,
        title: null,
        error: `Browserless /content returned ${response.status}: ${errorText.substring(0, 200)}`,
      };
    }

    const html = await response.text();
    return analyzeResponse(html, response.status, durationMs);

  } catch (error) {
    const durationMs = Date.now() - start;
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
 * Scrape a URL using Browserless /unblock endpoint
 * Specifically designed to bypass Cloudflare Turnstile and bot detection
 */
async function fetchUnblock(url: string, timeout: number): Promise<BrowserlessResult> {
  const endpoint = `https://production-sfo.browserless.io/unblock?token=${TOKEN}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        browserWSEndpoint: false,  // Don't need WebSocket
        cookies: false,            // Don't need cookies returned
        content: true,           // Return page content
        screenshot: false,       // Don't capture screenshot
        ttl: 60000,              // Cache for 60 seconds
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        status: response.status,
        html: '',
        durationMs,
        isCloudflareChallenge: false,
        isBlocked: response.status === 403,
        title: null,
        error: `Browserless /unblock returned ${response.status}: ${errorText.substring(0, 200)}`,
      };
    }

    const result = await response.json();
    const html = result.content || '';
    return analyzeResponse(html, response.status, durationMs);

  } catch (error) {
    const durationMs = Date.now() - start;
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
 * Analyze HTML response for common indicators
 */
function analyzeResponse(html: string, status: number, durationMs: number): BrowserlessResult {
  // Detect Cloudflare challenge pages
  const isCloudflareChallenge =
    html.includes('cf-browser-verification') ||
    html.includes('challenges.cloudflare.com') ||
    html.includes('cf-im-under-attack') ||
    html.includes('Checking your browser') ||
    html.includes('Just a moment...');

  // Detect blocked/access denied pages
  const isBlocked =
    html.includes('Access denied') ||
    html.includes('403 Forbidden') ||
    html.includes('You have been blocked') ||
    html.includes('Please verify you are human') ||
    html.includes('Turnstile');

  // Extract page title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Consider it a success if we got substantial content and no challenges
  const success = !isCloudflareChallenge && !isBlocked && html.length > 1000;

  return {
    success,
    status,
    html,
    durationMs,
    isCloudflareChallenge,
    isBlocked,
    title,
  };
}

/**
 * Scrape a URL using Browserless API
 * Main entry point - routes to /content or /unblock based on config
 */
export async function browserless(
  targetUrl: string,
  config: BrowserlessConfig = {}
): Promise<BrowserlessResult> {
  if (!TOKEN) {
    return {
      success: false,
      status: 0,
      html: '',
      durationMs: 0,
      isCloudflareChallenge: false,
      isBlocked: false,
      title: null,
      error: 'BROWSERLESS_TOKEN not configured',
    };
  }

  const { unblock = false, timeout = 120000 } = config;

  if (unblock) {
    return fetchUnblock(targetUrl, timeout);
  } else {
    return fetchContent(targetUrl, timeout);
  }
}

/**
 * Direct fetch for sites that don't need browser automation
 * (Japan-Toreca, TorecaCamp, Hobibinet, Playze, C-Labo, Fukufuku)
 */
export async function directFetch(url: string, timeout: number = 30000): Promise<BrowserlessResult> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - start;

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        html: '',
        durationMs,
        isCloudflareChallenge: false,
        isBlocked: response.status === 403 || response.status === 429,
        title: null,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    return analyzeResponse(html, response.status, durationMs);

  } catch (error) {
    const durationMs = Date.now() - start;
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
