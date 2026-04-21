import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SCRAPE_POLICY, TRACKED_RARITIES, inUsdBudgetRange } = require('../lib/scrape-policy.js');

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
});

const BASE_URL = process.env.SCRAPE_BASE_URL || 'http://localhost:3000';
const DRY_RUN = process.env.SCRAPE_DRY_RUN === '1';

function hoursSince(date) {
  return (Date.now() - new Date(date).getTime()) / 36e5;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const selected = [
    ...shuffle(favorites).slice(0, favCap),
    ...shuffle(inRange).slice(0, inRangeCap),
    ...shuffle(outRange).slice(0, outRangeCap),
  ];

  if (selected.length === 0) {
    console.log(JSON.stringify({ ok: true, dryRun: DRY_RUN, processed: 0, message: 'No due cards' }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const minDelay = SCRAPE_POLICY.pacing.minDelayMs;
  const maxDelay = SCRAPE_POLICY.pacing.maxDelayMs;

  const metrics = {
    processed: 0,
    success: 0,
    failed: 0,
    offers: 0,
    credits: 0,
    errors: [],
  };

  for (let i = 0; i < selected.length; i += 1) {
    const card = selected[i];

    if (!DRY_RUN) {
      const res = await fetch(`${BASE_URL}/api/scrape-v2`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cardId: card.id }),
      });

      const data = await res.json();
      metrics.processed += 1;
      if (data.success) metrics.success += 1;
      else metrics.failed += 1;
      metrics.offers += Array.isArray(data.offers) ? data.offers.length : 0;
      metrics.credits += data?.metrics?.creditsUsed ?? 0;
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        metrics.errors.push({ cardId: card.id, errors: data.errors.slice(0, 3) });
      }
    }

    if (i < selected.length - 1) {
      const waitMs = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      await sleep(waitMs);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: DRY_RUN,
        baseUrl: BASE_URL,
        selectedCards: selected.length,
        tierSelection: {
          favorites: Math.min(favorites.length, favCap),
          inRange: Math.min(inRange.length, inRangeCap),
          outRange: Math.min(outRange.length, outRangeCap),
        },
        metrics,
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

