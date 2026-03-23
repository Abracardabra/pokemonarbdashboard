/**
 * Global scrape policy (single source of truth).
 *
 * Keep all operational knobs here so scripts and UI can share
 * the same rules without config drift.
 */

export const TRACKED_RARITIES = [
  'P',
  'S',
  'RR',
  'RRR',
  'AR',
  'SAR',
  'SR',
  'SSR',
  'UR',
  'CHR',
  'CSR',
  'HR',
  'ACE',
  'MA',
] as const;

export type TrackedRarity = (typeof TRACKED_RARITIES)[number];

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const SCRAPE_POLICY = {
  // Budget ranges for prioritization and filtering.
  budget: {
    minUsd: readNumberEnv('TRACK_MIN_USD', 2),
    maxUsd: readNumberEnv('TRACK_MAX_USD', 100),
    // Optional alternative budget cap in JPY.
    maxJpy: readNumberEnv('TRACK_MAX_JPY', 20_000),
  },

  // Daily processing target for stable scraping.
  capacity: {
    dailyCardCap: readNumberEnv('SCRAPE_DAILY_CAP', 300),
  },

  // Tier split for scheduling.
  tiers: {
    favoritesShare: readNumberEnv('SCRAPE_TIER_FAVORITES_SHARE', 0.6),
    inRangeShare: readNumberEnv('SCRAPE_TIER_IN_RANGE_SHARE', 0.3),
    outOfRangeShare: readNumberEnv('SCRAPE_TIER_OUT_OF_RANGE_SHARE', 0.1),
  },

  // Runtime pacing to reduce rate-limit collisions.
  pacing: {
    minDelayMs: readNumberEnv('SCRAPE_DELAY_MIN_MS', 3000),
    maxDelayMs: readNumberEnv('SCRAPE_DELAY_MAX_MS', 9000),
  },

  // Rolling refresh cadence.
  cadence: {
    inRangeWindowHours: readNumberEnv('SCRAPE_IN_RANGE_WINDOW_HOURS', 48),
    outOfRangeWindowHours: readNumberEnv('SCRAPE_OUT_OF_RANGE_WINDOW_HOURS', 72),
  },

  // Set-level prioritization.
  setPriority: {
    dailyPrefixes: ['M', 'SV'] as const,
    alwaysPrioritySets: ['S12A'] as const,
    lowerFrequencyPrefixes: ['SM', 'S'] as const,
  },

  // Rarity contract.
  rarity: {
    tracked: TRACKED_RARITIES,
  },
} as const;

export function isPrioritySet(setCode: string): boolean {
  const s = String(setCode || '').trim().toUpperCase();
  if (SCRAPE_POLICY.setPriority.alwaysPrioritySets.includes(s as (typeof SCRAPE_POLICY.setPriority.alwaysPrioritySets)[number])) {
    return true;
  }
  return SCRAPE_POLICY.setPriority.dailyPrefixes.some((prefix) => s.startsWith(prefix));
}

export function inUsdBudgetRange(usd: number | null | undefined): boolean {
  if (usd == null || !Number.isFinite(usd)) return true;
  return usd >= SCRAPE_POLICY.budget.minUsd && usd <= SCRAPE_POLICY.budget.maxUsd;
}

