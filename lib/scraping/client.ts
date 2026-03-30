/**
 * Client-side scraping helpers
 * Simple functions to call the unified /api/scrape endpoint
 */

import type { ArbitrageOpportunity, JapanesePrice } from '@/lib/types';

export interface ScrapeResponse {
  success: boolean;
  cardId: string;
  offers: Array<{
    cardId: string;
    provider: string;
    condition: 'A-' | 'B';
    priceJPY: number;
    inStock: boolean;
    url: string;
    title?: string;
    extractedAt: string;
  }>;
  errors: string[];
  metrics: {
    creditsUsed: number;
    durationMs: number;
  };
}

/**
 * Scrape a card from specific providers
 * 
 * @param cardId - The card ID to scrape
 * @param provider - Optional: specific provider to scrape (if omitted, scrapes all)
 * @returns Scrape result with offers and metrics
 */
export async function scrapeCard(
  cardId: string,
  provider?: string
): Promise<ScrapeResponse> {
  const res = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, provider }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Scrape failed: ${res.status} - ${error}`);
  }

  return res.json();
}

/**
 * Scrape multiple cards in batch
 * 
 * @param cardIds - Array of card IDs to scrape
 * @returns Batch scrape results
 */
export async function scrapeBatch(
  cardIds: string[]
): Promise<{
  success: boolean;
  batch: true;
  results: Array<{
    cardId: string;
    success: boolean;
    offers: number;
    errors: string[];
    creditsUsed: number;
  }>;
  totalCredits: number;
  totalDuration: number;
}> {
  const res = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch: cardIds.map(id => ({ cardId: id })),
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Batch scrape failed: ${res.status} - ${error}`);
  }

  return res.json();
}

/**
 * Merge scraped offers into card data
 * Updates the card's japanesePrices array with new data
 */
export function mergeScrapedOffers(
  card: ArbitrageOpportunity,
  scrapedOffers: ScrapeResponse['offers']
): ArbitrageOpportunity {
  // Group offers by provider
  const offersByProvider = new Map<string, typeof scrapedOffers>();
  for (const offer of scrapedOffers) {
    const existing = offersByProvider.get(offer.provider) || [];
    existing.push(offer);
    offersByProvider.set(offer.provider, existing);
  }

  // Start with existing prices
  const updatedPrices: JapanesePrice[] = [...card.japanesePrices];

  // Update or add scraped offers
  for (const [provider, offers] of offersByProvider) {
    // Remove old offers from this provider
    const otherPrices = updatedPrices.filter(p => p.source !== provider);

    // Add new offers
    for (const offer of offers) {
      const JPY_TO_USD = 0.0065;
      otherPrices.push({
        source: provider as any,
        priceJPY: offer.priceJPY,
        priceUSD: Math.round(offer.priceJPY * JPY_TO_USD * 100) / 100,
        quality: offer.condition,
        inStock: offer.inStock,
        url: offer.url,
        isLowest: false, // Will be recalculated
      });
    }

    // Update the array
    updatedPrices.length = 0;
    updatedPrices.push(...otherPrices);
  }

  // Recalculate lowest price
  const lowestPrice = Math.min(
    ...updatedPrices
      .filter(p => p.inStock && p.priceJPY > 0)
      .map(p => p.priceJPY)
  );

  // Update isLowest flags
  for (const price of updatedPrices) {
    price.isLowest = price.priceJPY === lowestPrice && price.inStock;
  }

  return {
    ...card,
    japanesePrices: updatedPrices,
    lowestJapanesePrice: lowestPrice === Infinity ? 0 : lowestPrice,
    lastUpdated: new Date().toISOString(),
  };
}
