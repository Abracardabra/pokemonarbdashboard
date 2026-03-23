import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGIN = 'shop.japan-toreca.com';

type JapanTorecaProductResponse = {
  priceJPY: number | null;
  inStock: boolean | null;
  quality: 'A-' | 'B' | null;
  extractedAt: string;
};

function parsePriceJPY(html: string): number | null {
  // Japan-Toreca product pages usually include "¥" directly near the main price.
  const m = html.match(/¥\s*([\d,]+)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseQuality(html: string): 'A-' | 'B' | null {
  // Examples on product pages:
  // - 【状態B】... => B
  // - 【状態A】... => treat as A-
  // - 【状態A-】... => A-
  if (html.includes('【状態B】') || html.match(/【状態\s*B\s*】/)) return 'B';
  if (html.includes('【状態A-】') || html.match(/【状態\s*A-\s*】/)) return 'A-';
  if (html.includes('【状態A】') || html.match(/【状態\s*A\s*】/)) return 'A-';
  return null;
}

function parseInStock(html: string): boolean {
  // Heuristic from observed page text:
  // - OOS often shows: "利用不可" and "0点在庫" and/or sold-out keywords
  const soldOutSignals = [
    '売り切れ',
    '売切れ',
    '在庫切',
    '0点在庫',
    '利用不可',
    'Sold Out',
    'sold out',
  ];
  return !soldOutSignals.some((s) => html.includes(s));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productUrl = searchParams.get('url');

  if (!productUrl) {
    return NextResponse.json(
      { error: 'Missing required query parameter: url' },
      { status: 400 }
    );
  }

  let urlObj: URL;
  try {
    urlObj = new URL(productUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (urlObj.host !== ALLOWED_ORIGIN || !urlObj.pathname.startsWith('/products/')) {
    return NextResponse.json(
      { error: 'Disallowed url: expected shop.japan-toreca.com/products/...' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const html = await res.text();
    const payload: JapanTorecaProductResponse = {
      priceJPY: parsePriceJPY(html),
      inStock: parseInStock(html),
      quality: parseQuality(html),
      extractedAt: new Date().toISOString(),
    };

    // Return 502 if we couldn't extract essential fields (price).
    // Quality can be null if the page format changes; the caller can still use expected quality.
    if (payload.priceJPY == null || payload.inStock == null) {
      return NextResponse.json(
        { ...payload, error: 'Failed to extract product fields (price/quality/stock)' },
        { status: 502, headers: { 'X-Debug-External-Url': productUrl } }
      );
    }

    return NextResponse.json(payload, {
      headers: {
        'X-Debug-External-Url': productUrl,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      {
        status: 500,
        headers: {
          'X-Debug-External-Url': productUrl,
        },
      }
    );
  }
}

