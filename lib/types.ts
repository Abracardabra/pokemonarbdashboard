export type PriceSource = 'japan-toreca' | 'toretoku' | 'torecacamp' | 'hobibinet' | 'dorasuta' | 'cardrush' | 'playze' | 'c-labo' | 'fukufukutoreka';

export type RarityCode = 'AR' | 'SAR' | 'SR' | 'CHR' | 'UR' | 'SSR' | 'RRR';

export type JapaneseCondition = 'A-' | 'B';

export interface JapanesePrice {
  source: PriceSource;
  priceJPY: number;
  priceUSD: number;
  quality?: JapaneseCondition | string | null;
  inStock: boolean;
  url: string;
  isLowest: boolean;
}

export interface LastKnownPrice {
  priceJPY: number;
  priceUSD: number;
  quality: JapaneseCondition | string;
  date: string;
  inStock: boolean;
  source: PriceSource;
  url: string;
}

export interface TCGPlayerData {
  marketPrice: number;
  sellerCount: number;
}

// New builder dataset shapes
export interface BuilderJapanTorecaPrice {
  priceJPY: number;
  url: string;
  quality: JapaneseCondition;
  inStock?: boolean;
  stock?: number | null;
}

export interface BuilderOpportunity {
  set: string;
  setId: string;
  number: string;
  name: string;
  rarity: RarityCode;
  // Optional persisted pin/favorite marker.
  // If absent, card is considered not favorited.
  favorite?: boolean;
  images?: {
    small?: string | null;
    large?: string | null;
  };
  japanToreca: {
    aMinus: BuilderJapanTorecaPrice | null;
    b: BuilderJapanTorecaPrice | null;
  };
  // New optional JP shop sources
  toretoku?: {
    a: BuilderJapanTorecaPrice | null;
    b: BuilderJapanTorecaPrice | null;
    stockA?: number | null;
    stockB?: number | null;
  };
  torecacamp?: {
    aMinus: BuilderJapanTorecaPrice | null;
    b: BuilderJapanTorecaPrice | null;
  };
  // Legacy field note:
  // `hareruya2` was intentionally removed from active sources.
  // Keep runtime tolerant via JSON parsing, but do not model/use it as an active shop.
  hobibinet?: {
    aMinus: BuilderJapanTorecaPrice | null;
    b: BuilderJapanTorecaPrice | null;
  };
  dorasuta?: {
    aMinus: BuilderJapanTorecaPrice | null;
    b: BuilderJapanTorecaPrice | null;
  };
  usMarket: {
    tcgplayer: {
      marketPrice: number | null;
      url: string | null;
      sellerCount: number | null;
    };
  };
  updatedAt: string;
}

export interface USMarketData {
  marketPrice: number;
  sellerCount: number;
  listingCount: number;
  currency: string;
  imageUrl?: string;
  imageCdnUrl?: string;
  cardName?: string;
  tcgPlayerUrl?: string;
}

// API Response types based on actual API testing
export interface PokemonPrice {
  market: number;
  low: number;
  sellers: number;
  listings: number;
  lastUpdated: string;
}

export interface PokemonCardAPI {
  id: string;
  tcgPlayerId: string;
  setId: number;
  setName: string;
  name: string;
  cardNumber: string;
  rarity: string;
  tcgPlayerUrl: string;
  prices: PokemonPrice;
  imageCdnUrl: string;
  imageCdnUrl200: string;
  imageCdnUrl400: string;
  imageUrl: string;
}

export interface PokemonAPIResponse {
  data: PokemonCardAPI[];
}

export interface ArbitrageUSData {
  profitAmount: number;
  profitPercent: number;
  japanPriceUSD: number;
  usMarketPrice: number;
  isViable: boolean;
  isPotential?: boolean; // True if based on last known price (out of stock)
}

export interface ArbitrageOpportunity {
  id: string;
  name: string;
  cardNumber: string;
  rarity: RarityCode;
  set: string;
  // Optional persisted pin/favorite marker.
  // If absent, card is considered not favorited.
  favorite?: boolean;
  tcgplayer: TCGPlayerData;
  japanesePrices: JapanesePrice[];
  lowestJapanesePrice: number;
  usPrice: USMarketData | null;
  arbitrageUS: ArbitrageUSData | null;
  marginPercent: number;
  marginAmount: number;
  lastUpdated: string;
  isViable: boolean;
  imageUrl?: string;
  lastKnownPrice?: LastKnownPrice | null; // Last known price when all JP sources are out of stock
}

export interface DashboardData {
  opportunities: ArbitrageOpportunity[];
  lastUpdated: string;
  stats: {
    totalCards: number;
    viableOpportunities: number;
    avgMargin: number;
  };
}

export interface BuilderDashboardData {
  meta: {
    sets: string[];
    rarities: RarityCode[];
    qualities: JapaneseCondition[];
    builtAt: string;
  };
  cards: BuilderOpportunity[];
}
