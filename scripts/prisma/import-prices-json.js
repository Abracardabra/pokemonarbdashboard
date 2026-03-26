/**
 * One-time importer: loads `data/prices.json` into Postgres using Prisma.
 *
 * "Slow migration" approach:
 * - Keep current JSON as the source of truth for now
 * - Also mirror it into Postgres so we can gradually switch reads later
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Load DATABASE_URL from the repo's .env (plain node does not load it automatically)
require('dotenv').config();

// Prisma Accelerate requires connection hints at runtime.
// We pass `accelerateUrl` explicitly from DATABASE_URL.
const accelerateUrl = process.env.DATABASE_URL;
if (!accelerateUrl) {
  throw new Error('Missing DATABASE_URL in environment (required for Prisma Accelerate).');
}

const prisma = new PrismaClient({ accelerateUrl });

function safeDate(d) {
  const dt = new Date(d);
  return Number.isFinite(dt.getTime()) ? dt : new Date();
}

function toCardId(setId, number) {
  return `${String(setId)}:${String(number)}`;
}

function boolOrDefault(v, defaultValue) {
  if (v === undefined || v === null) return defaultValue;
  return Boolean(v);
}

function toFiniteInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDecimalInput(v) {
  const n = toFiniteNumber(v);
  if (n == null) return null;
  // Use string to avoid binary float artifacts when writing DECIMAL.
  return String(n);
}

function pushIfDefined(xs, x) {
  if (!x) return;
  xs.push(x);
}

function buildBuilderOffers(cardId, card, updatedAt) {
  const offers = [];

  const jt = card.japanToreca;
  if (jt?.aMinus?.url) {
    const priceJPY = toFiniteInt(jt.aMinus.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'japan-toreca',
        quality: 'A-',
        priceJPY,
        inStock: boolOrDefault(jt.aMinus.inStock, true),
        url: jt.aMinus.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }
  if (jt?.b?.url) {
    const priceJPY = toFiniteInt(jt.b.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'japan-toreca',
        quality: 'B',
        priceJPY,
        inStock: boolOrDefault(jt.b.inStock, true),
        url: jt.b.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }

  const tk = card.toretoku;
  if (tk?.a?.url) {
    const priceJPY = toFiniteInt(tk.a.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'toretoku',
        quality: 'A-',
        priceJPY,
        inStock: boolOrDefault(tk.stockA, 1) > 0,
        url: tk.a.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }
  if (tk?.b?.url) {
    const priceJPY = toFiniteInt(tk.b.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'toretoku',
        quality: 'B',
        priceJPY,
        inStock: boolOrDefault(tk.stockB, 1) > 0,
        url: tk.b.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }

  const tca = card.torecacamp;
  if (tca?.aMinus?.url) {
    const priceJPY = toFiniteInt(tca.aMinus.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'torecacamp',
        quality: 'A-',
        priceJPY,
        inStock: boolOrDefault(tca.aMinus.inStock, true),
        url: tca.aMinus.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }
  if (tca?.b?.url) {
    const priceJPY = toFiniteInt(tca.b.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'torecacamp',
        quality: 'B',
        priceJPY,
        inStock: boolOrDefault(tca.b.inStock, true),
        url: tca.b.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }

  const hb = card.hobibinet;
  if (hb?.aMinus?.url) {
    const priceJPY = toFiniteInt(hb.aMinus.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'hobibinet',
        quality: 'A-',
        priceJPY,
        inStock: boolOrDefault(hb.aMinus.inStock, true),
        url: hb.aMinus.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }
  if (hb?.b?.url) {
    const priceJPY = toFiniteInt(hb.b.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'hobibinet',
        quality: 'B',
        priceJPY,
        inStock: boolOrDefault(hb.b.inStock, true),
        url: hb.b.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }

  const dr = card.dorasuta;
  if (dr?.aMinus?.url) {
    const priceJPY = toFiniteInt(dr.aMinus.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'dorasuta',
        quality: 'A-',
        priceJPY,
        inStock: boolOrDefault(dr.aMinus.inStock, true),
        url: dr.aMinus.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }
  if (dr?.b?.url) {
    const priceJPY = toFiniteInt(dr.b.priceJPY);
    if (priceJPY != null) {
      offers.push({
        cardId,
        source: 'dorasuta',
        quality: 'B',
        priceJPY,
        inStock: boolOrDefault(dr.b.inStock, true),
        url: dr.b.url,
        extractedAt: updatedAt,
        updatedAt,
      });
    }
  }

  return offers;
}

async function importBuilderCard(card, globalIdx, totalCards) {
  // Required identity fields
  if (!card?.setId || !card?.number || !card?.set) return;

  const cardId = toCardId(card.setId, card.number);
  const updatedAt = safeDate(card.updatedAt);

  // Upsert card identity + favorite
  await prisma.card.upsert({
    where: { id: cardId },
    update: {
      set: card.set,
      setId: card.setId,
      number: card.number,
      name: card.name || null,
      rarity: card.rarity,
      favorite: card.favorite === true,
      imagesSmall: card.images?.small || null,
      imagesLarge: card.images?.large || null,
      updatedAt,
    },
    create: {
      id: cardId,
      set: card.set,
      setId: card.setId,
      number: card.number,
      name: card.name || null,
      rarity: card.rarity,
      favorite: card.favorite === true,
      imagesSmall: card.images?.small || null,
      imagesLarge: card.images?.large || null,
      updatedAt,
    },
  });

  // Refresh offers/market for this card (simple + idempotent).
  await Promise.all([
    prisma.japanOffer.deleteMany({ where: { cardId } }),
    prisma.usMarket.deleteMany({ where: { cardId } }),
  ]);

  const offers = buildBuilderOffers(cardId, card, updatedAt);
  if (offers.length > 0) {
    await prisma.japanOffer.createMany({ data: offers, skipDuplicates: true });
  }

  const mp = card.usMarket?.tcgplayer?.marketPrice ?? null;
  const sc = card.usMarket?.tcgplayer?.sellerCount ?? null;
  const url = card.usMarket?.tcgplayer?.url ?? null;

  await prisma.usMarket.upsert({
    where: { cardId },
    update: {
      marketPrice: toDecimalInput(mp),
      sellerCount: sc == null ? null : toFiniteInt(sc),
      tcgPlayerUrl: url,
      updatedAt,
    },
    create: {
      cardId,
      marketPrice: toDecimalInput(mp),
      sellerCount: sc == null ? null : toFiniteInt(sc),
      tcgPlayerUrl: url,
      updatedAt,
    },
  });

  if ((globalIdx + 1) % 100 === 0 || globalIdx + 1 === totalCards) {
    console.log(`Import progress: ${globalIdx + 1}/${totalCards}`);
  }
}

async function main() {
  const dataPath = path.join(process.cwd(), 'data', 'prices.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Missing ${path.relative(process.cwd(), dataPath)}`);
  }

  const raw = fs.readFileSync(dataPath, 'utf-8');
  const parsed = JSON.parse(raw);

  const builderCards = Array.isArray(parsed?.cards) && parsed?.meta ? parsed.cards : null;
  const legacyOpps = Array.isArray(parsed?.opportunities) ? parsed.opportunities : null;

  const importLimitRaw = process.env.IMPORT_LIMIT;
  const importLimit = importLimitRaw ? Number(importLimitRaw) : 0;

  // Process concurrency: helps throughput while staying polite to the DB.
  const CONCURRENCY = 5;

  if (builderCards) {
    const totalCards = builderCards.length;
    const effectiveCards = importLimit > 0 ? builderCards.slice(0, importLimit) : builderCards;
    const effectiveTotal = effectiveCards.length;

    if (effectiveCards.length !== totalCards) {
      console.log(`Import limit enabled: ${effectiveTotal}/${totalCards} cards.`);
    }

    for (let i = 0; i < effectiveCards.length; i += CONCURRENCY) {
      const batch = effectiveCards.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((c, batchIdx) => importBuilderCard(c, i + batchIdx, effectiveTotal)));
    }
    console.log(`✅ Prisma import complete (builder): ${effectiveTotal} cards.`);
    return;
  }

  if (legacyOpps) {
    // Legacy path: best-effort import.
    const total = legacyOpps.length;
    for (let i = 0; i < legacyOpps.length; i++) {
      const op = legacyOpps[i];
      if (!op?.id) continue;

      const setId = String(op.id || '').split(':')[0] || op.set;
      const cardId = String(op.id || toCardId(setId, op.cardNumber));
      const updatedAt = safeDate(op.lastUpdated);

      await prisma.card.upsert({
        where: { id: cardId },
        update: {
          set: op.set,
          setId,
          number: op.cardNumber,
          name: op.name || null,
          rarity: op.rarity,
          favorite: op.favorite === true,
          imagesSmall: op.imageUrl || null,
          imagesLarge: null,
          updatedAt,
        },
        create: {
          id: cardId,
          set: op.set,
          setId,
          number: op.cardNumber,
          name: op.name || null,
          rarity: op.rarity,
          favorite: op.favorite === true,
          imagesSmall: op.imageUrl || null,
          imagesLarge: null,
          updatedAt,
        },
      });

      await Promise.all([
        prisma.japanOffer.deleteMany({ where: { cardId } }),
        prisma.usMarket.deleteMany({ where: { cardId } }),
      ]);

      const offers = [];
      for (const p of op.japanesePrices || []) {
        if (!p?.url) continue;
        const priceJPY = toFiniteInt(p.priceJPY);
        if (priceJPY == null) continue;

        offers.push({
          cardId,
          source: p.source,
          quality: String(p.quality || ''),
          priceJPY,
          inStock: Boolean(p.inStock),
          url: p.url,
          extractedAt: updatedAt,
          updatedAt,
        });
      }

      if (offers.length > 0) {
        await prisma.japanOffer.createMany({ data: offers, skipDuplicates: true });
      }

      await prisma.usMarket.upsert({
        where: { cardId },
        update: {
          marketPrice: op.usPrice?.marketPrice ?? null,
          sellerCount: op.usPrice?.sellerCount ?? null,
          tcgPlayerUrl: op.usPrice?.tcgPlayerUrl ?? null,
          updatedAt,
        },
        create: {
          cardId,
          marketPrice: op.usPrice?.marketPrice ?? null,
          sellerCount: op.usPrice?.sellerCount ?? null,
          tcgPlayerUrl: op.usPrice?.tcgPlayerUrl ?? null,
          updatedAt,
        },
      });

      if ((i + 1) % 100 === 0 || i + 1 === total) {
        console.log(`Import progress: ${i + 1}/${total}`);
      }
    }

    console.log(`✅ Prisma import complete (legacy): ${total} opportunities processed.`);
    return;
  }

  throw new Error('Unsupported prices.json shape (expected builder format or legacy opportunities format).');
}

main()
  .catch((err) => {
    console.error('❌ Prisma import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

