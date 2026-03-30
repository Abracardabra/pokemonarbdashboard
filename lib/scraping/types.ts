/**
 * Unified Scraping Types
 * Simple, consistent interfaces for all Japanese card providers
 */

export type Provider =
  | 'japan-toreca'
  | 'dorasuta'
  | 'toretoku'
  | 'torecacamp'
  | 'hobibinet';

export interface ScrapedOffer {
  cardId: string; // Our internal ID (set:number)
  provider: Provider;
  condition: 'A-' | 'B';
  priceJPY: number;
  inStock: boolean;
  url: string;
  title?: string;
  scrapedAt: Date;
}

export interface ProviderConfig {
  name: Provider;
  baseUrl: string;
  selectors: {
    price: string;
    stock: string;
    title: string;
  };
  qualityPatterns: {
    aMinus: RegExp[];
    b: RegExp[];
  };
  stockIndicators: {
    inStock: string[];
    outOfStock: string[];
  };
  // Optional: Custom price extractor for tricky sites
  extractPrice?: (text: string) => number | null;
}

export interface ScrapeCardInput {
  cardId: string;
  urls: Array<{
    url: string;
    expectedCondition: 'A-' | 'B';
  }>;
}

export interface ScrapeResult {
  offers: ScrapedOffer[];
  errors: string[];
  metrics: {
    creditsUsed: number;
    durationMs: number;
  };
}
