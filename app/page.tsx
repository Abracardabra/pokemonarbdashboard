import { CardsWithFilters } from '@/components/CardsWithFilters';
import { ReloadAllCardsButton } from '@/components/ReloadAllCardsButton';
import { BuilderDashboardData, DashboardData, ArbitrageOpportunity, JapanesePrice } from '@/lib/types';
import { baseCardsData } from '@/lib/card-data';
import Link from 'next/link';
import * as fs from 'fs';
import * as path from 'path';

// Revalidate every 3 days
export const revalidate = 259200;

/**
 * Read prices from JSON file
 * Falls back to base data if file doesn't exist
 */
function toArbitrageOpportunities(builder: BuilderDashboardData): ArbitrageOpportunity[] {
  const out: ArbitrageOpportunity[] = [];
  const JPY_TO_USD = 0.0065;

  for (const c of builder.cards) {
    const jp: JapanesePrice[] = [];

    if (c.japanToreca?.aMinus) {
      jp.push({
        source: 'japan-toreca',
        priceJPY: c.japanToreca.aMinus.priceJPY,
        priceUSD: c.japanToreca.aMinus.priceJPY * JPY_TO_USD,
        quality: 'A-',
        inStock: c.japanToreca.aMinus.inStock !== false,
        url: c.japanToreca.aMinus.url,
        isLowest: false,
      });
    }

    if (c.japanToreca?.b) {
      jp.push({
        source: 'japan-toreca',
        priceJPY: c.japanToreca.b.priceJPY,
        priceUSD: c.japanToreca.b.priceJPY * JPY_TO_USD,
        quality: 'B',
        inStock: c.japanToreca.b.inStock !== false,
        url: c.japanToreca.b.url,
        isLowest: false,
      });
    }

    // Toretoku (A/B; normalize A -> A- to match baseline logic)
    if (c.toretoku?.a) {
      jp.push({
        source: 'toretoku',
        priceJPY: c.toretoku.a.priceJPY,
        priceUSD: c.toretoku.a.priceJPY * JPY_TO_USD,
        quality: 'A-',
        inStock: (c.toretoku.stockA ?? 1) > 0,
        url: c.toretoku.a.url,
        isLowest: false,
      });
    }

    if (c.toretoku?.b) {
      jp.push({
        source: 'toretoku',
        priceJPY: c.toretoku.b.priceJPY,
        priceUSD: c.toretoku.b.priceJPY * JPY_TO_USD,
        quality: 'B',
        inStock: (c.toretoku.stockB ?? 1) > 0,
        url: c.toretoku.b.url,
        isLowest: false,
      });
    }

    // Torecacamp (Shopify) A-/B
    if (c.torecacamp?.aMinus) {
      jp.push({
        source: 'torecacamp',
        priceJPY: c.torecacamp.aMinus.priceJPY,
        priceUSD: c.torecacamp.aMinus.priceJPY * JPY_TO_USD,
        quality: 'A-',
        inStock: c.torecacamp.aMinus.inStock !== false,
        url: c.torecacamp.aMinus.url,
        isLowest: false,
      });
    }

    // Additional active shops: Hobibinet and Dorasuta
        if (c.hobibinet?.aMinus) {
          jp.push({
            source: 'hobibinet',
            priceJPY: c.hobibinet.aMinus.priceJPY,
            priceUSD: c.hobibinet.aMinus.priceJPY * JPY_TO_USD,
            quality: 'A-',
            inStock: c.hobibinet.aMinus.inStock !== false,
            url: c.hobibinet.aMinus.url,
            isLowest: false,
          });
        }
        if (c.hobibinet?.b) {
          jp.push({
            source: 'hobibinet',
            priceJPY: c.hobibinet.b.priceJPY,
            priceUSD: c.hobibinet.b.priceJPY * JPY_TO_USD,
            quality: 'B',
            inStock: c.hobibinet.b.inStock !== false,
            url: c.hobibinet.b.url,
            isLowest: false,
          });
        }
        if (c.dorasuta?.aMinus) {
          jp.push({
            source: 'dorasuta',
            priceJPY: c.dorasuta.aMinus.priceJPY,
            priceUSD: c.dorasuta.aMinus.priceJPY * JPY_TO_USD,
            quality: 'A-',
            inStock: c.dorasuta.aMinus.inStock !== false,
            url: c.dorasuta.aMinus.url,
            isLowest: false,
          });
        }
        if (c.dorasuta?.b) {
          jp.push({
            source: 'dorasuta',
            priceJPY: c.dorasuta.b.priceJPY,
            priceUSD: c.dorasuta.b.priceJPY * JPY_TO_USD,
            quality: 'B',
            inStock: c.dorasuta.b.inStock !== false,
            url: c.dorasuta.b.url,
            isLowest: false,
          });
        }

    // Prefer A- as the baseline; fall back to B.
    const aMinus = jp.filter((p) => String(p.quality).toUpperCase().replace('－', '-') === 'A-');
    const b = jp.filter((p) => String(p.quality).toUpperCase().replace('－', '-') === 'B');
    const baseline = (aMinus[0] || b[0]) || null;
    const baselineUSD = baseline?.priceUSD || 0;

    const usMarketPrice = c.usMarket?.tcgplayer?.marketPrice ?? null;
    const usProfitMargin =
      usMarketPrice != null && baselineUSD > 0 ? Math.round(((usMarketPrice - baselineUSD) / baselineUSD) * 100) : 0;

    out.push({
      id: `${c.setId}:${c.number}`,
      name: c.name,
      cardNumber: c.number,
      rarity: c.rarity,
      set: c.set,
      favorite: c.favorite === true ? true : undefined,
      tcgplayer: {
        marketPrice: usMarketPrice ?? 0,
        sellerCount: c.usMarket?.tcgplayer?.sellerCount ?? 0,
      },
      japanesePrices: jp,
      lowestJapanesePrice: jp.length > 0 ? Math.min(...jp.map((p) => p.priceJPY)) : 0,
      usPrice:
        usMarketPrice != null
          ? {
              marketPrice: usMarketPrice,
              sellerCount: c.usMarket?.tcgplayer?.sellerCount ?? 0,
              listingCount: 0,
              currency: 'USD',
              imageUrl: c.images?.small || undefined,
              imageCdnUrl: c.images?.large || undefined,
              tcgPlayerUrl: c.usMarket?.tcgplayer?.url || undefined,
            }
          : null,
      arbitrageUS: null,
      marginPercent: usProfitMargin,
      marginAmount: 0,
      lastUpdated: c.updatedAt,
      isViable: usProfitMargin > 0,
      imageUrl: c.images?.small || undefined,
      lastKnownPrice: null,
    });
  }

  return out;
}

function getPricesData(): DashboardData {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'prices.json');

    if (fs.existsSync(dataPath)) {
      const fileContent = fs.readFileSync(dataPath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      // Legacy dashboard format: { opportunities, lastUpdated, stats }
      if (Array.isArray(parsed?.opportunities) && parsed?.stats) {
        console.log('[Dashboard] Loaded prices from data/prices.json (legacy format)');
        return parsed;
      }

      // Builder format: { meta, cards }
      if (Array.isArray(parsed?.cards) && parsed?.meta) {
        console.log('[Dashboard] Loaded prices from data/prices.json (builder format)');
        const builder = parsed as BuilderDashboardData;
        const opportunities = toArbitrageOpportunities(builder);
        return {
          opportunities,
          lastUpdated: builder.meta.builtAt || new Date().toISOString(),
          stats: {
            totalCards: opportunities.length,
            viableOpportunities: opportunities.filter((c) => c.isViable).length,
            avgMargin: 0,
          },
        };
      }

      console.warn('[Dashboard] Unknown prices.json format; falling back to base data');
    }
  } catch (error) {
    console.error('[Dashboard] Error reading prices file:', error);
  }

  console.log('[Dashboard] Using base card data (no US prices)');
  return {
    opportunities: baseCardsData,
    lastUpdated: new Date().toISOString(),
    stats: {
      totalCards: baseCardsData.length,
      viableOpportunities: 0,
      avgMargin: 0,
    },
  };
}

export default async function Home() {
  const cardsData = getPricesData();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Pokemon TCG Arbitrage</h1>
              <p className="text-purple-200">
                Japanese S12a (VSTAR Universe) - AR/SAR/SR/CHR/UR/SSR/RRR Price Tracker (Japan → US Market)
              </p>
              <p className="text-purple-300 text-sm mt-2">Last updated: {new Date(cardsData.lastUpdated).toLocaleString()}</p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/compare"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/15 transition"
              >
                Compare JP Shops
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <ReloadAllCardsButton />
          <a
            href="/compare"
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 text-sm"
          >
            Compare shops →
          </a>
        </div>

        <CardsWithFilters 
          initialCards={cardsData.opportunities} 
          totalCards={cardsData.stats.totalCards}
          viableOpportunities={cardsData.stats.viableOpportunities}
          avgMargin={cardsData.stats.avgMargin}
          lastUpdated={cardsData.lastUpdated}
        />
      </div>
    </main>
  );
}
