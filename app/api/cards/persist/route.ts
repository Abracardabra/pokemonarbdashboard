import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

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

function applyFavorite<T extends Record<string, unknown>>(obj: T, favorite: boolean | undefined): T {
  if (favorite === undefined) return obj;
  if (favorite) return { ...obj, favorite: true };
  const clone: Record<string, unknown> = { ...obj };
  delete clone.favorite;
  return clone as T;
}

function matchesBuilderCard(
  c: Record<string, unknown>,
  cardId: string,
  set: string,
  cardNumber: string
): boolean {
  const setId = String(c?.setId || '');
  const number = String(c?.number || '');
  const exactId = `${setId}:${number}`;
  if (cardId && exactId === cardId) return true;
  if (set && number && String(c?.set || '').toUpperCase() === set.toUpperCase() && number === cardNumber) return true;
  if (setId && number && setId.toUpperCase() === set.toUpperCase() && number === cardNumber) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PersistCardRequest;
    const cardId = String(body.cardId || '').trim();
    const set = String(body.set || '').trim();
    const cardNumber = String(body.cardNumber || '').trim();

    if (!cardId && !(set && cardNumber)) {
      return NextResponse.json(
        { error: 'Provide cardId or (set + cardNumber)' },
        { status: 400 }
      );
    }

    const dataPath = path.join(process.cwd(), 'data', 'prices.json');
    if (!fs.existsSync(dataPath)) {
      return NextResponse.json({ error: 'data/prices.json not found' }, { status: 404 });
    }

    const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as Record<string, unknown>;
    let updated = false;

    // Builder format
    if (Array.isArray(parsed?.cards) && parsed?.meta) {
      const cards = parsed.cards as Array<Record<string, unknown>>;
      parsed.cards = cards.map((c) => {
        if (!matchesBuilderCard(c, cardId, set, cardNumber)) return c;
        updated = true;
        let next = applyFavorite(c, body.favorite);
        if (body.japanToreca) next = { ...next, japanToreca: body.japanToreca };
        if (body.usMarket) next = { ...next, usMarket: body.usMarket };
        if (body.updatedAt) next = { ...next, updatedAt: body.updatedAt };
        return next;
      });
    }

    // Legacy format (favorite only fallback)
    if (!updated && Array.isArray(parsed?.opportunities)) {
      const opportunities = parsed.opportunities as Array<Record<string, unknown>>;
      parsed.opportunities = opportunities.map((c) => {
        const id = String(c?.id || '');
        const setCode = String(c?.set || '');
        const number = String(c?.cardNumber || '');
        const byId = cardId && id === cardId;
        const byFields = set && cardNumber && setCode.toUpperCase() === set.toUpperCase() && number === cardNumber;
        if (!byId && !byFields) return c;
        updated = true;
        return applyFavorite(c, body.favorite);
      });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Card not found in prices.json' }, { status: 404 });
    }

    fs.writeFileSync(dataPath, JSON.stringify(parsed, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to persist card update', message }, { status: 500 });
  }
}

