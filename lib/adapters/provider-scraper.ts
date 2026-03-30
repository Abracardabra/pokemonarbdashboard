/**
 * Cost-Optimized Provider Scraper
 * 
 * Strategy: Try direct fetch first (FREE), only use Scrape.do if blocked
 * This minimizes costs since many sites work without bypass
 */

import { smartFetch, SmartFetchResult } from './smart-fetch';
import { parseProviderHtml, ParsedOffer } from './scrape-do-queries';
import { prisma } from '@/lib/prisma';

export interface ScrapeResult extends ParsedOffer {
  provider: string;
  success: boolean;
  cloudflareDetected: boolean;
  durationMs: number;
  fetchMethod: 'direct' | 'scrape-do';
  scrapeDoCost: number;  // Credits used (0 for direct, 1 for Scrape.do)
}

export interface ScrapeCardRequest {
  cardId: string;
  url: string;
  provider: string;
  expectedCondition: 'A-' | 'B';
}

/**
 * Scrape a single provider URL for card data
 * Uses smart fetch: tries direct first, falls back to Scrape.do only if blocked
 */
export async function scrapeProvider(
  request: ScrapeCardRequest
): Promise<ScrapeResult> {
  const { cardId, url, provider, expectedCondition } = request;

  const start = Date.now();
  
  try {
    // Use smart fetch: tries direct first, falls back to Scrape.do
    const result = await smartFetch(url, {
      timeout: 15000,  // Short timeout for direct, smartFetch handles Scrape.do separately
      geoCode: 'jp',
      render: true,
    });

    const durationMs = Date.now() - start;

    // Parse the HTML
    const parsed = parseProviderHtml(provider, {
      success: result.success,
      html: result.html,
      status: result.status,
      durationMs: result.durationMs,
      isCloudflareChallenge: result.error?.includes('Cloudflare') || false,
      isBlocked: !result.success,
      title: null,
    }, expectedCondition, url);

    const scrapeResult: ScrapeResult = {
      ...parsed,
      provider,
      success: result.success && !!parsed.priceJPY,
      cloudflareDetected: result.error?.includes('Cloudflare') || false,
      durationMs,
      fetchMethod: result.method,
      scrapeDoCost: result.scrapeDoCost || 0,
    };

    // Persist to database if successful
    if (scrapeResult.success && parsed.priceJPY) {
      await persistOffer(cardId, provider, expectedCondition, {
        priceJPY: parsed.priceJPY,
        inStock: parsed.inStock,
        url,
      });
    }

    // Log metrics with cost
    logScrapeMetrics(provider, scrapeResult);

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
      fetchMethod: 'direct',
      scrapeDoCost: 0,
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
 * Batch scrape multiple cards with rate limiting and cost tracking
 */
export async function scrapeBatch(
  requests: ScrapeCardRequest[],
  options: { delayMs?: number; concurrency?: number } = {}
): Promise<{ results: ScrapeResult[]; metrics: ReturnType<typeof calculateBatchMetrics> }> {
  const { delayMs = 2000, concurrency = 2 } = options;
  
  const results: ScrapeResult[] = [];
  const chunks: ScrapeCardRequest[][] = [];
  
  // Split into chunks for concurrency control
  for (let i = 0; i < requests.length; i += concurrency) {
    chunks.push(requests.slice(i, i + concurrency));
  }

  console.log(`[Scrape Batch] Processing ${requests.length} requests in ${chunks.length} chunks (concurrency: ${concurrency})`);

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

  // Calculate metrics
  const metrics = calculateBatchMetrics(results);
  
  console.log('[Scrape Batch] Complete:', {
    total: metrics.total,
    successRate: `${(metrics.successRate * 100).toFixed(1)}%`,
    directFetches: metrics.direct,
    scrapeDoFetches: metrics.scrapeDo,
    totalCost: `${metrics.totalCost} credits`,
    savings: `${metrics.savings} credits saved`,
  });

  return { results, metrics };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get usage statistics from Scrape.do
 * Tracks costs and success rates by provider
 */
export function logScrapeMetrics(
  provider: string,
  result: ScrapeResult
): void {
  console.log('[Scrape]', {
    provider,
    success: result.success,
    durationMs: result.durationMs,
    fetchMethod: result.fetchMethod,
    cost: result.scrapeDoCost,
    cloudflareDetected: result.cloudflareDetected,
    hasPrice: !!result.priceJPY,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Calculate batch cost savings
 */
export function calculateBatchMetrics(results: ScrapeResult[]): {
  total: number;
  direct: number;
  scrapeDo: number;
  totalCost: number;
  savings: number;
  successRate: number;
} {
  const total = results.length;
  const direct = results.filter(r => r.fetchMethod === 'direct').length;
  const scrapeDo = results.filter(r => r.fetchMethod === 'scrape-do').length;
  const totalCost = results.reduce((sum, r) => sum + r.scrapeDoCost, 0);
  const savings = direct;  // Each direct fetch saves 1 Scrape.do credit
  const successRate = results.filter(r => r.success).length / total;

  return {
    total,
    direct,
    scrapeDo,
    totalCost,
    savings,
    successRate,
  };
}
