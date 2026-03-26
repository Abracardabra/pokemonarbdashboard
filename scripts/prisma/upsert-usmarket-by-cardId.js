/**
 * One-off repair utility:
 * - Finds a single card in data/prices.json by Card.id (format: `${setId}:${number}`)
 * - Ensures there is a corresponding UsMarket row in Postgres
 *
 * Intended for quick validation during "slow migration".
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config();

const targetCardId = process.argv[2] || process.env.TARGET_CARD_ID;
if (!targetCardId) {
  throw new Error('Provide card id as arg or set TARGET_CARD_ID (e.g. "sv11w:104/086").');
}

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL in environment (required for Prisma Accelerate).');
}

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL });

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
  return String(n);
}

function safeDate(d) {
  const dt = new Date(d);
  return Number.isFinite(dt.getTime()) ? dt : new Date();
}

async function main() {
  const dataPath = path.join(process.cwd(), 'data', 'prices.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Missing ${path.relative(process.cwd(), dataPath)}`);
  }

  const raw = fs.readFileSync(dataPath, 'utf-8');
  const parsed = JSON.parse(raw);

  const builderCards = Array.isArray(parsed?.cards) && parsed?.meta ? parsed.cards : null;
  if (!builderCards) {
    throw new Error('Unsupported prices.json shape (expected builder format).');
  }

  const [setId, ...numberParts] = String(targetCardId).split(':');
  const number = numberParts.join(':');
  const found = builderCards.find((c) => String(c?.setId) === String(setId) && String(c?.number) === String(number));
  if (!found) {
    throw new Error(`Card not found in data/prices.json: ${targetCardId}`);
  }

  const updatedAt = safeDate(found.updatedAt);
  const mp = found.usMarket?.tcgplayer?.marketPrice ?? null;
  const sc = found.usMarket?.tcgplayer?.sellerCount ?? null;
  const url = found.usMarket?.tcgplayer?.url ?? null;

  await prisma.usMarket.upsert({
    where: { cardId: targetCardId },
    update: {
      marketPrice: toDecimalInput(mp),
      sellerCount: sc == null ? null : toFiniteInt(sc),
      tcgPlayerUrl: url,
      updatedAt,
    },
    create: {
      cardId: targetCardId,
      marketPrice: toDecimalInput(mp),
      sellerCount: sc == null ? null : toFiniteInt(sc),
      tcgPlayerUrl: url,
      updatedAt,
    },
  });

  console.log(`✅ Upserted UsMarket for ${targetCardId}`);
}

main()
  .catch((err) => {
    console.error('❌ Repair failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

