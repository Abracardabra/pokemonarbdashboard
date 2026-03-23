/**
 * Global scrape policy for Node scripts (CommonJS).
 *
 * Keep this in sync with `lib/scrape-policy.ts`.
 * This JS file exists so plain Node scripts can consume policy
 * without a TS runtime loader.
 */

function readNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const TRACKED_RARITIES = [
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
];

const SCRAPE_POLICY = {
  budget: {
    minUsd: readNumberEnv('TRACK_MIN_USD', 2),
    maxUsd: readNumberEnv('TRACK_MAX_USD', 100),
    maxJpy: readNumberEnv('TRACK_MAX_JPY', 20_000),
  },
  capacity: {
    dailyCardCap: readNumberEnv('SCRAPE_DAILY_CAP', 300),
  },
  tiers: {
    favoritesShare: readNumberEnv('SCRAPE_TIER_FAVORITES_SHARE', 0.6),
    inRangeShare: readNumberEnv('SCRAPE_TIER_IN_RANGE_SHARE', 0.3),
    outOfRangeShare: readNumberEnv('SCRAPE_TIER_OUT_OF_RANGE_SHARE', 0.1),
  },
  pacing: {
    minDelayMs: readNumberEnv('SCRAPE_DELAY_MIN_MS', 3000),
    maxDelayMs: readNumberEnv('SCRAPE_DELAY_MAX_MS', 9000),
  },
  cadence: {
    inRangeWindowHours: readNumberEnv('SCRAPE_IN_RANGE_WINDOW_HOURS', 48),
    outOfRangeWindowHours: readNumberEnv('SCRAPE_OUT_OF_RANGE_WINDOW_HOURS', 72),
  },
  setPriority: {
    dailyPrefixes: ['M', 'SV'],
    alwaysPrioritySets: ['S12A'],
    lowerFrequencyPrefixes: ['SM', 'S'],
  },
  rarity: {
    tracked: TRACKED_RARITIES,
  },
};

function isPrioritySet(setCode) {
  const s = String(setCode || '').trim().toUpperCase();
  if (SCRAPE_POLICY.setPriority.alwaysPrioritySets.includes(s)) return true;
  return SCRAPE_POLICY.setPriority.dailyPrefixes.some((prefix) => s.startsWith(prefix));
}

function inUsdBudgetRange(usd) {
  if (usd == null || !Number.isFinite(usd)) return true;
  return usd >= SCRAPE_POLICY.budget.minUsd && usd <= SCRAPE_POLICY.budget.maxUsd;
}

module.exports = {
  TRACKED_RARITIES,
  SCRAPE_POLICY,
  isPrioritySet,
  inUsdBudgetRange,
};

