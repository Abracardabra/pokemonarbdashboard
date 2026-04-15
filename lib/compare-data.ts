/**
 * Compare Page Data Fetching
 * Fetches card data from PostgreSQL database for shop comparison
 */

import { prisma } from '@/lib/prisma';
import { BuilderDashboardData, BuilderOpportunity, RarityCode } from '@/lib/types';

const JPY_TO_USD = 0.0065;

type JapanOffer = {
  source: string;
  quality: string;
  priceJPY: number;
  url: string;
  inStock: boolean;
};

type UsMarket = {
  marketPrice: unknown;
  tcgPlayerUrl: string | null;
  sellerCount: number | null;
} | null;

type CompareCardRecord = {
  set: string;
  setId: string;
  number: string;
  name: string | null;
  rarity: string;
  favorite: boolean | null;
  imagesSmall: string | null;
  imagesLarge: string | null;
  japanOffers: JapanOffer[];
  usMarket: UsMarket;
  updatedAt: Date;
};

/**
 * Fetch all cards with their Japanese shop prices for comparison
 * Uses the database as the primary source (replaces JSON file)
 */
export async function getCompareData(): Promise<BuilderDashboardData> {
  try {
    // Query all cards with their offers from the database
    const cards = (await prisma.card.findMany({
      include: {
        japanOffers: true,  // All 9 Japanese shops
        usMarket: true,     // TCGPlayer data
      },
      orderBy: [
        { setId: 'asc' },
        { number: 'asc' },
      ],
    })) as CompareCardRecord[];

    // If no cards in database, return empty structure
    if (cards.length === 0) {
      return {
        meta: {
          sets: [],
          rarities: ['AR', 'SAR', 'SR', 'CHR', 'UR', 'SSR', 'RRR'],
          qualities: ['A-', 'B'],
          builtAt: new Date().toISOString(),
        },
        cards: [],
      };
    }

    // Get unique sets for the filter dropdown
    const uniqueSets = [...new Set(cards.map((c: { setId: string }) => c.setId.toUpperCase()))].sort();

    // Transform database records to BuilderOpportunity format
    const builderCards: BuilderOpportunity[] = cards.map((card: CompareCardRecord) => {
      // Helper to find offer by source and quality
      const findOffer = (source: string, quality: string) => {
        const offer = card.japanOffers.find(
          (o: JapanOffer) => o.source === source && o.quality === quality
        );
        if (!offer) return null;
        return {
          priceJPY: offer.priceJPY,
          url: offer.url,
          quality: offer.quality as 'A-' | 'B',
          inStock: offer.inStock,
        };
      };

      // Build the opportunity object
      return {
        set: card.set,
        setId: card.setId,
        number: card.number,
        name: card.name || `${card.set} ${card.number}`,
        rarity: card.rarity as RarityCode,
        favorite: card.favorite || false,
        images: {
          small: card.imagesSmall || undefined,
          large: card.imagesLarge || undefined,
        },

        // Japan-Toreca
        japanToreca: {
          aMinus: findOffer('japan-toreca', 'A-'),
          b: findOffer('japan-toreca', 'B'),
        },

        // Toretoku
        toretoku: {
          a: findOffer('toretoku', 'A-'),
          b: findOffer('toretoku', 'B'),
          stockA: card.japanOffers.find((o: JapanOffer) => o.source === 'toretoku' && o.quality === 'A-')?.inStock
            ? 1
            : 0,
          stockB: card.japanOffers.find((o: JapanOffer) => o.source === 'toretoku' && o.quality === 'B')?.inStock
            ? 1
            : 0,
        },

        // TorecaCamp
        torecacamp: {
          aMinus: findOffer('torecacamp', 'A-'),
          b: findOffer('torecacamp', 'B'),
        },

        // Hobibinet
        hobibinet: {
          aMinus: findOffer('hobibinet', 'A-'),
          b: findOffer('hobibinet', 'B'),
        },

        // Dorasuta
        dorasuta: {
          aMinus: findOffer('dorasuta', 'A-'),
          b: findOffer('dorasuta', 'B'),
        },

        // US Market (TCGPlayer)
        usMarket: {
          tcgplayer: {
            marketPrice: card.usMarket?.marketPrice
              ? Number(card.usMarket.marketPrice)
              : null,
            url: card.usMarket?.tcgPlayerUrl || null,
            sellerCount: card.usMarket?.sellerCount || null,
          },
        },

        updatedAt: card.updatedAt.toISOString(),
      };
    });

    return {
      meta: {
        sets: uniqueSets,
        rarities: ['AR', 'SAR', 'SR', 'CHR', 'UR', 'SSR', 'RRR'],
        qualities: ['A-', 'B'],
        builtAt: new Date().toISOString(),
      },
      cards: builderCards,
    };
  } catch (error) {
    console.error('[Compare Data] Database query failed:', error);

    // Fallback to empty data if database fails
    return {
      meta: {
        sets: [],
        rarities: ['AR', 'SAR', 'SR', 'CHR', 'UR', 'SSR', 'RRR'],
        qualities: ['A-', 'B'],
        builtAt: new Date().toISOString(),
      },
      cards: [],
    };
  }
}
