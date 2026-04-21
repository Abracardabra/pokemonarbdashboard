/**
 * Scraping Engine v2
 * Replaces Scrape.do with dual strategy:
 * - FREE sites: Direct HTTP fetch (no credits)
 * - PAID sites: Browserless.io (credits for Cloudflare bypass)
 * 
 * FREE sites (direct fetch):
 * - japan-toreca: Shopify JSON
 * - torecacamp: Shopify .js
 * - hobibinet: Shopify HTML
 * - playze: Shopify HTML  
 * - c-labo: Direct HTML
 * - fukufuku: EC-CUBE HTML
 * 
 * PAID sites (Browserless):
 * - cardrush: Cloudflare protected
 * - toretoku: JS SPA
 * - dorasuta: Cloudflare protected
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
import { browserless, directFetch } from './browserless-client';
import { scrapeDorasutaCard } from './dorasuta-scraper';
import { scrapeToretokuCard } from './toretoku-strategy';

// Sites that need Browserless (paid credits)
const PAID_SITES = new Set(['cardrush', 'dorasuta', 'toretoku']);

// Sites that can use free direct fetch
const FREE_SITES = new Set([
  'japan-toreca',
  'torecacamp',
  'hobibinet',
  'playze',
  'c-labo',
  'fukufuku',
]);

/**
 * Scrape a URL using appropriate method based on provider
 * Routes FREE sites to direct fetch, PAID sites to Browserless
 */
async function scrapeUrl(url: string, provider: string): Promise<{
  html: string;
  status: number;
  success: boolean;
  error?: string;
  creditsUsed: number;
}> {
  const isPaid = PAID_SITES.has(provider);
  
  if (isPaid) {
    // Use Browserless with /unblock for Cloudflare sites
    const useUnblock = provider === 'dorasuta' || provider === 'cardrush';
    const result = await browserless(url, { 
      unblock: useUnblock,
      timeout: 120000 
    });
    
    return {
      html: result.html,
      status: result.status,
      success: result.success,
      error: result.error,
      creditsUsed: result.success ? 1 : 0,
    };
  } else {
    // Use direct fetch for free sites
    const result = await directFetch(url, 30000);
    return {
      html: result.html,
      status: result.status,
      success: result.success,
      error: result.error,
      creditsUsed: 0,  // FREE!
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
  const priceEl = $(config.selectors.price).first();
  const priceText =
    priceEl.text().trim() ||
    (priceEl.attr('content') || '').trim() ||
    (priceEl.attr('value') || '').trim() ||
    (priceEl.attr('data-price') || '').trim();
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
  // Prefer the URL-linked expected condition to avoid cross-variant bleeding.
  // Some storefront pages contain multiple quality labels in scripts/markup.
  const detectedQuality = detectQuality(htmlText, config.qualityPatterns);
  const condition = expectedCondition || detectedQuality || 'B';

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
 * Main entry point - routes to appropriate method based on provider
 */
export async function scrapeCard(
  input: ScrapeCardInput
): Promise<ScrapeResult> {
  const { cardId, urls } = input;
  const startTime = Date.now();

  const offers: ScrapedOffer[] = [];
  const errors: string[] = [];
  let creditsUsed = 0;

  const pushOfferUnique = (offer: ScrapedOffer) => {
    const exists = offers.some(
      (o) =>
        o.provider === offer.provider &&
        o.condition === offer.condition &&
        o.url === offer.url
    );
    if (!exists) offers.push(offer);
  };

  for (const { url, expectedCondition, provider: explicitProvider } of urls) {
    // Prefer explicit provider from DB source to avoid bad historic URL mappings.
    const provider = explicitProvider || detectProviderFromUrl(url);
    if (!provider) {
      errors.push(`Could not detect provider from URL: ${url}`);
      continue;
    }

    // Extract setId/cardNumber from canonical id format: "setId:number"
    const [setId, cardNumber] = cardId.split(':');

    // === SPECIAL HANDLING: Dorasuta uses set-based browsing ===
    if (provider === 'dorasuta' && setId && cardNumber) {
      try {
        const dorasutaResult = await scrapeDorasutaCard(setId, cardNumber, '');
        if (dorasutaResult && dorasutaResult.priceJPY > 0) {
          const dorasutaCondition = dorasutaResult.condition === 'Unknown' ? 'B' : dorasutaResult.condition;
          pushOfferUnique({
            cardId,
            provider: 'dorasuta' as Provider,
            condition: dorasutaCondition,
            priceJPY: dorasutaResult.priceJPY,
            inStock: dorasutaResult.inStock,
            url: dorasutaResult.url,
            title: dorasutaResult.name,
            scrapedAt: new Date(),
          });
          creditsUsed += 1;
          continue;
        } else {
          // Fallback to generic URL scrape when set-based strategy has no match.
          errors.push('dorasuta: No products found in set; falling back to URL parser');
        }
      } catch (error) {
        errors.push(`dorasuta: ${error instanceof Error ? error.message : 'Strategy error'}; falling back to URL parser`);
      }
    }

    // === SPECIAL HANDLING: Toretoku uses detail pages with known IDs ===
    if (provider === 'toretoku' && setId && cardNumber) {
      try {
        const toretokuResult = await scrapeToretokuCard(setId, cardNumber);
        if (toretokuResult) {
          if (toretokuResult.a !== null) {
            pushOfferUnique({
              cardId,
              provider: 'toretoku' as Provider,
              condition: 'A-',
              priceJPY: toretokuResult.a,
              inStock: toretokuResult.stockA > 0,
              url: toretokuResult.url,
              title: '',
              scrapedAt: new Date(),
            });
          }
          if (toretokuResult.b !== null) {
            pushOfferUnique({
              cardId,
              provider: 'toretoku' as Provider,
              condition: 'B',
              priceJPY: toretokuResult.b,
              inStock: toretokuResult.stockB > 0,
              url: toretokuResult.url,
              title: '',
              scrapedAt: new Date(),
            });
          }
          if (toretokuResult.a !== null || toretokuResult.b !== null) {
            creditsUsed += 1;
          }
        } else {
          errors.push('toretoku: No detail ID available for this card');
        }
      } catch (error) {
        errors.push(`toretoku: ${error instanceof Error ? error.message : 'Strategy error'}`);
      }
      continue;
    }

    // Scrape via appropriate method (generic handler for all other providers)
    const scrapeResult = await scrapeUrl(url, provider);
    creditsUsed += scrapeResult.creditsUsed;

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
        pushOfferUnique({
          cardId,
          ...parsed,
          scrapedAt: new Date(),
        });
      } else {
        // Fallback: if a "free/direct" fetch parsed nothing, try Browserless /content once.
        // This helps when storefronts require JS-rendered price fragments.
        if (!PAID_SITES.has(provider)) {
          const fallback = await browserless(url, { unblock: false, timeout: 120000 });
          if (fallback.success) {
            const reparsed = parseOffer(
              fallback.html,
              provider,
              url,
              expectedCondition
            );
            if (reparsed) {
              pushOfferUnique({
                cardId,
                ...reparsed,
                scrapedAt: new Date(),
              });
              creditsUsed += 1;
              continue;
            }
          }
        }
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
  if (domain.includes('cardrush-pokemon.jp')) return 'cardrush';
  if (domain.includes('playze.jp')) return 'playze';
  if (domain.includes('c-labo-online.jp')) return 'c-labo';
  if (domain.includes('fukufukutoreka.com')) return 'fukufuku';

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

/**
 * Get cost breakdown by provider type
 */
export function getCostBreakdown(): {
  free: string[];
  paid: string[];
  estimatedSavings: string;
} {
  return {
    free: Array.from(FREE_SITES),
    paid: Array.from(PAID_SITES),
    estimatedSavings: '70% fewer credits vs all-paid approach',
  };
}
