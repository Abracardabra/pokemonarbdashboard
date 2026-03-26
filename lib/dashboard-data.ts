import { prisma } from '@/lib/prisma';
import { baseCardsData } from '@/lib/card-data';
import { ArbitrageOpportunity, DashboardData, JapanesePrice, PriceSource } from '@/lib/types';

const JPY_TO_USD = 0.0065;
const ACTIVE_SOURCES: PriceSource[] = ['japan-toreca', 'toretoku', 'torecacamp', 'hobibinet', 'dorasuta'];

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const cards = await prisma.card.findMany({
      include: {
        usMarket: true,
        japanOffers: true,
      },
      orderBy: [{ setId: 'asc' }, { number: 'asc' }],
    });

    if (!cards.length) {
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

    const opportunities: ArbitrageOpportunity[] = cards.map((card) => {
      const jp = card.japanOffers
        .filter((o) => ACTIVE_SOURCES.includes(o.source as PriceSource))
        .map((o) => ({
          source: o.source as PriceSource,
          priceJPY: o.priceJPY,
          priceUSD: o.priceJPY * JPY_TO_USD,
          quality: o.quality,
          inStock: o.inStock,
          url: o.url,
          isLowest: false,
        }));

      const aMinus = jp.filter((p) => String(p.quality).toUpperCase().replace('－', '-') === 'A-');
      const b = jp.filter((p) => String(p.quality).toUpperCase().replace('－', '-') === 'B');
      const baseline = (aMinus[0] || b[0]) || null;
      const baselineUSD = baseline?.priceUSD || 0;

      const usMarketPrice = card.usMarket?.marketPrice != null ? Number(card.usMarket.marketPrice) : null;
      const usProfitMargin =
        usMarketPrice != null && baselineUSD > 0 ? Math.round(((usMarketPrice - baselineUSD) / baselineUSD) * 100) : 0;

      return {
        id: card.id,
        name: card.name || `${card.set} ${card.number}`,
        cardNumber: card.number,
        rarity: card.rarity as ArbitrageOpportunity['rarity'],
        set: card.set,
        favorite: card.favorite ? true : undefined,
        tcgplayer: {
          marketPrice: usMarketPrice ?? 0,
          sellerCount: card.usMarket?.sellerCount ?? 0,
        },
        japanesePrices: jp,
        lowestJapanesePrice: jp.length > 0 ? Math.min(...jp.map((p) => p.priceJPY)) : 0,
        usPrice:
          usMarketPrice != null
            ? {
                marketPrice: usMarketPrice,
                sellerCount: card.usMarket?.sellerCount ?? 0,
                listingCount: 0,
                currency: 'USD',
                imageUrl: card.imagesSmall || undefined,
                imageCdnUrl: card.imagesLarge || undefined,
                tcgPlayerUrl: card.usMarket?.tcgPlayerUrl || undefined,
              }
            : null,
        arbitrageUS: null,
        marginPercent: usProfitMargin,
        marginAmount: 0,
        lastUpdated: card.updatedAt.toISOString(),
        isViable: usProfitMargin > 0,
        imageUrl: card.imagesSmall || undefined,
        lastKnownPrice: null,
      };
    });

    const newest = cards.reduce<number>((max, c) => Math.max(max, c.updatedAt.getTime()), 0);
    return {
      opportunities,
      lastUpdated: new Date(newest || Date.now()).toISOString(),
      stats: {
        totalCards: opportunities.length,
        viableOpportunities: opportunities.filter((c) => c.isViable).length,
        avgMargin: 0,
      },
    };
  } catch (error) {
    console.warn('[Dashboard] Prisma read failed; using base fallback:', error);
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
}

