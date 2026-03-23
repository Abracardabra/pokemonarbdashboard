import { NextRequest, NextResponse } from 'next/server';
import { getApiSetId } from '@/lib/set-mappings';

const API_BASE_URL = 'https://www.pokemonpricetracker.com/api/v2';
const API_KEY = process.env.POKEPRICE_API_KEY || 'pokeprice_free_67abf1594acce302cdbaaf1339c9234cbc402f5726e95cd7';

// Rate limiting configuration
const RATE_LIMIT_MS = 1100; // 1.1 seconds between requests (max ~54/min)
let lastRequestTime = 0;

// In-memory cache
interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

/**
 * Rate limiter - ensures we don't exceed API limits
 */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    const delayMs = RATE_LIMIT_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Get cached data if valid
 */
function getCachedData(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Set cached data
 */
function setCachedData(key: string, data: unknown): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Generate cache key from parameters
 */
function generateCacheKey(setCode: string, cardNumber: string): string {
  return `${setCode}:${cardNumber}`;
}

/**
 * Fetch card price from PokemonPriceTracker API
 */
async function fetchCardPrice(setCode: string, cardNumber: string, opts?: { force?: boolean }) {
  const cacheKey = generateCacheKey(setCode, cardNumber);
  
  // Check cache first
  if (!opts?.force) {
    const cached = getCachedData(cacheKey);
    if (cached) {
      console.log(`[API Route] Cache hit for ${setCode} ${cardNumber}`);
      return cached;
    }
  }
  
  // Apply rate limiting
  await rateLimit();
  
  // Map Japanese set code to API set ID
  const apiSetId = getApiSetId(setCode);
  
  // Build URL
  const params = new URLSearchParams({
    set: apiSetId,
    number: cardNumber,
    language: 'japanese',
  });
  
  const url = `${API_BASE_URL}/cards?${params.toString()}`;
  console.log(`[API Route] Fetching: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[API Route] No data found for ${setCode} ${cardNumber}`);
        return null;
      }
      if (response.status === 429) {
        console.error(`[API Route] Rate limited by external API`);
        throw new Error('Rate limited');
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache the result
    setCachedData(cacheKey, data);
    
    return data;
  } catch (error) {
    console.error(`[API Route] Error fetching ${setCode} ${cardNumber}:`, error);
    throw error;
  }
}

/**
 * GET /api/prices?set=S12a&number=262
 * Fetches US price for a specific card
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const setCode = searchParams.get('set');
  const cardNumber = searchParams.get('number');
  const force = searchParams.get('force') === '1';
  
  if (!setCode || !cardNumber) {
    return NextResponse.json(
      { error: 'Missing required parameters: set and number' },
      { status: 400 }
    );
  }
  
  try {
    // Build the external URL up front so the browser can see what was called.
    // (Even if the in-memory cache hits, the external URL is deterministic.)
    const apiSetId = getApiSetId(setCode);
    const params = new URLSearchParams({
      set: apiSetId,
      number: cardNumber,
      language: 'japanese',
    });
    const externalUrl = `${API_BASE_URL}/cards?${params.toString()}`;

    const data = await fetchCardPrice(setCode, cardNumber, { force });
    
    if (!data) {
      return NextResponse.json(
        { error: 'No price data found', data: null },
        { status: 404 }
      );
    }
    
    return NextResponse.json(data, {
      headers: {
        // Cache on client side for 1 hour
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'X-Debug-External-Url': externalUrl,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('Rate limited')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch price data', message: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/prices
 * Batch fetch prices for multiple cards
 * Body: { cards: [{ set, number, id }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cards } = body;
    
    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid cards array' },
        { status: 400 }
      );
    }
    
    // Limit batch size to prevent abuse
    if (cards.length > 50) {
      return NextResponse.json(
        { error: 'Batch size too large. Max 50 cards per request.' },
        { status: 400 }
      );
    }
    
    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    
    // Process cards sequentially with rate limiting
    for (const card of cards) {
      const { set, number, id } = card;
      
      if (!set || !number || !id) {
        errors[id || 'unknown'] = 'Missing set, number, or id';
        continue;
      }
      
      try {
        const data = await fetchCardPrice(set, number);
        if (data) {
          results[id] = data;
        } else {
          errors[id] = 'No data found';
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors[id] = message;
      }
    }
    
    return NextResponse.json({
      success: true,
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      cached: Object.keys(results).length,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process batch request', message: errorMessage },
      { status: 500 }
    );
  }
}

// Revalidate every 3 days
export const revalidate = 259200;
