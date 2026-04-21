/**
 * Provider Configurations
 * All site-specific selectors and patterns in one place
 */

import { ProviderConfig } from './types';

/**
 * Extract price from Japanese text formats
 * Handles: "¥1,234", "1,234円", "1234"
 */
export function extractPriceJPY(text: string): number | null {
  if (!text) return null;

  // Try yen symbol format: ¥1,234
  const yenSymbolMatch = text.match(/[¥￥]\s*([\d,]+)/);
  if (yenSymbolMatch) {
    const n = parseInt(yenSymbolMatch[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Try yen character format: 1,234円
  const yenCharMatch = text.match(/([\d,]+)\s*円/);
  if (yenCharMatch) {
    const n = parseInt(yenCharMatch[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Fallback: just numbers with commas
  const numberMatch = text.match(/([\d,]+)/);
  if (numberMatch) {
    const n = parseInt(numberMatch[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n > 0 && n < 10000000) return n; // Sanity check
  }

  return null;
}

/**
 * Detect stock status from text
 */
export function detectStock(
  text: string,
  indicators: { inStock: string[]; outOfStock: string[] }
): boolean {
  if (!text) return true; // Assume in stock if no info

  const lowerText = text.toLowerCase();

  // Check out of stock indicators first
  for (const indicator of indicators.outOfStock) {
    if (lowerText.includes(indicator.toLowerCase())) {
      return false;
    }
  }

  // Check in stock indicators
  for (const indicator of indicators.inStock) {
    if (lowerText.includes(indicator.toLowerCase())) {
      return true;
    }
  }

  // Default to in stock
  return true;
}

/**
 * Detect quality from HTML using patterns
 */
export function detectQuality(
  html: string,
  patterns: { aMinus: RegExp[]; b: RegExp[] }
): 'A-' | 'B' | null {
  // Check for B first (more specific)
  for (const pattern of patterns.b) {
    if (pattern.test(html)) return 'B';
  }

  // Check for A-
  for (const pattern of patterns.aMinus) {
    if (pattern.test(html)) return 'A-';
  }

  return null;
}

/**
 * Provider configurations
 * All site-specific settings centralized
 */
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  'japan-toreca': {
    name: 'japan-toreca',
    baseUrl: 'https://shop.japan-toreca.com',
    selectors: {
      price:
        '.product-price .money, .price__current .money, .price__current, .price, meta[property="og:price:amount"], meta[property="product:price:amount"]',
      stock: '.product-form__inventory, .inventory-quantity, .stock-status',
      title: 'h1.product-title, .product__title h1',
    },
    qualityPatterns: {
      aMinus: [/【状態A】/i, /【状態A-】/i, /状態A/i],
      b: [/【状態B】/i, /状態B/i],
    },
    stockIndicators: {
      inStock: ['在庫あり', 'カートに追加', '在庫数'],
      outOfStock: ['売り切れ', '売切れ', '在庫なし', '在庫切れ', 'Sold Out', '利用不可'],
    },
  },

  'dorasuta': {
    name: 'dorasuta',
    baseUrl: 'https://dorasuta.jp',
    selectors: {
      price: '.price, .price-current, .product-price .current-price',
      stock: '[class*="stock"], .stock-status, .availability',
      title: 'h1, h1.product-title',
    },
    qualityPatterns: {
      aMinus: [/状態A/i, /状態A特価/i],
      b: [/状態B/i],
    },
    stockIndicators: {
      inStock: ['在庫数', 'カートに追加', '在庫あり'],
      outOfStock: ['売り切れ', '在庫なし', '在庫切れ'],
    },
  },

  'toretoku': {
    name: 'toretoku',
    baseUrl: 'https://www.toretoku.jp',
    selectors: {
      price: '.price-area .price, .item-price, .current-price',
      stock: '.stock-area, .stock-status, .inventory',
      title: 'h1.item-name, .product-name',
    },
    qualityPatterns: {
      aMinus: [/Aランク/i, /状態A/i, /【A】/i],
      b: [/Bランク/i, /状態B/i, /【B】/i],
    },
    stockIndicators: {
      inStock: ['在庫あり', '在庫数', '購入可能'],
      outOfStock: ['売り切れ', '在庫なし', 'Sold Out'],
    },
  },

  'torecacamp': {
    name: 'torecacamp',
    baseUrl: 'https://torecacamp-pokemon.com',
    selectors: {
      price: '.price-item, .product-price, .price',
      stock: '.inventory-quantity, .stock-status',
      title: 'h1.product-name, .item-title',
    },
    qualityPatterns: {
      aMinus: [/A-/i, /状態A/i, /【A】/i],
      b: [/B/i, /状態B/i, /【B】/i],
    },
    stockIndicators: {
      inStock: ['在庫あり', '在庫数'],
      outOfStock: ['売り切れ', '在庫なし', 'Sold Out'],
    },
  },

  'hobibinet': {
    name: 'hobibinet',
    baseUrl: 'https://hobibinet-pokemon.com',
    selectors: {
      price:
        '.item-price, .price-box .price, .price, .money, .product-form__info-content, meta[property="product:price:amount"], meta[property="og:price:amount"]',
      stock: '.stock-status, .availability, .inventory, .product-stock',
      title: 'h1.item-title, .product-title, h1',
    },
    qualityPatterns: {
      aMinus: [/A-/i, /状態A/i, /【A】/i, /美品/i],
      b: [/B/i, /状態B/i, /【B】/i, /並品/i],
    },
    stockIndicators: {
      inStock: ['在庫あり', '在庫数', '購入可能', 'カートに追加'],
      outOfStock: ['売り切れ', '在庫なし', 'Sold Out'],
    },
  },

  'cardrush': {
    name: 'cardrush',
    baseUrl: 'https://www.cardrush-pokemon.jp',
    selectors: {
      price: '.price, .item-price, .product-price, .price-value',
      stock: '.stock-status, .inventory, .stock, .zaiko',
      title: 'h1.item-name, .product-name, h1',
    },
    qualityPatterns: {
      aMinus: [/美品/i, /A-/i, /状態A/i],
      b: [/並品/i, /B/i, /状態B/i],
    },
    stockIndicators: {
      inStock: ['在庫あり', '即納', '購入可能', 'カートに入れる'],
      outOfStock: ['売り切れ', '在庫なし', 'Sold Out', '品切れ'],
    },
  },

  'playze': {
    name: 'playze',
    baseUrl: 'https://playze.jp',
    selectors: {
      price: '.price, .money, .product-price, .current-price',
      stock: '.stock-status, .availability, .inventory-quantity',
      title: 'h1.product-title, .product-name, h1',
    },
    qualityPatterns: {
      aMinus: [/A-/i, /状態A/i, /【A】/i],
      b: [/B/i, /状態B/i, /【B】/i],
    },
    stockIndicators: {
      inStock: ['在庫あり', 'カートに追加'],
      outOfStock: ['売り切れ', '在庫なし', 'Sold Out'],
    },
  },

  'c-labo': {
    name: 'c-labo',
    baseUrl: 'https://www.c-labo-online.jp',
    selectors: {
      price: '.price, .money, .product-price',
      stock: '.stock-status, .availability, .inventory',
      title: 'h1.product-title, .item-name, h1',
    },
    qualityPatterns: {
      aMinus: [/A-/i, /状態A/i, /美品/i],
      b: [/B/i, /状態B/i, /並品/i],
    },
    stockIndicators: {
      inStock: ['在庫あり', '購入可能'],
      outOfStock: ['売り切れ', '在庫なし'],
    },
  },

  'fukufukutoreka': {
    name: 'fukufukutoreka',
    baseUrl: 'https://pokemon.fukufukutoreka.com',
    selectors: {
      price: '.price, .money, .product-price',
      stock: '.stock-status, .availability, .inventory',
      title: 'h1.product-title, h1',
    },
    qualityPatterns: {
      aMinus: [/A-/i, /状態A/i, /【A】/i],
      b: [/B/i, /状態B/i, /【B】/i],
    },
    stockIndicators: {
      inStock: ['在庫あり', 'カートに追加'],
      outOfStock: ['売り切れ', '在庫なし'],
    },
  },
};

/**
 * Get provider config by name
 */
export function getProviderConfig(provider: string): ProviderConfig | null {
  return PROVIDER_CONFIGS[provider] || null;
}

/**
 * List all supported providers
 */
export function getSupportedProviders(): string[] {
  return Object.keys(PROVIDER_CONFIGS);
}
