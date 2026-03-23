'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { BuilderDashboardData, BuilderOpportunity, JapaneseCondition } from '@/lib/types';

const JPY_TO_USD = 0.0065;

type Mode = 'set' | 'card';

type ShopKey = 'japan-toreca' | 'toretoku' | 'torecacamp' | 'hobibinet' | 'dorasuta';

type Offer = {
  shop: ShopKey;
  condition: JapaneseCondition;
  priceJPY: number;
  inStock: boolean;
  url: string;
};

function profitPercent(usMarket: number | null, jpPriceJPY: number | null): number | null {
  if (usMarket == null || jpPriceJPY == null || jpPriceJPY <= 0) return null;
  const jpUsd = jpPriceJPY * JPY_TO_USD;
  if (jpUsd <= 0) return null;
  return Math.round(((usMarket - jpUsd) / jpUsd) * 100);
}

function formatUSD(n: number): string {
  try {
    return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function formatPct(n: number | null): string {
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n}%`;
}

function profitTone(n: number | null): string {
  if (n == null) return 'text-white/50';
  if (n >= 25) return 'text-emerald-300';
  if (n >= 0) return 'text-emerald-200';
  return 'text-red-300';
}

const CONDITIONS: JapaneseCondition[] = ['A-', 'B'];

function normalizeSetCode(s: string): string {
  return String(s || '').trim().toUpperCase();
}

function getCardImageUrl(card: BuilderOpportunity): string {
  const small = card.images?.small || null;
  const large = card.images?.large || null;
  return small || large || `https://images.pokemontcg.io/${card.set.toLowerCase()}/${card.number.split('/')[0]}_hires.png`;
}

function offersForCard(card: BuilderOpportunity): Offer[] {
  const out: Offer[] = [];

  if (card.japanToreca?.aMinus) {
    out.push({
      shop: 'japan-toreca',
      condition: 'A-',
      priceJPY: card.japanToreca.aMinus.priceJPY,
      inStock: card.japanToreca.aMinus.inStock !== false,
      url: card.japanToreca.aMinus.url,
    });
  }
  if (card.japanToreca?.b) {
    out.push({
      shop: 'japan-toreca',
      condition: 'B',
      priceJPY: card.japanToreca.b.priceJPY,
      inStock: card.japanToreca.b.inStock !== false,
      url: card.japanToreca.b.url,
    });
  }

  if (card.toretoku?.a) {
    out.push({
      shop: 'toretoku',
      condition: 'A-',
      priceJPY: card.toretoku.a.priceJPY,
      inStock: (card.toretoku.stockA ?? 1) > 0,
      url: card.toretoku.a.url,
    });
  }
  if (card.toretoku?.b) {
    out.push({
      shop: 'toretoku',
      condition: 'B',
      priceJPY: card.toretoku.b.priceJPY,
      inStock: (card.toretoku.stockB ?? 1) > 0,
      url: card.toretoku.b.url,
    });
  }

  if (card.torecacamp?.aMinus) {
    out.push({
      shop: 'torecacamp',
      condition: 'A-',
      priceJPY: card.torecacamp.aMinus.priceJPY,
      inStock: card.torecacamp.aMinus.inStock !== false,
      url: card.torecacamp.aMinus.url,
    });
  }
  if (card.torecacamp?.b) {
    out.push({
      shop: 'torecacamp',
      condition: 'B',
      priceJPY: card.torecacamp.b.priceJPY,
      inStock: card.torecacamp.b.inStock !== false,
      url: card.torecacamp.b.url,
    });
  // Hobibinet (A- and B)
  if (card.hobibinet?.aMinus) {
    out.push({
      shop: 'hobibinet',
      condition: 'A-',
      priceJPY: card.hobibinet.aMinus.priceJPY,
      inStock: card.hobibinet.aMinus.inStock !== false,
      url: card.hobibinet.aMinus.url,
    });
  }
  if (card.hobibinet?.b) {
    out.push({
      shop: 'hobibinet',
      condition: 'B',
      priceJPY: card.hobibinet.b.priceJPY,
      inStock: card.hobibinet.b.inStock !== false,
      url: card.hobibinet.b.url,
    });
  }

  // Dorasuta (A- and B)
  if (card.dorasuta?.aMinus) {
    out.push({
      shop: 'dorasuta',
      condition: 'A-',
      priceJPY: card.dorasuta.aMinus.priceJPY,
      inStock: card.dorasuta.aMinus.inStock !== false,
      url: card.dorasuta.aMinus.url,
    });
  }
  if (card.dorasuta?.b) {
    out.push({
      shop: 'dorasuta',
      condition: 'B',
      priceJPY: card.dorasuta.b.priceJPY,
      inStock: card.dorasuta.b.inStock !== false,
      url: card.dorasuta.b.url,
    });
  }
  }

  return out;
}

function pickBaseline(offers: Offer[], shops: Set<ShopKey>): Offer | null {
  const filtered = offers.filter((o) => shops.has(o.shop));

  const sortByPrice = (xs: Offer[]) => xs.slice().sort((a, b) => a.priceJPY - b.priceJPY);

  const pick = (condition: JapaneseCondition, wantInStock: boolean) =>
    sortByPrice(filtered.filter((o) => o.condition === condition && o.inStock === wantInStock))[0] || null;

  return pick('A-', true) || pick('B', true) || pick('A-', false) || pick('B', false);
}

function pickLowestForCondition(offers: Offer[], shops: Set<ShopKey>, condition: JapaneseCondition): Offer | null {
  const filtered = offers.filter((o) => shops.has(o.shop) && o.condition === condition);
  const inStock = filtered.filter((o) => o.inStock).sort((a, b) => a.priceJPY - b.priceJPY);
  if (inStock.length > 0) return inStock[0];
  const oos = filtered.filter((o) => !o.inStock).sort((a, b) => a.priceJPY - b.priceJPY);
  return oos[0] || null;
}

function formatJPY(n: number): string {
  try {
    return `¥${n.toLocaleString()}`;
  } catch {
    return `¥${n}`;
  }
}

export function CompareClient({ builder }: { builder: BuilderDashboardData | null }) {
  const sets = useMemo(() => {
    const xs = builder?.meta?.sets || [];
    return xs.map(normalizeSetCode).sort();
  }, [builder]);

  const [mode, setMode] = useState<Mode>('set');
  const [setCode, setSetCode] = useState<string>('S12A');
  const [query, setQuery] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);

  const cardsForSet = useMemo(() => {
    const all = builder?.cards || [];
    const wanted = normalizeSetCode(setCode);
    return all.filter((c) => normalizeSetCode(c.setId) === wanted || normalizeSetCode(c.set) === wanted);
  }, [builder, setCode]);

  const visibleCards = useMemo(() => {
    let cards = cardsForSet;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      cards = cards.filter((c) => String(c.name || '').toLowerCase().includes(q) || String(c.number || '').toLowerCase().includes(q));
    }

    if (inStockOnly) {
      cards = cards.filter((c) => offersForCard(c).some((o) => o.inStock));
    }

    return cards;
  }, [cardsForSet, query, inStockOnly]);

  const [selectedCardId, setSelectedCardId] = useState<string>('');

  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    return visibleCards.find((c) => `${c.setId}:${c.number}` === selectedCardId) || null;
  }, [visibleCards, selectedCardId]);

  // Keep this list aligned with required active sources only.
  const activeShops = useMemo(() => new Set<ShopKey>(['japan-toreca', 'toretoku', 'torecacamp', 'hobibinet', 'dorasuta']), []);

  if (!builder) {
    return <p className="text-white/70">No builder dataset loaded.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white/5 backdrop-blur-md rounded-lg p-4 border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-white/75 text-sm block mb-1">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="set" className="bg-gray-900">By set</option>
              <option value="card" className="bg-gray-900">By card</option>
            </select>
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">Set</label>
            <select
              value={setCode}
              onChange={(e) => {
                setSetCode(e.target.value);
                setSelectedCardId('');
              }}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              {sets.map((s) => (
                <option key={s} value={s} className="bg-gray-900">{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or number…"
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">In Stock</label>
            <label className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="accent-emerald-500"
              />
              <span className="text-sm">In stock only</span>
            </label>
          </div>
        </div>

        {mode === 'card' && (
          <div className="mt-4">
            <label className="text-white/75 text-sm block mb-1">Select card</label>
            <select
              value={selectedCardId}
              onChange={(e) => setSelectedCardId(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="" className="bg-gray-900">Pick a card…</option>
              {visibleCards.map((c) => {
                const id = `${c.setId}:${c.number}`;
                return (
                  <option key={id} value={id} className="bg-gray-900">
                    {c.name} — {c.number}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {mode === 'card' ? (
        selectedCard ? (
          <CompareCardRow card={selectedCard} shops={activeShops} />
        ) : (
          <p className="text-white/60 text-sm">Pick a card to compare.</p>
        )
      ) : (
        <div className="space-y-3">
          {visibleCards.map((c) => (
            <CompareCardRow key={`${c.setId}:${c.number}`} card={c} shops={activeShops} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function PriceCell({
  offer,
  isBaseline,
  isLowest,
  isShopBest,
  usMarket,
}: {
  offer: Offer | null;
  isBaseline: boolean;
  isLowest: boolean;
  isShopBest: boolean;
  usMarket: number | null;
}) {
  if (!offer) {
    return <div className="text-white/30 text-xs">—</div>;
  }

  const base = offer.inStock ? 'bg-white/5 border-white/10' : 'bg-gray-700/10 border-gray-500/20 opacity-70';

  // Priority: overall baseline > shop best pick > lowest per-condition
  const outline =
    isBaseline ? 'border-emerald-500/60' : isShopBest ? 'border-amber-400/60' : isLowest ? 'border-blue-500/50' : '';

  const p = profitPercent(usMarket, offer.priceJPY);

  return (
    <a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg border px-3 py-2 transition hover:bg-white/10 ${base} ${outline}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-white/80 text-sm font-semibold">{formatJPY(offer.priceJPY)}</span>
        {!offer.inStock && <span className="text-xs text-red-300">OOS</span>}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-white/40">Profit</span>
        <span className={`text-xs font-semibold ${profitTone(p)}`}>{formatPct(p)}</span>
      </div>
      <div className="text-xs text-white/40 mt-1">Open →</div>
    </a>
  );
}

function CompareCardRow({ card, shops, compact }: { card: BuilderOpportunity; shops: Set<ShopKey>; compact?: boolean }) {
  const offers = offersForCard(card);
  const baseline = pickBaseline(offers, shops);
  const lowestA = pickLowestForCondition(offers, shops, 'A-');
  const lowestB = pickLowestForCondition(offers, shops, 'B');

  const usMarket = card.usMarket?.tcgplayer?.marketPrice ?? null;
  const usUrl = card.usMarket?.tcgplayer?.url ?? null;
  const usSellers = card.usMarket?.tcgplayer?.sellerCount ?? null;

  const baselineProfit = baseline ? profitPercent(usMarket, baseline.priceJPY) : null;

  const get = (shop: ShopKey, condition: JapaneseCondition) => {
    const xs = offers.filter((o) => o.shop === shop && o.condition === condition);
    if (xs.length === 0) return null;
    // Prefer in-stock for display
    return xs.find((o) => o.inStock) || xs[0];
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/15 overflow-hidden">
      <div className="p-4">
        <div className="flex gap-4">
          <div className="relative w-16 h-20 shrink-0 rounded bg-white/5 overflow-hidden">
            <Image src={getCardImageUrl(card)} alt={card.name} fill className="object-contain p-1" unoptimized />
          </div>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-white font-bold truncate">{card.name}</p>
                <p className="text-purple-200 text-sm">{card.set} #{card.number}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-white/50">US (TCGPlayer Market)</p>
                {usMarket != null ? (
                  usUrl ? (
                    <a
                      href={usUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white text-sm font-bold hover:underline"
                    >
                      {formatUSD(usMarket)}
                    </a>
                  ) : (
                    <p className="text-white text-sm font-bold">{formatUSD(usMarket)}</p>
                  )
                ) : (
                  <p className="text-white/40 text-sm font-bold">—</p>
                )}
                {usMarket != null && usSellers != null && <p className="text-xs text-white/40">{usSellers} sellers</p>}

                <p className="text-xs text-white/50 mt-2">Overall baseline</p>
                {baseline ? (
                  <p className="text-emerald-300 text-sm font-bold">
                    {baseline.shop} {baseline.condition} {formatJPY(baseline.priceJPY)}{baseline.inStock ? '' : ' (OOS)'}
                    <span className={`ml-2 ${profitTone(baselineProfit)} font-semibold`}>({formatPct(baselineProfit)})</span>
                  </p>
                ) : (
                  <p className="text-white/40 text-sm">—</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
              {(['japan-toreca', 'toretoku', 'torecacamp', 'hobibinet', 'dorasuta'] as ShopKey[]).map((shop) => {
                const shopBest = pickBaseline(offers, new Set<ShopKey>([shop]));
                const shopBestProfit = shopBest ? profitPercent(usMarket, shopBest.priceJPY) : null;

                return (
                  <div key={shop} className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-white/70 text-sm font-semibold">{shop}</p>
                      <p className={`text-xs font-semibold ${profitTone(shopBestProfit)}`}>{formatPct(shopBestProfit)}</p>
                    </div>
                    <p className="text-xs text-white/45 mb-2">
                      Best pick: {shopBest ? `${shopBest.condition} ${formatJPY(shopBest.priceJPY)}${shopBest.inStock ? '' : ' (OOS)'}` : '—'}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {CONDITIONS.map((cond) => {
                        const offer = get(shop, cond);
                        const isBaseline = Boolean(
                          baseline && offer && baseline.shop === offer.shop && baseline.condition === offer.condition && baseline.priceJPY === offer.priceJPY
                        );
                        const isLowest = Boolean(
                          (cond === 'A-' && lowestA && offer && lowestA.shop === offer.shop && lowestA.priceJPY === offer.priceJPY) ||
                            (cond === 'B' && lowestB && offer && lowestB.shop === offer.shop && lowestB.priceJPY === offer.priceJPY)
                        );
                        const isShopBest = Boolean(
                          shopBest && offer && shopBest.shop === offer.shop && shopBest.condition === offer.condition && shopBest.priceJPY === offer.priceJPY
                        );
                        return (
                          <div key={cond}>
                            <div className="text-xs text-white/40 mb-1">{cond}</div>
                            <PriceCell
                              offer={offer}
                              isBaseline={isBaseline}
                              isLowest={isLowest}
                              isShopBest={isShopBest}
                              usMarket={usMarket}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
