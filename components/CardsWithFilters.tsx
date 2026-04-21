'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Loader2, RefreshCw } from 'lucide-react';
import { ArbitrageOpportunity, JapaneseCondition, RarityCode } from '@/lib/types';
import { SCRAPE_POLICY, isPrioritySet as isPrioritySetByPolicy } from '@/lib/scrape-policy';
import {
  applyFilters,
  DEFAULT_FILTERS,
  Era,
  FilterState,
  MarginBucket,
  normalizeSetCode,
} from '@/lib/filters';
import { filterQualityPrices, getBaselinePrice, getBestPriceForQuality } from '@/lib/jp-pricing';

interface CardsWithFiltersProps {
  initialCards: ArbitrageOpportunity[];
  totalCards: number;
  viableOpportunities?: number;
  avgMargin?: number;
  lastUpdated?: string;
}

const TRACKED_SET = 'Multi-set (select sets below)';
const DISPLAY_RARITIES: Array<RarityCode> = ['AR', 'SAR', 'SR', 'CHR', 'UR', 'SSR', 'RRR'];
const DISPLAY_CONDITIONS: Array<JapaneseCondition> = ['A-', 'B'];

// Get card image URL from US price data or fallback to PokemonTCG.io
function getCardImageUrl(card: ArbitrageOpportunity): string {
  if (card.usPrice?.imageCdnUrl) return card.usPrice.imageCdnUrl;
  if (card.usPrice?.imageUrl) return card.usPrice.imageUrl;
  if (card.imageUrl) return card.imageUrl;
  return `https://images.pokemontcg.io/${card.set.toLowerCase()}/${card.cardNumber.split('/')[0]}_hires.png`;
}


function rarityBadgeClass(rarity: RarityCode): string {
  switch (rarity) {
    case 'SAR':
      return 'bg-amber-600';
    case 'UR':
    case 'SSR':
      return 'bg-fuchsia-600';
    case 'SR':
      return 'bg-violet-600';
    case 'AR':
    case 'CHR':
      return 'bg-cyan-600';
    case 'RRR':
      return 'bg-slate-600';
    default:
      return 'bg-gray-600';
  }
}

type ComputedCard = ArbitrageOpportunity & {
  lowestData: ReturnType<typeof getBaselinePrice>;
  usProfitMargin: number;
};

type BulkReloadProgress = {
  total: number;
  completed: number;
  startedAtMs: number;
};

// Reload strategy controls from global policy.
const DAILY_RELOAD_CAP = SCRAPE_POLICY.capacity.dailyCardCap;
const TIER1_SHARE = SCRAPE_POLICY.tiers.favoritesShare;
const TIER2_SHARE = SCRAPE_POLICY.tiers.inRangeShare;
const TIER3_SHARE = SCRAPE_POLICY.tiers.outOfRangeShare;
const MIN_TRACK_USD = SCRAPE_POLICY.budget.minUsd;
const MAX_TRACK_USD = SCRAPE_POLICY.budget.maxUsd;

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function getMarketUsd(card: ArbitrageOpportunity): number | null {
  const n = card.usPrice?.marketPrice ?? null;
  if (n == null || !Number.isFinite(n)) return null;
  return Number(n);
}

function lastUpdatedMs(card: ArbitrageOpportunity): number {
  const ms = Date.parse(String(card.lastUpdated || ''));
  if (!Number.isFinite(ms)) return 0;
  return ms;
}

function oldestFirst(cards: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
  return [...cards].sort((a, b) => lastUpdatedMs(a) - lastUpdatedMs(b));
}

function buildReloadPlan(cards: ArbitrageOpportunity[]): ArbitrageOpportunity[] {

  const favorites = cards.filter((c) => c.favorite === true);
  const nonFavorites = cards.filter((c) => c.favorite !== true);

  const inRangePriority = nonFavorites.filter((c) => {
    const usd = getMarketUsd(c);
    const inRange = usd == null || (usd >= MIN_TRACK_USD && usd <= MAX_TRACK_USD);
    return inRange && isPrioritySetByPolicy(c.set);
  });
  const inRangeOther = nonFavorites.filter((c) => {
    const usd = getMarketUsd(c);
    const inRange = usd == null || (usd >= MIN_TRACK_USD && usd <= MAX_TRACK_USD);
    return inRange && !isPrioritySetByPolicy(c.set);
  });
  const outOfRange = nonFavorites.filter((c) => {
    const usd = getMarketUsd(c);
    if (usd == null) return false;
    return usd < MIN_TRACK_USD || usd > MAX_TRACK_USD;
  });

  const cap = Math.min(cards.length, DAILY_RELOAD_CAP);
  const tier1Limit = Math.floor(cap * TIER1_SHARE);
  const tier2Limit = Math.floor(cap * TIER2_SHARE);
  const tier3Limit = Math.max(0, cap - tier1Limit - tier2Limit);

  const pickedTier1 = oldestFirst(favorites).slice(0, tier1Limit);
  const pickedTier2 = oldestFirst([...inRangePriority, ...inRangeOther]).slice(0, tier2Limit);
  const pickedTier3 = oldestFirst(outOfRange).slice(0, tier3Limit);

  const selected = [...pickedTier1, ...pickedTier2, ...pickedTier3];
  if (selected.length >= cap) return selected.slice(0, cap);

  // Backfill any remaining budget from cards not yet selected.
  const selectedIds = new Set(selected.map((c) => c.id));
  const remaining = oldestFirst(cards.filter((c) => !selectedIds.has(c.id)));
  return [...selected, ...remaining].slice(0, cap);
}

export function CardsWithFilters({ initialCards, lastUpdated }: CardsWithFiltersProps) {
  const [draftFilters, setDraftFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<string>('profit-desc');
  const [jpShop, setJpShop] = useState<'japan-toreca' | 'toretoku' | 'torecacamp' | 'hobibinet' | 'dorasuta' | 'best'>('japan-toreca');
  const [reloadingCardId, setReloadingCardId] = useState<string | null>(null);
  const [favoritePendingCardId, setFavoritePendingCardId] = useState<string | null>(null);
  const [bulkReloading, setBulkReloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkReloadProgress | null>(null);
  const [reloadMessage, setReloadMessage] = useState<string | null>(null);
  const [lastReloadedCardId, setLastReloadedCardId] = useState<string | null>(null);
  const [lastUpdatedOverride, setLastUpdatedOverride] = useState<string | null>(null);
  const [cardOverrides, setCardOverrides] = useState<Record<string, ArbitrageOpportunity>>({});

  const jpSources = useMemo(() => {
    // "best" intentionally excludes non-required shops.
    if (jpShop === 'best') return new Set<string>(['japan-toreca', 'toretoku', 'torecacamp', 'hobibinet', 'dorasuta']);
    return new Set<string>([jpShop]);
  }, [jpShop]);

  async function reloadCardJPAndUS(card: ArbitrageOpportunity): Promise<boolean> {
    // NEW: Uses /api/scrape-v2 to reload all 9 Japanese shops + US price
    // This replaces the old single-shop scraper with the new Browserless-based scraper

    const JPY_TO_USD = 0.0065;
    const setCode = card.set;
    const numberNoSlash = String(card.cardNumber || '').split('/')[0];
    
    console.log('[Reload JP+US] Selected card:', { 
      name: card.name, 
      setCode, 
      cardNumber: card.cardNumber, 
      numberNoSlash, 
      id: card.id 
    });

    setReloadingCardId(card.id);
    setReloadMessage('Reloading all JP shops + US...');
    setLastReloadedCardId(card.id);

    try {
      // NEW: Call the unified scraping endpoint for all 9 shops
      console.log('[Reload JP+US] Calling /api/scrape-v2 for all shops');
      
      const scrapeRes = await fetch('/api/scrape-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id }),
      });

      if (!scrapeRes.ok) {
        const body = await scrapeRes.text().catch(() => '');
        console.warn('[Reload JP+US] Scrape API failed:', { 
          status: scrapeRes.status, 
          body: body.slice(0, 500) 
        });
        setReloadMessage(`Scrape failed: ${scrapeRes.status}`);
        return false;
      }

      const scrapeData = await scrapeRes.json();
      console.log('[Reload JP+US] Scrape response:', {
        success: scrapeData.success,
        offersFound: scrapeData.offers?.length,
        creditsUsed: scrapeData.metrics?.creditsUsed,
        errors: scrapeData.errors?.length,
      });

      // Fetch US market price separately
      const internalUsUrl = `/api/prices?set=${encodeURIComponent(setCode)}&number=${encodeURIComponent(numberNoSlash)}&force=1`;
      console.log('[Reload JP+US] Calling US endpoint:', internalUsUrl);

      async function fetchUSMarket() {
        const res = await fetch(internalUsUrl);
        if (!res.ok) {
          console.warn('[Reload JP+US] US fetch failed:', res.status);
          return null;
        }
        const data = await res.json();
        const first = data?.data?.[0] || null;
        return {
          market: first?.prices?.market ?? null,
          sellers: first?.prices?.sellers ?? null,
          url: first?.tcgPlayerUrl ?? null,
        };
      }

      const us = await fetchUSMarket();
      console.log('[Reload JP+US] US parsed:', { 
        market: us?.market, 
        sellers: us?.sellers 
      });

      // Transform the new offers format to match the UI's expected format
      // The API returns offers grouped by provider, we need to convert to the old format
      const newOffers = scrapeData.offers || [];
      
      // Group offers by source for easier processing
      const offersBySource: Record<string, typeof newOffers> = {};
      for (const offer of newOffers) {
        if (!offersBySource[offer.source]) offersBySource[offer.source] = [];
        offersBySource[offer.source].push(offer);
      }

      // Build updated japanesePrices array from all scraped sources
      const scrapedJpPrices: typeof card.japanesePrices = [];

      for (const [source, offers] of Object.entries(offersBySource)) {
        for (const offer of offers) {
          scrapedJpPrices.push({
            source: offer.source,
            priceJPY: offer.priceJPY,
            priceUSD: Math.round(offer.priceJPY * JPY_TO_USD * 100) / 100,
            quality: offer.condition,
            inStock: offer.inStock,
            url: offer.url,
            isLowest: false, // Will be recalculated
          });
        }
      }

      // Preserve any existing offers that weren't updated (if scrape didn't return data for a shop)
      const updatedSources = new Set(newOffers.map((o: {source: string}) => o.source));
      const preservedOffers = card.japanesePrices.filter(
        (p) => !updatedSources.has(p.source)
      );
      
      // Start from current card values and replace only japan-toreca + US fields.
      const preservedJP = card.japanesePrices.filter((p) => p.source !== 'japan-toreca');
      const normalizeQ = (q: unknown) => String(q || '').toUpperCase().replace('－', '-');
      const oldA = card.japanesePrices.find((p) => p.source === 'japan-toreca' && normalizeQ(p.quality) === 'A-') || null;
      const oldB = card.japanesePrices.find((p) => p.source === 'japan-toreca' && normalizeQ(p.quality) === 'B') || null;

      // Pull fresh japan-toreca entries from the newly scraped offers.
      const jpA = scrapedJpPrices.find((p) => p.source === 'japan-toreca' && normalizeQ(p.quality) === 'A-') || null;
      const jpB = scrapedJpPrices.find((p) => p.source === 'japan-toreca' && normalizeQ(p.quality) === 'B') || null;
      const jpUrlA = jpA?.url ?? null;
      const jpUrlB = jpB?.url ?? null;

      const jpAOk = jpA?.priceJPY != null;
      const jpBOk = jpB?.priceJPY != null;

      const mergeInStock = (extractedInStock: boolean, oldInStock: boolean) => {
        // Safety: if our extraction says OOS but the dataset currently says IN,
        // keep the IN to avoid the card disappearing due to parsing mistakes.
        if (extractedInStock) return true;
        return oldInStock;
      };
      const jpAPrice = jpAOk ? (jpA!.priceJPY as number) : null;
      const jpBPrice = jpBOk ? (jpB!.priceJPY as number) : null;

      const aPrice = jpAOk
        ? ({
            source: 'japan-toreca',
            // Safe because jpAOk guarantees parsed price availability.
            priceJPY: jpAPrice as number,
            priceUSD: Math.round((jpAPrice as number) * JPY_TO_USD * 100) / 100,
            quality: 'A-',
            inStock: mergeInStock(jpA!.inStock, oldA?.inStock ?? false),
            url: jpUrlA ?? oldA?.url ?? '',
            isLowest: false,
          } as typeof card.japanesePrices[number])
        : oldA;

      const bPrice = jpBOk
        ? ({
            source: 'japan-toreca',
            // Safe because jpBOk guarantees parsed price availability.
            priceJPY: jpBPrice as number,
            priceUSD: Math.round((jpBPrice as number) * JPY_TO_USD * 100) / 100,
            quality: 'B',
            inStock: mergeInStock(jpB!.inStock, oldB?.inStock ?? false),
            url: jpUrlB ?? oldB?.url ?? '',
            isLowest: false,
          } as typeof card.japanesePrices[number])
        : oldB;

      const updatedJpPrices = [...preservedJP, ...(aPrice ? [aPrice] : []), ...(bPrice ? [bPrice] : [])];

      // Only override japan-toreca prices if at least one quality fetch succeeded.
      const jpUpdated = jpAOk || jpBOk;

      const updatedUsPrice =
        us && us.market != null
          ? {
              ...(card.usPrice || {
                listingCount: 0,
                currency: 'USD',
                imageUrl: undefined,
                imageCdnUrl: undefined,
                tcgPlayerUrl: undefined,
                sellerCount: 0,
                marketPrice: 0,
              }),
              marketPrice: Number(us.market),
              sellerCount: us.sellers != null ? Number(us.sellers) : 0,
              listingCount: card.usPrice?.listingCount ?? 0,
              currency: card.usPrice?.currency ?? 'USD',
              tcgPlayerUrl: us.url ?? card.usPrice?.tcgPlayerUrl,
            }
          : card.usPrice;

      const updatedTcgplayer =
        us && us.market != null
          ? { marketPrice: Number(us.market), sellerCount: us.sellers != null ? Number(us.sellers) : 0 }
          : card.tcgplayer;

      const baseline = jpUpdated ? getBaselinePrice(updatedJpPrices, jpSources) : getBaselinePrice(card.japanesePrices, jpSources);
      const baselineUSD = baseline.lowestPriceUSD || 0;
      const usMarket = updatedUsPrice?.marketPrice ?? null;
      const usProfitMargin = usMarket != null && baselineUSD > 0 ? Math.round(((usMarket - baselineUSD) / baselineUSD) * 100) : 0;
      const isViable = usProfitMargin > 0;

      setCardOverrides((prev) => ({
        ...prev,
        [card.id]: {
          ...card,
          japanesePrices: jpUpdated ? updatedJpPrices : card.japanesePrices,
          usPrice: updatedUsPrice,
          tcgplayer: updatedTcgplayer,
          lastUpdated: new Date().toISOString(),
          isViable,
        },
      }));

      const jpMsg = jpUpdated
        ? [
            aPrice ? `A- ¥${aPrice.priceJPY} ${aPrice.inStock ? 'IN' : 'OOS'}` : 'A- missing',
            bPrice ? `B ¥${bPrice.priceJPY} ${bPrice.inStock ? 'IN' : 'OOS'}` : 'B missing',
          ].join(', ')
        : 'JP (unchanged)';

      const usMsg = us?.market != null ? `US $${Number(us.market).toFixed(2)} (${us.sellers ?? 0} sellers)` : 'US (unchanged)';
      setReloadMessage(`${jpMsg} | ${usMsg}`);
      setLastUpdatedOverride(new Date().toISOString());

      // Persist refreshed card fields to data/prices.json so updates survive refresh/restart.
      const persistResponse = await fetch('/api/cards/persist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardId: card.id,
          set: card.set,
          cardNumber: card.cardNumber,
          japanToreca: {
            aMinus: aPrice
              ? {
                  priceJPY: aPrice.priceJPY,
                  url: aPrice.url,
                  quality: 'A-' as const,
                  inStock: aPrice.inStock,
                }
              : null,
            b: bPrice
              ? {
                  priceJPY: bPrice.priceJPY,
                  url: bPrice.url,
                  quality: 'B' as const,
                  inStock: bPrice.inStock,
                }
              : null,
          },
          usMarket: {
            tcgplayer: {
              marketPrice: updatedUsPrice?.marketPrice ?? null,
              url: updatedUsPrice?.tcgPlayerUrl ?? null,
              sellerCount: updatedUsPrice?.sellerCount ?? null,
            },
          },
          updatedAt: new Date().toISOString(),
        }),
      });

      if (!persistResponse.ok) {
        const text = await persistResponse.text().catch(() => '');
        console.warn('[Reload JP+US] Persist failed:', persistResponse.status, text.slice(0, 500));
      }
      return jpUpdated || (us?.market != null);
    } catch (err) {
      console.error('[Reload JP+US] Network/parse error:', err);
      setReloadMessage('Reload failed (see console)');
      return false;
    } finally {
      setReloadingCardId(null);
    }
  }

  async function toggleFavorite(card: ArbitrageOpportunity) {
    const nextFavorite = card.favorite !== true;
    setFavoritePendingCardId(card.id);

    try {
      const response = await fetch('/api/cards/persist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardId: card.id,
          set: card.set,
          cardNumber: card.cardNumber,
          favorite: nextFavorite,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('[Favorites] Failed to persist favorite:', response.status, text.slice(0, 500));
        return;
      }

      setCardOverrides((prev) => ({
        ...prev,
        [card.id]: {
          ...card,
          favorite: nextFavorite ? true : undefined,
        },
      }));
    } catch (error) {
      console.error('[Favorites] Request failed:', error);
    } finally {
      setFavoritePendingCardId(null);
    }
  }

  const allSets = useMemo<string[]>(() => {
    return Array.from(new Set(initialCards.map((c) => normalizeSetCode(c.set)))).sort();
  }, [initialCards]);

  const cardsForDisplay = useMemo(() => {
    return initialCards.map((card) => cardOverrides[card.id] ?? card);
  }, [initialCards, cardOverrides]);

  const cardsWithData = useMemo<ComputedCard[]>(() => {
    return cardsForDisplay.map((card) => {
      const lowestData = getBaselinePrice(card.japanesePrices, jpSources);

      const usMarket = card.usPrice?.marketPrice ?? null;
      const baselineUSD = lowestData.lowestPriceUSD || 0;
      const usProfitMargin =
        usMarket != null && baselineUSD > 0 ? Math.round(((usMarket - baselineUSD) / baselineUSD) * 100) : 0;

      return {
        ...card,
        lowestData,
        usProfitMargin,
      };
    });
  }, [cardsForDisplay, jpSources]);

  const filteredCards = useMemo<ComputedCard[]>(() => {
    // 1) Filter
    let cards = applyFilters(cardsWithData, appliedFilters, { jpSources });

    // 2) Sort
    cards = [...cards].sort((a, b) => {
      // Always keep favorites pinned near the top first.
      const favDelta = (b.favorite === true ? 1 : 0) - (a.favorite === true ? 1 : 0);
      if (favDelta !== 0) return favDelta;

      if (sortBy === 'profit-desc') return b.usProfitMargin - a.usProfitMargin;
      if (sortBy === 'profit-asc') return a.usProfitMargin - b.usProfitMargin;
      if (sortBy === 'price-asc') return a.lowestData.lowestPriceJPY - b.lowestData.lowestPriceJPY;
      if (sortBy === 'price-desc') return b.lowestData.lowestPriceJPY - a.lowestData.lowestPriceJPY;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

    return cards;
  }, [cardsWithData, appliedFilters, sortBy]);

  useEffect(() => {
    async function onReloadAllCards() {
      if (bulkReloading) return;
      if (filteredCards.length === 0) {
        setReloadMessage('No cards to reload');
        return;
      }

      const plannedCards = buildReloadPlan(filteredCards);
      if (plannedCards.length > 150) {
        const ok = window.confirm(
          `This will reload ${plannedCards.length} cards (priority strategy) and can take a long time. Continue?`
        );
        if (!ok) return;
      }

      setBulkReloading(true);
      const startedAtMs = Date.now();
      setBulkProgress({
        total: plannedCards.length,
        completed: 0,
        startedAtMs,
      });
      console.log('[Reload All] Starting reload with priority plan:', {
        sourceCards: filteredCards.length,
        plannedCards: plannedCards.length,
        cap: DAILY_RELOAD_CAP,
        usdRange: [MIN_TRACK_USD, MAX_TRACK_USD],
      });

      try {
        for (let i = 0; i < plannedCards.length; i++) {
          const card = plannedCards[i];
          setReloadMessage(`Reloading ${i + 1}/${plannedCards.length}: ${card.name}`);
          await reloadCardJPAndUS(card);
          setBulkProgress((prev) =>
            prev
              ? {
                  ...prev,
                  completed: i + 1,
                }
              : prev
          );
          // Small pacing delay to avoid request bursts.
          await new Promise((resolve) => setTimeout(resolve, 75));
        }
        setReloadMessage(`Reload complete: ${plannedCards.length} cards`);
      } catch (error) {
        console.error('[Reload All] Failed:', error);
        setReloadMessage('Bulk reload failed (see console)');
      } finally {
        setBulkReloading(false);
        setBulkProgress((prev) =>
          prev
            ? {
                ...prev,
                completed: prev.total,
              }
            : prev
        );
      }
    }

    window.addEventListener('reload-all-cards', onReloadAllCards);
    return () => {
      window.removeEventListener('reload-all-cards', onReloadAllCards);
    };
  }, [filteredCards, bulkReloading]);

  const bulkProgressUi = useMemo(() => {
    if (!bulkProgress) return null;
    const { total, completed, startedAtMs } = bulkProgress;
    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    const elapsedMs = Date.now() - startedAtMs;
    const avgPerCardMs = completed > 0 ? elapsedMs / completed : 0;
    const remaining = Math.max(0, total - completed);
    const etaMs = remaining > 0 ? remaining * avgPerCardMs : 0;
    return {
      total,
      completed,
      pct,
      elapsedMs,
      etaMs,
    };
  }, [bulkProgress, reloadMessage, reloadingCardId]);

  return (
    <div>
      {/* Stats */}
      <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 mb-6 text-white">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div>
            <p className="text-sm opacity-75">Set</p>
            <p className="text-lg font-bold">{TRACKED_SET}</p>
          </div>
          <div>
            <p className="text-sm opacity-75">Showing</p>
            <p className="text-2xl font-bold">{filteredCards.length}</p>
          </div>
          <div>
            <p className="text-sm opacity-75 text-emerald-400">JP→US Ops</p>
            <p className="text-2xl font-bold text-emerald-400">{filteredCards.filter((c) => c.isViable).length}</p>
          </div>
          <div>
            <p className="text-sm opacity-75 text-amber-400">Avg Margin</p>
            <p className="text-2xl font-bold text-amber-400">
              {filteredCards.length > 0
                ? (filteredCards.reduce((s, c) => s + c.usProfitMargin, 0) / filteredCards.length).toFixed(1)
                : '0.0'}%
            </p>
          </div>
          <div>
            <p className="text-sm opacity-75">Last Updated</p>
            <p className="text-sm font-mono mt-1">
              {new Date(lastUpdatedOverride || lastUpdated || new Date().toISOString()).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {bulkProgressUi && (
        <div className="bg-white/5 backdrop-blur-md rounded-lg p-4 mb-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/85 text-sm font-semibold">Reload all progress</p>
            <p className="text-white/75 text-sm font-mono">
              {bulkProgressUi.completed}/{bulkProgressUi.total} ({bulkProgressUi.pct}%)
            </p>
          </div>
          <div className="w-full h-2 bg-white/10 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${bulkProgressUi.pct}%` }}
            />
          </div>
          <p className="text-xs text-white/60 mt-2 font-mono">
            Elapsed: {formatDuration(bulkProgressUi.elapsedMs)} | ETA: {formatDuration(bulkProgressUi.etaMs)}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white/5 backdrop-blur-md rounded-lg p-4 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-white/75 text-sm block mb-1">Search</label>
            <input
              type="text"
              placeholder="Card name or number..."
              value={draftFilters.search}
              onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">Era</label>
            <select
              value={draftFilters.era}
              onChange={(e) => setDraftFilters((f) => ({ ...f, era: e.target.value as Era }))}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="ALL" className="bg-gray-900">
                All eras
              </option>
              <option value="SV" className="bg-gray-900">
                SV (Scarlet/Violet)
              </option>
              <option value="S" className="bg-gray-900">
                S (Sword/Shield)
              </option>
              <option value="SM" className="bg-gray-900">
                SM (Sun & Moon)
              </option>
              <option value="M" className="bg-gray-900">
                M (older)
              </option>
            </select>
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">Rarity</label>
            <select
              value={draftFilters.rarity}
              onChange={(e) => setDraftFilters((f) => ({ ...f, rarity: e.target.value }))}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all" className="bg-gray-900">
                All rarities
              </option>
              {DISPLAY_RARITIES.map((r) => (
                <option key={r} value={r} className="bg-gray-900">
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">JP Shop</label>
            <select
              value={jpShop}
              onChange={(e) => setJpShop(e.target.value as any)}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="japan-toreca" className="bg-gray-900">Japan-Toreca</option>
              <option value="toretoku" className="bg-gray-900">Toretoku</option>
              <option value="torecacamp" className="bg-gray-900">Torecacamp</option>
            <option value="hobibinet" className="bg-gray-900">Hobibinet</option>
            <option value="dorasuta" className="bg-gray-900">Dorasuta</option>
              <option value="best" className="bg-gray-900">Best (all)</option>
            </select>
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="profit-desc" className="bg-gray-900">
                Profit % (High to Low)
              </option>
              <option value="profit-asc" className="bg-gray-900">
                Profit % (Low to High)
              </option>
              <option value="price-asc" className="bg-gray-900">
                JP Price: Low to High
              </option>
              <option value="price-desc" className="bg-gray-900">
                JP Price: High to Low
              </option>
              <option value="name" className="bg-gray-900">
                Name
              </option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-white/75 text-sm block mb-1">JP Baseline Price (JPY)</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Min ¥"
                value={draftFilters.jpPriceJPY.min ?? ''}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    jpPriceJPY: { ...f.jpPriceJPY, min: e.target.value === '' ? null : Number(e.target.value) },
                  }))
                }
                className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-500"
              />
              <input
                type="number"
                inputMode="numeric"
                placeholder="Max ¥"
                value={draftFilters.jpPriceJPY.max ?? ''}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    jpPriceJPY: { ...f.jpPriceJPY, max: e.target.value === '' ? null : Number(e.target.value) },
                  }))
                }
                className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-500"
              />
            </div>
            <p className="text-xs text-white/40 mt-1">Baseline prefers in-stock A-, then in-stock B</p>
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">In Stock</label>
            <label className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/80">
              <input
                type="checkbox"
                checked={draftFilters.inStockOnly}
                onChange={(e) => setDraftFilters((f) => ({ ...f, inStockOnly: e.target.checked }))}
                className="accent-emerald-500"
              />
              <span className="text-sm">Only show cards in stock (selected shop)</span>
            </label>
            <p className="text-xs text-white/40 mt-1">If Best (both), requires stock in at least one shop</p>
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">Profit Margin Buckets</label>
            <div className="flex flex-wrap gap-2">
              {(['0-20', '20-40', '40-60', '60+'] as MarginBucket[]).map((b) => (
                <button
                  key={b}
                  onClick={() =>
                    setDraftFilters((f) => ({ ...f, marginBuckets: toggleInList(f.marginBuckets, b) as MarginBucket[] }))
                  }
                  className={`px-3 py-2 rounded border text-sm transition ${
                    draftFilters.marginBuckets.includes(b)
                      ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200'
                      : 'bg-white/10 border-white/20 text-white/70 hover:border-purple-500/50'
                  }`}
                  type="button"
                >
                  {b}%
                </button>
              ))}
            </div>
            <p className="text-xs text-white/40 mt-1">Uses conservative margin (worst A-/B buy price)</p>
          </div>

          <div>
            <label className="text-white/75 text-sm block mb-1">Sets (Include / Exclude)</label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Include */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-white/70 font-semibold">Include (if any ticked)</p>
                  <button
                    type="button"
                    onClick={() => setDraftFilters((f) => ({ ...f, includeSets: [] }))}
                    className="text-xs text-white/60 hover:text-white underline"
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-40 overflow-auto pr-1 space-y-1">
                  {allSets.map((s) => {
                    const checked = draftFilters.includeSets.includes(s);
                    return (
                      <label key={`in-${s}`} className="flex items-center gap-2 text-white/80 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDraftFilters((f) => ({
                              ...f,
                              includeSets: checked ? f.includeSets.filter((x) => x !== s) : [...f.includeSets, s],
                            }))
                          }
                          className="accent-emerald-500"
                        />
                        <span className="font-mono">{s}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Exclude */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-white/70 font-semibold">Exclude</p>
                  <button
                    type="button"
                    onClick={() => setDraftFilters((f) => ({ ...f, excludeSets: [] }))}
                    className="text-xs text-white/60 hover:text-white underline"
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-40 overflow-auto pr-1 space-y-1">
                  {allSets.map((s) => {
                    const checked = draftFilters.excludeSets.includes(s);
                    return (
                      <label key={`ex-${s}`} className="flex items-center gap-2 text-white/80 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDraftFilters((f) => ({
                              ...f,
                              excludeSets: checked ? f.excludeSets.filter((x) => x !== s) : [...f.excludeSets, s],
                            }))
                          }
                          className="accent-purple-500"
                        />
                        <span className="font-mono">{s}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={() => setAppliedFilters(draftFilters)}
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >
                Apply filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftFilters(DEFAULT_FILTERS);
                  setAppliedFilters(DEFAULT_FILTERS);
                }}
                className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white text-sm"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setDraftFilters((f) => ({ ...f, includeSets: [], excludeSets: [] }))}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 text-sm"
              >
                Clear set selections
              </button>
              <button
                type="button"
                onClick={() => setDraftFilters(appliedFilters)}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 text-sm"
              >
                Revert changes
              </button>
            </div>

            <p className="text-xs text-white/40 mt-2">Note: if you tick any Include sets, only those sets will show (minus any Excluded).</p>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCards.map((card) => {
          const imageUrl = getCardImageUrl(card);
          const tcgPlayerUrl = card.usPrice?.tcgPlayerUrl;
          const { lowestData, usProfitMargin } = card;

          // Group JP buy prices by quality (A-/B) for the selected shop(s)
          const jpPrices = filterQualityPrices(card.japanesePrices, jpSources);
          const jpByQuality = DISPLAY_CONDITIONS.map((q) => ({ q, ...getBestPriceForQuality(jpPrices, q, jpSources) }));

          return (
            <div
              key={card.id}
              className="bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-white/20 hover:border-purple-500/50 transition hover:scale-[1.02]"
            >
              {/* Card Image */}
              <div className="relative aspect-[3/4] bg-gradient-to-br from-purple-900/50 to-blue-900/50">
                <Image
                  src={imageUrl}
                  alt={card.name}
                  fill
                  className="object-contain p-2"
                  unoptimized
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (!parent) return;
                    parent.innerHTML = `
                      <div class="flex items-center justify-center h-full text-white/50">
                        <div class="text-center">
                          <div class="text-4xl mb-2">🎴</div>
                          <p class="text-sm">${card.cardNumber}</p>
                        </div>
                      </div>
                    `;
                  }}
                />

                {/* Profit Margin Badge */}
                {card.usPrice && lowestData?.price && (
                  <div className="absolute top-2 right-2">
                    <div
                      className={`px-3 py-1.5 rounded-lg font-bold text-sm shadow-lg ${
                        usProfitMargin > 100
                          ? 'bg-emerald-500 text-white'
                          : usProfitMargin > 50
                            ? 'bg-green-500 text-white'
                            : usProfitMargin > 20
                              ? 'bg-yellow-500 text-black'
                              : 'bg-red-500 text-white'
                      }`}
                    >
                      +{usProfitMargin}%
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-white">{card.name}</h3>
                    <p className="text-sm text-purple-200">
                      {card.set} #{card.cardNumber}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={favoritePendingCardId === card.id}
                        onClick={() => toggleFavorite(card)}
                        className={`px-2 py-1 rounded border text-xs font-semibold transition disabled:opacity-50 ${
                          card.favorite === true
                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                            : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
                        }`}
                        title={card.favorite === true ? 'Remove favorite' : 'Add favorite'}
                      >
                        {favoritePendingCardId === card.id ? '...' : card.favorite === true ? '★' : '☆'}
                      </button>
                      <button
                        type="button"
                        disabled={reloadingCardId === card.id}
                        onClick={() => reloadCardJPAndUS(card)}
                        className="p-1 rounded bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 transition disabled:opacity-50"
                        title="Reload Japan-Toreca (A-/B) + US market price (updates only this card in the UI) and logs URLs + results in the console"
                        aria-label="Reload card prices"
                      >
                        {reloadingCardId === card.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <span className={`text-xs px-2 py-1 rounded font-bold ${rarityBadgeClass(card.rarity)}`}>
                        {card.rarity}
                      </span>
                    </div>
                    {reloadMessage && lastReloadedCardId === card.id && (
                      <p className="text-[11px] text-white/50 font-mono max-w-[160px] break-words text-right">
                        {reloadMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Baseline JP Price */}
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/60 text-sm">Baseline (A- preferred, else B)</p>
                  {lowestData?.price ? (
                    <>
                      <p className="text-2xl font-bold text-emerald-400">¥{lowestData.lowestPriceJPY.toLocaleString()}</p>
                      <p className="text-white/50 text-sm">
                        ~${lowestData.lowestPriceUSD.toFixed(2)}
                        {!lowestData.inStock && <span className="ml-2 text-red-400 font-semibold">Out of Stock</span>}
                      </p>
                      <p className="text-white/40 text-xs mt-1">
                        Using: {lowestData.baselineQuality || String(lowestData.price.quality)}
                      </p>
                    </>
                  ) : (
                    <p className="text-red-400 text-sm">No A- or B listings found</p>
                  )}
                </div>

                {/* US Market */}
                {card.usPrice && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-blue-300 text-sm">TCGPlayer Market</p>
                      {lowestData?.price && (
                        <p
                          className={`text-lg font-bold ${
                            usProfitMargin > 50
                              ? 'text-emerald-400'
                              : usProfitMargin > 20
                                ? 'text-yellow-400'
                                : 'text-red-400'
                          }`}
                        >
                          +{usProfitMargin}%
                        </p>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xl font-bold text-white">${card.usPrice.marketPrice.toFixed(2)}</p>
                      <p className="text-white/50 text-xs">{card.usPrice.sellerCount} sellers</p>
                    </div>
                  </div>
                )}

                {/* Links */}
                <div className="space-y-2 pt-2">
                  {tcgPlayerUrl && (
                    <a
                      href={tcgPlayerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex justify-between items-center bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/40 rounded-lg px-4 py-3 transition"
                    >
                      <span className="text-emerald-300 text-sm font-semibold">TCGPlayer</span>
                      <span className="text-emerald-400 text-xs">View →</span>
                    </a>
                  )}

                  <div className="bg-white/5 rounded-lg p-3 border border-blue-500/20">
                    <p className="text-blue-300 text-sm mb-2">
                      {jpShop === 'best'
                        ? 'JP buy prices (best of all shops)'
                        : jpShop === 'toretoku'
                          ? 'Toretoku'
                          : jpShop === 'torecacamp'
                            ? 'Torecacamp'
                            : jpShop === 'hobibinet'
                              ? 'Hobibinet'
                              : jpShop === 'dorasuta'
                                ? 'Dorasuta'
                            : 'Japan-Toreca'}
                    </p>
                    <div className="space-y-2">
                      {jpByQuality.map(({ q, price, inStock }) => {
                        if (!price) {
                          return (
                            <div key={q} className="flex justify-between items-center text-white/50 text-sm">
                              <span>Condition {q}</span>
                              <span>Not found</span>
                            </div>
                          );
                        }

                        return (
                          <a
                            key={q}
                            href={price.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex justify-between items-center rounded-lg px-3 py-2 transition ${
                              inStock
                                ? 'bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30'
                                : 'bg-gray-600/20 border border-gray-500/30 opacity-70'
                            }`}
                          >
                            <span className="text-white/80 text-sm">
                              Condition {q}
                              {jpShop === 'best' && <span className="ml-2 text-xs text-white/50">({price.source})</span>}
                            </span>
                            <span className="text-white font-semibold">
                              ¥{price.priceJPY.toLocaleString()}
                              {!inStock && <span className="ml-2 text-red-400 text-xs">OOS</span>}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCards.length === 0 && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🎴</div>
          <p className="text-xl text-white/70">No cards match your filters</p>
          <button
            onClick={() => {
              setDraftFilters(DEFAULT_FILTERS);
              setAppliedFilters(DEFAULT_FILTERS);
              setSortBy('profit-desc');
            }}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
