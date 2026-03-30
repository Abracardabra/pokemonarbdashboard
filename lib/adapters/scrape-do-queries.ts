/**
 * Scrape.do Provider-Specific Query Builders
 * CSS selectors and parsers for Japanese card shop sites
 */

import * as cheerio from 'cheerio';
import { ScrapeDoResult, extractPriceJPY, checkInStock } from './scrape-do-client';

export interface ProviderSelectors {
  /** CSS selector for price element */
  price: string;
  /** CSS selector for stock status element */
  stock: string;
  /** CSS selector for product title */
  title: string;
  /** CSS selector for product image */
  image?: string;
  /** CSS selector for condition indicator (if on page) */
  condition?: string;
}

export interface ParsedOffer {
  priceJPY: number | null;
  inStock: boolean;
  title: string | null;
  condition: 'A-' | 'B' | null;
  url: string;
  error?: string;
}

// Provider-specific CSS selectors
export const PROVIDER_SELECTORS: Record<string, ProviderSelectors> = {
  'japan-toreca': {
    price: '.product-price .money, .price__current .money, [data-price] .money',
    stock: '.product-form__inventory, .inventory-quantity, .stock-status',
    title: 'h1.product-title, .product__title h1',
    image: '.product-media img, .product__media img',
    condition: '.variant-sku, .product__sku',  // Often contains -a or -b
  },
  
  'dorasuta': {
    // Note: Test showed `.price` works, returns price like "300 円"
    // Stock text contains "状態A 300 円 在庫数：363"
    price: '.price, .price-current, .product-price .current-price, .price-box .price',
    stock: '[class*="stock"], .stock-status, .availability, .product-stock',
    title: 'h1, h1.product-title, .product-name h1, h1[itemprop="name"]',
    image: '.product-image img, .gallery-image img',
    condition: '.product-condition, .condition-badge',
  },
  
  'toretoku': {
    price: '.price-area .price, .item-price, .current-price',
    stock: '.stock-area, .stock-status, .inventory',
    title: 'h1.item-name, .product-name',
  },
  
  'torecacamp': {
    price: '.price-item, .product-price',
    stock: '.inventory-quantity, .stock-status',
    title: 'h1.product-name, .item-title',
  },
  
  'hobibinet': {
    price: '.item-price, .price-box .price',
    stock: '.stock-status, .availability',
    title: 'h1.item-title, .product-title',
  },
};

/**
 * Parse HTML from a provider to extract offer data
 */
export function parseProviderHtml(
  provider: string,
  result: ScrapeDoResult,
  expectedCondition: 'A-' | 'B',
  url: string
): ParsedOffer {
  if (!result.success || !result.html) {
    return {
      priceJPY: null,
      inStock: false,
      title: null,
      condition: expectedCondition,
      url,
      error: result.error || result.isCloudflareChallenge 
        ? 'Cloudflare challenge detected' 
        : 'Failed to fetch page',
    };
  }

  const selectors = PROVIDER_SELECTORS[provider];
  if (!selectors) {
    return {
      priceJPY: null,
      inStock: false,
      title: null,
      condition: expectedCondition,
      url,
      error: `Unknown provider: ${provider}`,
    };
  }

  const $ = cheerio.load(result.html);

  // Extract price
  const priceText = $(selectors.price).first().text().trim();
  const priceJPY = extractPriceJPY(priceText);

  // Extract stock status
  const stockText = $(selectors.stock).first().text().trim();
  const inStock = checkInStock(stockText);

  // Extract title
  const title = $(selectors.title).first().text().trim() || result.title;

  // Try to detect condition from page if available
  let condition: 'A-' | 'B' = expectedCondition;
  if (selectors.condition) {
    const conditionText = $(selectors.condition).first().text().toLowerCase();
    if (conditionText.includes('-a') || conditionText.includes('a-')) {
      condition = 'A-';
    } else if (conditionText.includes('-b') || conditionText.includes('b-')) {
      condition = 'B';
    }
  }

  return {
    priceJPY,
    inStock: priceJPY ? inStock : false,  // Only mark in stock if we found a price
    title: title || null,
    condition,
    url,
    error: priceJPY ? undefined : 'Could not extract price from page',
  };
}

/**
 * Extract all offers from a provider page
 * Some providers show both A- and B condition offers on same page
 */
export function extractAllOffers(
  provider: string,
  result: ScrapeDoResult,
  url: string
): ParsedOffer[] {
  if (!result.success || !result.html) {
    return [];
  }

  const selectors = PROVIDER_SELECTORS[provider];
  if (!selectors) {
    return [];
  }

  const $ = cheerio.load(result.html);
  const offers: ParsedOffer[] = [];

  // Try to find multiple price elements (some sites list multiple conditions)
  const priceElements = $(selectors.price);
  
  priceElements.each((i, el) => {
    const $el = $(el);
    const priceText = $el.text().trim();
    const priceJPY = extractPriceJPY(priceText);

    if (priceJPY) {
      // Try to find associated stock status nearby
      const stockText = $el.closest('tr, .product, .item').find(selectors.stock).text();
      const inStock = checkInStock(stockText);

      // Try to detect condition
      let condition: 'A-' | 'B' = 'A-';
      const text = $el.closest('tr, .product, .item').text().toLowerCase();
      if (text.includes('-b') || text.includes('b-') || text.includes('bランク')) {
        condition = 'B';
      }

      offers.push({
        priceJPY,
        inStock,
        title: $(selectors.title).first().text().trim() || result.title,
        condition,
        url,
      });
    }
  });

  return offers.length > 0 ? offers : [
    parseProviderHtml(provider, result, 'A-', url)
  ];
}
