/**
 * Test endpoint for Scrape.do integration
 * GET /api/test/scrape-do?url=<url>&provider=<provider>
 * 
 * Example: /api/test/scrape-do?url=https://shop.japan-toreca.com/products/pokemon-10940-a&provider=japan-toreca
 */

import { NextResponse } from 'next/server';
import { scrapeDo } from '@/lib/adapters/scrape-do-client';
import { parseProviderHtml, PROVIDER_SELECTORS } from '@/lib/adapters/scrape-do-queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const provider = searchParams.get('provider') || 'japan-toreca';
  const condition = (searchParams.get('condition') as 'A-' | 'B') || 'A-';

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  // Validate provider
  if (!PROVIDER_SELECTORS[provider]) {
    return NextResponse.json(
      { error: `Unknown provider: ${provider}`, available: Object.keys(PROVIDER_SELECTORS) },
      { status: 400 }
    );
  }

  try {
    console.log(`[Test Scrape.do] Testing ${provider}: ${url}`);
    
    // Scrape via Scrape.do
    const result = await scrapeDo(url, {
      render: true,
      timeout: 60000,
      geoCode: 'jp',
    });

    // Parse the HTML
    const parsed = parseProviderHtml(provider, result, condition, url);

    // Return detailed results
    return NextResponse.json({
      ok: result.success && !!parsed.priceJPY,
      url,
      provider,
      scrapeDo: {
        status: result.status,
        durationMs: result.durationMs,
        htmlLength: result.html.length,
        isCloudflareChallenge: result.isCloudflareChallenge,
        isBlocked: result.isBlocked,
        title: result.title,
      },
      parsed: {
        priceJPY: parsed.priceJPY,
        inStock: parsed.inStock,
        title: parsed.title,
        condition: parsed.condition,
      },
      error: parsed.error,
      htmlPreview: result.success ? result.html.substring(0, 500) : undefined,
    });

  } catch (error) {
    console.error('[Test Scrape.do] Error:', error);
    
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        url,
        provider,
      },
      { status: 500 }
    );
  }
}
