/**
 * Unified Scrape API
 * Single endpoint for scraping all Japanese card providers
 * 
 * POST /api/scrape
 * Body: { cardId: string, provider?: Provider }
 * 
 * Returns: { success: boolean, offers: ScrapedOffer[], metrics: {...} }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scrapeCard, scrapeBatch, logScrapeMetrics } from '@/lib/scraping/engine';
import { getSupportedProviders } from '@/lib/scraping/providers';
import type { Provider } from '@/lib/scraping/types';

// Supported providers for validation
const SUPPORTED_PROVIDERS = getSupportedProviders();

/**
 * POST /api/scrape
 * Scrape a single card or batch of cards
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardId, provider, batch } = body;

    // Handle batch requests
    if (batch && Array.isArray(batch)) {
      return handleBatchScrape(batch);
    }

    // Handle single card request
    if (!cardId) {
      return NextResponse.json(
        { error: 'Missing required field: cardId' },
        { status: 400 }
      );
    }

    return handleSingleScrape(cardId, provider as Provider | undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /scrape] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process scrape request', message },
      { status: 500 }
    );
  }
}

/**
 * Scrape a single card
 */
async function handleSingleScrape(cardId: string, specificProvider?: Provider) {
  // Get card from database
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      japanOffers: true,
    },
  });

  if (!card) {
    return NextResponse.json(
      { error: 'Card not found', cardId },
      { status: 404 }
    );
  }

  // Get existing offers to determine URLs
  const urls = getProviderUrls(card, specificProvider);

  if (urls.length === 0) {
    return NextResponse.json(
      { error: 'No provider URLs found for this card', cardId },
      { status: 400 }
    );
  }

  // Scrape the card
  const result = await scrapeCard({ cardId, urls });

  // Persist results to database
  const persistedOffers = await persistOffers(cardId, result.offers);

  // Log metrics
  logScrapeMetrics(cardId, result);

  return NextResponse.json({
    success: result.offers.length > 0,
    cardId,
    offers: persistedOffers,
    errors: result.errors,
    metrics: result.metrics,
  });
}

/**
 * Handle batch scrape requests
 */
async function handleBatchScrape(batch: Array<{ cardId: string; provider?: Provider }>) {
  // Limit batch size
  if (batch.length > 50) {
    return NextResponse.json(
      { error: 'Batch size too large. Maximum 50 cards per batch.' },
      { status: 400 }
    );
  }

  const results: Array<{
    cardId: string;
    success: boolean;
    offers: number;
    errors: string[];
    creditsUsed: number;
  }> = [];

  let totalCredits = 0;
  const batchStart = Date.now();

  // Process sequentially to avoid rate limits
  for (const item of batch) {
    const card = await prisma.card.findUnique({
      where: { id: item.cardId },
      include: { japanOffers: true },
    });

    if (!card) {
      results.push({
        cardId: item.cardId,
        success: false,
        offers: 0,
        errors: ['Card not found'],
        creditsUsed: 0,
      });
      continue;
    }

    const urls = getProviderUrls(card, item.provider);
    if (urls.length === 0) {
      results.push({
        cardId: item.cardId,
        success: false,
        offers: 0,
        errors: ['No provider URLs found'],
        creditsUsed: 0,
      });
      continue;
    }

    const result = await scrapeCard({ cardId: item.cardId, urls });
    await persistOffers(item.cardId, result.offers);

    results.push({
      cardId: item.cardId,
      success: result.offers.length > 0,
      offers: result.offers.length,
      errors: result.errors,
      creditsUsed: result.metrics.creditsUsed,
    });

    totalCredits += result.metrics.creditsUsed;

    // Small delay between cards
    if (batch.indexOf(item) < batch.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  return NextResponse.json({
    success: true,
    batch: true,
    results,
    totalCredits,
    totalDuration: Date.now() - batchStart,
    averageDuration: Math.round((Date.now() - batchStart) / batch.length),
  });
}

/**
 * Extract provider URLs from card data
 */
function getProviderUrls(
  card: any,
  specificProvider?: Provider
): Array<{ url: string; expectedCondition: 'A-' | 'B' }> {
  const urls: Array<{ url: string; expectedCondition: 'A-' | 'B' }> = [];

  // Check all possible offer sources
  const offerSources = card.japanOffers || [];

  for (const offer of offerSources) {
    // Skip if specific provider requested and doesn't match
    if (specificProvider && offer.source !== specificProvider) {
      continue;
    }

    // Skip if URL not available
    if (!offer.url) continue;

    urls.push({
      url: offer.url,
      expectedCondition: offer.quality as 'A-' | 'B',
    });
  }

  return urls;
}

/**
 * Persist scraped offers to database
 */
async function persistOffers(
  cardId: string,
  offers: Array<{
    cardId: string;
    provider: Provider;
    condition: 'A-' | 'B';
    priceJPY: number;
    inStock: boolean;
    url: string;
    scrapedAt: Date;
  }>
) {
  const persisted = [];

  for (const offer of offers) {
    try {
      const upserted = await prisma.japanOffer.upsert({
        where: {
          cardId_source_quality: {
            cardId,
            source: offer.provider,
            quality: offer.condition,
          },
        },
        create: {
          cardId,
          source: offer.provider,
          quality: offer.condition,
          priceJPY: offer.priceJPY,
          inStock: offer.inStock,
          url: offer.url,
          extractedAt: offer.scrapedAt,
          updatedAt: offer.scrapedAt,
        },
        update: {
          priceJPY: offer.priceJPY,
          inStock: offer.inStock,
          url: offer.url,
          updatedAt: offer.scrapedAt,
        },
      });

      persisted.push(upserted);
    } catch (error) {
      console.error(`[API /scrape] Failed to persist offer for ${cardId}:`, error);
    }
  }

  // Update card's updatedAt timestamp
  if (persisted.length > 0) {
    await prisma.card.update({
      where: { id: cardId },
      data: { updatedAt: new Date() },
    });
  }

  return persisted;
}

/**
 * GET /api/scrape
 * Health check and provider list
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: SUPPORTED_PROVIDERS,
    apiKeyConfigured: !!process.env.SCRAPE_DO_API_KEY,
    usage: {
      note: 'Each scrape costs 1 Scrape.do credit',
      creditsPerCard: '1-2 (one per condition)',
    },
  });
}
