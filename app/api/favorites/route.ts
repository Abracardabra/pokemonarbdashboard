import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

type FavoriteRequest = {
  cardId?: string;
  favorite?: boolean;
};

function applyFavoriteField<T extends Record<string, unknown>>(obj: T, favorite: boolean): T {
  if (favorite) {
    return { ...obj, favorite: true };
  }
  const clone: Record<string, unknown> = { ...obj };
  delete clone.favorite;
  return clone as T;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FavoriteRequest;
    const cardId = String(body.cardId || '').trim();
    const favorite = body.favorite === true;

    if (!cardId) {
      return NextResponse.json({ error: 'Missing required field: cardId' }, { status: 400 });
    }

    const dataPath = path.join(process.cwd(), 'data', 'prices.json');
    if (!fs.existsSync(dataPath)) {
      return NextResponse.json({ error: 'data/prices.json not found' }, { status: 404 });
    }

    const raw = fs.readFileSync(dataPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    let updated = false;

    // Builder format: { meta, cards }
    if (Array.isArray(parsed?.cards) && parsed?.meta) {
      const cards = parsed.cards as Array<Record<string, unknown>>;
      const nextCards = cards.map((c) => {
        const setId = String(c?.setId || '');
        const number = String(c?.number || '');
        const id = `${setId}:${number}`;
        if (id !== cardId) return c;
        updated = true;
        return applyFavoriteField(c, favorite);
      });
      parsed.cards = nextCards;
    }

    // Legacy format: { opportunities, ... }
    if (!updated && Array.isArray(parsed?.opportunities)) {
      const opportunities = parsed.opportunities as Array<Record<string, unknown>>;
      const nextOps = opportunities.map((c) => {
        const id = String(c?.id || '');
        if (id !== cardId) return c;
        updated = true;
        return applyFavoriteField(c, favorite);
      });
      parsed.opportunities = nextOps;
    }

    if (!updated) {
      return NextResponse.json({ error: `Card not found for id: ${cardId}` }, { status: 404 });
    }

    fs.writeFileSync(dataPath, JSON.stringify(parsed, null, 2));
    return NextResponse.json({ success: true, cardId, favorite });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to update favorite', message }, { status: 500 });
  }
}

