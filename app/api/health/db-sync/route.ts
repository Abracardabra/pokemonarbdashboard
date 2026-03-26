import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [cards, usMarket, japanOffers, withUs] = await Promise.all([
      prisma.card.count(),
      prisma.usMarket.count(),
      prisma.japanOffer.count(),
      prisma.card.count({ where: { usMarket: { isNot: null } } }),
    ]);

    const healthy = cards > 0 && withUs === cards;
    return NextResponse.json({
      ok: healthy,
      sourceOfTruth: 'postgres',
      stats: {
        cards,
        usMarket,
        japanOffers,
        cardsWithUs: withUs,
        cardsMissingUs: Math.max(0, cards - withUs),
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        sourceOfTruth: 'postgres',
        error: 'DB sync check failed',
        message,
        checkedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

