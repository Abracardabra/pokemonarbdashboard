/**
 * Unified Provider Scraper using Scrape.do
 * All Japanese card shop providers route through Scrape.do for Cloudflare bypass
 */

import { scrapeDo, ScrapeDoConfig } from './scrape-do-client';
import { parseProviderHtml, ParsedOffer, extractAllOffers } from './scrape-do-queries';
import { prisma } from '@/lib/prisma';

export interface ScrapeResult extends ParsedOffer {
  provider: string;
  success: boolean;
  cloudflareDetected: boolean;
  durationMs: number;
}

export interface ScrapeCardRequest {
  cardId: string;
  url: string;
  provider: string;
  expectedCondition: 'A-' | 'B';
}

/**
 * Scrape a single provider URL for card data
 */
export async function scrapeProvider(
  request: ScrapeCardRequest,
  config: ScrapeDoConfig = {}
): Promise<ScrapeResult> {
  const { cardId, url, provider, expectedCondition } = request;

  const start = Date.now();
  
  try {
    // Use Scrape.do to fetch the page
    const result = await scrapeDo(url, {
      render: true,  // Required for JavaScript-heavy Japanese sites
      timeout: 60000,  // 60 second timeout for headless rendering
      geoCode: 'jp',   // Use Japan proxy for better performance
      ...config,
    });

    const durationMs = Date.now() - start;

    // Parse the HTML
    const parsed = parseProviderHtml(provider, result, expectedCondition, url);

    const scrapeResult: ScrapeResult = {
      ...parsed,
      provider,
      success: result.success && !!parsed.priceJPY,
      cloudflareDetected: result.isCloudflareChallenge,
      durationMs,
    };

    // Persist to database if successful
    if (scrapeResult.success && parsed.priceJPY) {
      await persistOffer(cardId, provider, expectedCondition, {
        priceJPY: parsed.priceJPY,
        inStock: parsed.inStock,
        url,
      });
    }

    return scrapeResult;

  } catch (error) {
    const durationMs = Date.now() - start;
    
    return {
      provider,
      priceJPY: null,
      inStock: false,
      title: null,
      condition: expectedCondition,
      url,
      success: false,
      cloudflareDetected: false,
      durationMs,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Persist scraped offer to database
 */
async function persistOffer(
  cardId: string,
  provider: string,
  condition: 'A-' | 'B',
  data: { priceJPY: number; inStock: boolean; url: string }
): Promise<void> {
  try {
    await prisma.japanOffer.upsert({
      where: {
        cardId_source_quality: {
          cardId,
          source: provider,
          quality: condition,
        },
      },
      create: {
        cardId,
        source: provider,
        quality: condition,
        priceJPY: data.priceJPY,
        inStock: data.inStock,
        url: data.url,
        extractedAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        priceJPY: data.priceJPY,
        inStock: data.inStock,
        url: data.url,
        updatedAt: new Date(),
      },
    });

    // Also update the card's updatedAt timestamp
    await prisma.card.update({
      where: { id: cardId },
      data: { updatedAt: new Date() },
    });

  } catch (error) {
    console.error(`[Scrape.do] Failed to persist offer for ${cardId}:`, error);
  }
}

/**
 * Scrape multiple providers for a card
 */
export async function scrapeCardProviders(
  cardId: string,
  offers: Array<{ url: string; source: string; quality: string }>
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];

  for (const offer of offers) {
    // Only scrape Japanese providers we support
    if (!['japan-toreca', 'dorasuta', 'toretoku', 'torecacamp', 'hobibinet'].includes(offer.source)) {
      continue;
    }

    const result = await scrapeProvider({
      cardId,
      url: offer.url,
      provider: offer.source,
      expectedCondition: offer.quality as 'A-' | 'B',
    });

    results.push(result);
  }

  return results;
}

/**
 * Batch scrape multiple cards with rate limiting
 */
export async function scrapeBatch(
  requests: ScrapeCardRequest[],
  options: { delayMs?: number; concurrency?: number } = {}
): Promise<ScrapeResult[]> {
  const { delayMs = 2000, concurrency = 2 } = options;
  
  const results: ScrapeResult[] = [];
  const chunks: ScrapeCardRequest[][] = [];
  
  // Split into chunks for concurrency control
  for (let i = 0; i < requests.length; i += concurrency) {
    chunks.push(requests.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    // Process chunk concurrently
    const chunkResults = await Promise.all(
      chunk.map(req => scrapeProvider(req))
    );
    
    results.push(...chunkResults);
    
    // Delay between chunks
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get usage statistics from Scrape.do
 * Note: Scrape.do doesn't have a direct API for this, so we track internally
 */
export function logScrapeMetrics(
  provider: string,
  result: ScrapeResult
): void {
  console.log('[Scrape.do]', {
    provider,
    success: result.success,
    durationMs: result.durationMs,
    cloudflareDetected: result.cloudflareDetected,
    hasPrice: !!result.priceJPY,
    timestamp: new Date().toISOString(),
  });
}
