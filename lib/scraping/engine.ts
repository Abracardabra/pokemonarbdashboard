/**
 * Simplified Scraping Engine
 * 
 * Strategy:
 * - Use Scrape.do for ALL providers (simple, consistent)
 * - 1 credit per scrape
 * - Provider-specific parsing via configs
 */

import * as cheerio from 'cheerio';
import {
  ScrapedOffer,
  ScrapeCardInput,
  ScrapeResult,
  Provider,
} from './types';
import {
  getProviderConfig,
  extractPriceJPY,
  detectStock,
  detectQuality,
} from './providers';

const API_KEY = process.env.SCRAPE_DO_API_KEY;

if (!API_KEY) {
  console.warn('[Scraping Engine] Warning: SCRAPE_DO_API_KEY not set');
}

/**
 * Scrape a URL using Scrape.do
 * Returns HTML content
 */
async function scrapeWithScrapeDo(url: string): Promise<{
  html: string;
  status: number;
  success: boolean;
  error?: string;
}> {
  if (!API_KEY) {
    return { html: '', status: 0, success: false, error: 'SCRAPE_DO_API_KEY not configured' };
  }

  const encodedUrl = encodeURIComponent(url);
  const apiUrl = `https://api.scrape.do/?token=${API_KEY}&url=${encodedUrl}&render=true&geoCode=jp`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(apiUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        html: '',
        status: response.status,
        success: false,
        error: `Scrape.do returned ${response.status}`,
      };
    }

    const html = await response.text();

    // Check for Cloudflare challenge in response
    if (html.includes('cf-browser-verification') ||
        html.includes('challenges.cloudflare.com') ||
        html.includes('Checking your browser')) {
      return {
        html,
        status: response.status,
        success: false,
        error: 'Cloudflare challenge detected even with Scrape.do',
      };
    }

    return { html, status: response.status, success: true };
  } catch (error) {
    return {
      html: '',
      status: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Parse HTML into a scraped offer
 */
function parseOffer(
  html: string,
  provider: string,
  url: string,
  expectedCondition: 'A-' | 'B'
): Omit<ScrapedOffer, 'cardId' | 'scrapedAt'> | null {
  const config = getProviderConfig(provider);
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const $ = cheerio.load(html);

  // Extract price
  const priceText = $(config.selectors.price).first().text().trim();
  const priceJPY = config.extractPrice
    ? config.extractPrice(priceText)
    : extractPriceJPY(priceText);

  if (!priceJPY) {
    return null;
  }

  // Extract stock status
  const stockText = $(config.selectors.stock).first().text().trim();
  const inStock = detectStock(stockText, config.stockIndicators);

  // Detect quality from page
  const htmlText = $.text();
  const detectedQuality = detectQuality(htmlText, config.qualityPatterns);
  const condition = detectedQuality || expectedCondition;

  // Extract title
  const title = $(config.selectors.title).first().text().trim();

  return {
    provider: provider as Provider,
    condition,
    priceJPY,
    inStock,
    url,
    title,
  };
}

/**
 * Scrape a card from a provider
 * 
 * This is the main entry point - simple and consistent for all providers
 */
export async function scrapeCard(
  input: ScrapeCardInput
): Promise<ScrapeResult> {
  const { cardId, urls } = input;
  const startTime = Date.now();

  const offers: ScrapedOffer[] = [];
  const errors: string[] = [];
  let creditsUsed = 0;

  for (const { url, expectedCondition } of urls) {
    // Determine provider from URL
    const provider = detectProviderFromUrl(url);
    if (!provider) {
      errors.push(`Could not detect provider from URL: ${url}`);
      continue;
    }

    // Scrape via Scrape.do (1 credit)
    const scrapeResult = await scrapeWithScrapeDo(url);
    creditsUsed++;

    if (!scrapeResult.success) {
      errors.push(`${provider}: ${scrapeResult.error || 'Failed to scrape'}`);
      continue;
    }

    // Parse the HTML
    try {
      const parsed = parseOffer(
        scrapeResult.html,
        provider,
        url,
        expectedCondition
      );

      if (parsed) {
        offers.push({
          cardId,
          ...parsed,
          scrapedAt: new Date(),
        });
      } else {
        errors.push(`${provider}: Could not extract price from page`);
      }
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : 'Parse error'}`);
    }
  }

  return {
    offers,
    errors,
    metrics: {
      creditsUsed,
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * Detect provider from URL
 */
function detectProviderFromUrl(url: string): string | null {
  const domain = new URL(url).hostname;

  if (domain.includes('japan-toreca.com')) return 'japan-toreca';
  if (domain.includes('dorasuta.jp')) return 'dorasuta';
  if (domain.includes('toretoku.jp')) return 'toretoku';
  if (domain.includes('torecacamp')) return 'torecacamp';
  if (domain.includes('hobibinet.com')) return 'hobibinet';

  return null;
}

/**
 * Batch scrape multiple cards
 */
export async function scrapeBatch(
  inputs: ScrapeCardInput[],
  options: { delayMs?: number } = {}
): Promise<{ results: ScrapeResult[]; totalCredits: number; totalDuration: number }> {
  const { delayMs = 2000 } = options;

  const results: ScrapeResult[] = [];
  let totalCredits = 0;
  const batchStart = Date.now();

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const result = await scrapeCard(input);

    results.push(result);
    totalCredits += result.metrics.creditsUsed;

    // Delay between cards (unless last one)
    if (i < inputs.length - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    results,
    totalCredits,
    totalDuration: Date.now() - batchStart,
  };
}

/**
 * Log scrape metrics
 */
export function logScrapeMetrics(
  cardId: string,
  result: ScrapeResult
): void {
  console.log('[Scrape]', {
    cardId,
    offersFound: result.offers.length,
    errors: result.errors.length,
    creditsUsed: result.metrics.creditsUsed,
    durationMs: result.metrics.durationMs,
    timestamp: new Date().toISOString(),
  });
}
