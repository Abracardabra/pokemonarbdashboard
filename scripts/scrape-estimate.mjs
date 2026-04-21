import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SCRAPE_POLICY, TRACKED_RARITIES, inUsdBudgetRange } = require('../lib/scrape-policy.js');

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
});

function hoursSince(date) {
  return (Date.now() - new Date(date).getTime()) / 36e5;
}

async function main() {
  const cards = await prisma.card.findMany({
    select: {
      id: true,
      rarity: true,
      favorite: true,
      updatedAt: true,
      usMarket: { select: { marketPrice: true } },
    },
  });

  const tracked = cards.filter((c) => TRACKED_RARITIES.includes(c.rarity));
  const inRangeWindow = SCRAPE_POLICY.cadence.inRangeWindowHours;
  const outRangeWindow = SCRAPE_POLICY.cadence.outOfRangeWindowHours;

  const favorites = [];
  const inRange = [];
  const outRange = [];

  for (const card of tracked) {
    const usd = card.usMarket?.marketPrice != null ? Number(card.usMarket.marketPrice) : null;
    const isInRange = inUsdBudgetRange(usd);
    const ageHours = hoursSince(card.updatedAt);

    if (card.favorite) {
      favorites.push(card);
      continue;
    }
    if (isInRange) {
      if (ageHours >= inRangeWindow) inRange.push(card);
      continue;
    }
    if (ageHours >= outRangeWindow) outRange.push(card);
  }

  const cap = SCRAPE_POLICY.capacity.dailyCardCap;
  const favCap = Math.floor(cap * SCRAPE_POLICY.tiers.favoritesShare);
  const inRangeCap = Math.floor(cap * SCRAPE_POLICY.tiers.inRangeShare);
  const outRangeCap = Math.max(0, cap - favCap - inRangeCap);

  const selected =
    Math.min(favorites.length, favCap) +
    Math.min(inRange.length, inRangeCap) +
    Math.min(outRange.length, outRangeCap);

  const estApiCalls = selected; // /api/scrape-v2 call per card
  const estPaidProvidersPerCard = 2; // toretoku + dorasuta
  const estCredits = selected * estPaidProvidersPerCard;
  const minDelay = SCRAPE_POLICY.pacing.minDelayMs;
  const maxDelay = SCRAPE_POLICY.pacing.maxDelayMs;
  const avgDelay = Math.round((minDelay + maxDelay) / 2);
  const estRuntimeMin = Math.round(((selected * avgDelay) / 1000 / 60) * 10) / 10;

  console.log(
    JSON.stringify(
      {
        policy: {
          dailyCardCap: cap,
          minDelayMs: minDelay,
          maxDelayMs: maxDelay,
        },
        pool: {
          totalCards: cards.length,
          trackedCards: tracked.length,
          favoritesDue: favorites.length,
          inRangeDue: inRange.length,
          outRangeDue: outRange.length,
        },
        plan: {
          selectedCards: selected,
          selectedByTier: {
            favorites: Math.min(favorites.length, favCap),
            inRange: Math.min(inRange.length, inRangeCap),
            outRange: Math.min(outRange.length, outRangeCap),
          },
          estimatedApiCalls: estApiCalls,
          estimatedBrowserlessCredits: estCredits,
          estimatedRuntimeMinutes: estRuntimeMin,
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

