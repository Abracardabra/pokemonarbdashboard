import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type PersistCardRequest = {
  cardId?: string;
  set?: string;
  cardNumber?: string;
  favorite?: boolean;
  japanToreca?: {
    aMinus: { priceJPY: number; url: string; quality: 'A-'; inStock: boolean } | null;
    b: { priceJPY: number; url: string; quality: 'B'; inStock: boolean } | null;
  };
  usMarket?: {
    tcgplayer: {
      marketPrice: number | null;
      url: string | null;
      sellerCount: number | null;
    };
  };
  updatedAt?: string;
};

function parseCardId(cardId: string): { setId: string; number: string } | null {
  const i = cardId.indexOf(':');
  if (i <= 0 || i >= cardId.length - 1) return null;
  return { setId: cardId.slice(0, i), number: cardId.slice(i + 1) };
}

function normalizeDate(value?: string): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function toDecimalInput(value: number | null): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  // Pass decimal values as strings so Postgres DECIMAL stores exact scale values.
  return String(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PersistCardRequest;
    const cardId = String(body.cardId || '').trim();
    const set = String(body.set || '').trim().toUpperCase();
    const cardNumber = String(body.cardNumber || '').trim();

    if (!cardId && !(set && cardNumber)) {
      return NextResponse.json({ error: 'Provide cardId or (set + cardNumber)' }, { status: 400 });
    }

    let resolvedId = cardId;
    if (!resolvedId) {
      const found = await prisma.card.findFirst({
        where: {
          set,
          number: cardNumber,
        },
        select: { id: true },
      });
      if (!found) {
        return NextResponse.json({ error: 'Card not found in database' }, { status: 404 });
      }
      resolvedId = found.id;
    }

    const idParts = parseCardId(resolvedId);
    if (!idParts) {
      return NextResponse.json({ error: `Invalid cardId format: ${resolvedId}` }, { status: 400 });
    }

    const now = normalizeDate(body.updatedAt);

    const cardUpdate: {
      favorite?: boolean;
      updatedAt?: Date;
    } = {};
    if (typeof body.favorite === 'boolean') {
      cardUpdate.favorite = body.favorite;
    }
    if (body.updatedAt || body.japanToreca || body.usMarket) {
      cardUpdate.updatedAt = now;
    }

    if (Object.keys(cardUpdate).length > 0) {
      await prisma.card.update({
        where: { id: resolvedId },
        data: cardUpdate,
      });
    }

    // Persist Japan-Toreca A-/B offers when provided.
    if (body.japanToreca) {
      const aMinus = body.japanToreca.aMinus;
      const b = body.japanToreca.b;

      if (aMinus) {
        await prisma.japanOffer.upsert({
          where: {
            cardId_source_quality: {
              cardId: resolvedId,
              source: 'japan-toreca',
              quality: 'A-',
            },
          },
          create: {
            cardId: resolvedId,
            source: 'japan-toreca',
            quality: 'A-',
            priceJPY: Number(aMinus.priceJPY),
            inStock: aMinus.inStock !== false,
            url: aMinus.url,
            extractedAt: now,
            updatedAt: now,
          },
          update: {
            priceJPY: Number(aMinus.priceJPY),
            inStock: aMinus.inStock !== false,
            url: aMinus.url,
            extractedAt: now,
            updatedAt: now,
          },
        });
      } else {
        await prisma.japanOffer.deleteMany({
          where: { cardId: resolvedId, source: 'japan-toreca', quality: 'A-' },
        });
      }

      if (b) {
        await prisma.japanOffer.upsert({
          where: {
            cardId_source_quality: {
              cardId: resolvedId,
              source: 'japan-toreca',
              quality: 'B',
            },
          },
          create: {
            cardId: resolvedId,
            source: 'japan-toreca',
            quality: 'B',
            priceJPY: Number(b.priceJPY),
            inStock: b.inStock !== false,
            url: b.url,
            extractedAt: now,
            updatedAt: now,
          },
          update: {
            priceJPY: Number(b.priceJPY),
            inStock: b.inStock !== false,
            url: b.url,
            extractedAt: now,
            updatedAt: now,
          },
        });
      } else {
        await prisma.japanOffer.deleteMany({
          where: { cardId: resolvedId, source: 'japan-toreca', quality: 'B' },
        });
      }
    }

    if (body.usMarket) {
      const m = body.usMarket.tcgplayer;
      await prisma.usMarket.upsert({
        where: { cardId: resolvedId },
        create: {
          cardId: resolvedId,
          marketPrice: toDecimalInput(m.marketPrice),
          sellerCount: m.sellerCount == null ? null : Number(m.sellerCount),
          tcgPlayerUrl: m.url ?? null,
          updatedAt: now,
        },
        update: {
          marketPrice: toDecimalInput(m.marketPrice),
          sellerCount: m.sellerCount == null ? null : Number(m.sellerCount),
          tcgPlayerUrl: m.url ?? null,
          updatedAt: now,
        },
      });
    }

    return NextResponse.json({
      success: true,
      cardId: resolvedId,
      setId: idParts.setId,
      number: idParts.number,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to persist card update', message }, { status: 500 });
  }
}

