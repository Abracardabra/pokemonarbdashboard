import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type FavoriteRequest = {
  cardId?: string;
  favorite?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FavoriteRequest;
    const cardId = String(body.cardId || '').trim();
    const favorite = body.favorite === true;

    if (!cardId) {
      return NextResponse.json({ error: 'Missing required field: cardId' }, { status: 400 });
    }

    const exists = await prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: `Card not found for id: ${cardId}` }, { status: 404 });
    }

    await prisma.card.update({
      where: { id: cardId },
      data: {
        favorite,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, cardId, favorite });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to update favorite', message }, { status: 500 });
  }
}

