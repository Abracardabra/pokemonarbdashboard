# Frontend Integration Guide

This document shows how to consume the scraper output JSON in your frontend.

## API Endpoint

```
GET /api/scrape-v2  # Health check
POST /api/scrape-v2  # Scrape specific cards
```

## Sample Output

The scraper produces clean JSON (see `data/scrape_output_sample.json`):

```json
{
  "timestamp": "2026-03-23T00:00:00Z",
  "meta": {
    "totalCards": 5,
    "totalSites": 9,
    "strategy": "FREE direct scraping for Shopify sites, PAID Browserless for Cloudflare sites",
    "estimatedSavings": "70% of requests use free direct scraping"
  },
  "cards": [
    {
      "card": {
        "set": "SV3",
        "setId": "sv3",
        "number": "139/108",
        "name": "Charizard ex",
        "rarity": "SR",
        "jpnName": "リザードンex",
        "searchKeyword": "リザードンex 139"
      },
      "results": {
        "japanToreca": {
          "site": "Japan-Toreca",
          "status": "success",
          "method": "shopify_json",
          "cost": 0,
          "currency": "JPY",
          "listings": [
            {
              "condition": "A-",
              "price": 14000,
              "available": true,
              "url": "https://shop.japan-toreca.com/products/pokemon-18960-a-damaged",
              "lastUpdated": "2026-03-23T00:00:00Z"
            },
            {
              "condition": "B",
              "price": 11000,
              "available": true,
              "url": "https://shop.japan-toreca.com/products/pokemon-18960-b",
              "lastUpdated": "2026-03-23T00:00:00Z"
            }
          ],
          "lowestPrice": 11000,
          "highestPrice": 14000
        },
        // ... other sites
      },
      "summary": {
        "totalListings": 11,
        "lowestPrice": 250,
        "highestPrice": 14000,
        "averagePrice": 7264,
        "sitesWithStock": 8,
        "totalCreditsUsed": 2
      }
    }
  ],
  "summary": {
    "totalCards": 5,
    "totalSitesAttempted": 45,
    "totalSitesSuccessful": 32,
    "totalListings": 43,
    "totalCreditsUsed": 10,
    "creditsSaved": 35,
    "savingsPercentage": "77.8%",
    "priceRange": {
      "lowest": 250,
      "highest": 33000
    }
  }
}
```

## React Component Example

### Types

```typescript
// types/scraper.ts

export interface Card {
  set: string;
  setId: string;
  number: string;
  name: string;
  rarity: string;
  jpnName: string;
  searchKeyword: string;
}

export interface Listing {
  condition: string;
  price: number;
  available: boolean;
  url: string;
  lastUpdated: string;
}

export interface SiteResult {
  site: string;
  siteKey: string;
  status: 'success' | 'not_found' | 'pending' | 'error';
  method: string;
  cost: number;
  currency: string;
  listings: Listing[];
  lowestPrice?: number;
  highestPrice?: number;
  error?: string;
}

export interface CardResult {
  card: Card;
  results: Record<string, SiteResult>;
  summary: {
    totalListings: number;
    lowestPrice: number;
    highestPrice: number;
    averagePrice: number;
    sitesWithStock: number;
    totalCreditsUsed: number;
  };
}

export interface ScrapeOutput {
  timestamp: string;
  meta: {
    totalCards: number;
    totalSites: number;
    strategy: string;
    estimatedSavings: string;
  };
  cards: CardResult[];
  summary: {
    totalCards: number;
    totalSitesAttempted: number;
    totalSitesSuccessful: number;
    totalListings: number;
    totalCreditsUsed: number;
    creditsSaved: number;
    savingsPercentage: string;
    priceRange: {
      lowest: number;
      highest: number;
    };
  };
}
```

### CardPriceTable Component

```tsx
// components/CardPriceTable.tsx
import React from 'react';
import { CardResult, SiteResult, Listing } from '@/types/scraper';

interface Props {
  data: CardResult;
}

export const CardPriceTable: React.FC<Props> = ({ data }) => {
  const { card, results, summary } = data;

  // Flatten all listings across sites
  const allListings = Object.entries(results).flatMap(([siteKey, site]) =>
    site.listings.map(listing => ({
      ...listing,
      site: site.site,
      siteKey,
      cost: site.cost
    }))
  ).sort((a, b) => a.price - b.price);

  // Get available listings only
  const availableListings = allListings.filter(l => l.available);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">{card.name}</h2>
          <p className="text-gray-600">
            {card.set} {card.number} • {card.rarity}
          </p>
          <p className="text-sm text-gray-500">{card.jpnName}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-green-600">
            ¥{summary.lowestPrice.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">
            lowest of {summary.sitesWithStock} sites
          </div>
        </div>
      </div>

      {/* Price Comparison Table */}
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left">Site</th>
            <th className="px-4 py-2 text-center">Condition</th>
            <th className="px-4 py-2 text-right">Price</th>
            <th className="px-4 py-2 text-center">Stock</th>
            <th className="px-4 py-2 text-center">Cost</th>
          </tr>
        </thead>
        <tbody>
          {availableListings.map((listing, idx) => (
            <tr key={idx} className="border-t">
              <td className="px-4 py-3">
                <a 
                  href={listing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {listing.site}
                </a>
              </td>
              <td className="px-4 py-3 text-center">
                <span className={`px-2 py-1 rounded text-xs ${
                  listing.condition === 'A-' ? 'bg-green-100 text-green-800' :
                  listing.condition === 'B' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {listing.condition}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-medium">
                ¥{listing.price.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center">
                <span className="text-green-600">●</span>
              </td>
              <td className="px-4 py-3 text-center text-xs">
                {listing.cost === 0 ? (
                  <span className="text-green-600">FREE</span>
                ) : (
                  <span className="text-orange-600">{listing.cost} credit</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Footer */}
      <div className="mt-4 pt-4 border-t text-sm text-gray-500 flex justify-between">
        <span>
          {summary.totalListings} total listings • {summary.sitesWithStock} sites with stock
        </span>
        <span>
          Credits used: {summary.totalCreditsUsed}
        </span>
      </div>
    </div>
  );
};
```

### ScraperDashboard Component

```tsx
// components/ScraperDashboard.tsx
import React, { useState, useEffect } from 'react';
import { ScrapeOutput } from '@/types/scraper';
import { CardPriceTable } from './CardPriceTable';

export const ScraperDashboard: React.FC = () => {
  const [data, setData] = useState<ScrapeOutput | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Option 1: Load from file
    fetch('/data/scrape_output_sample.json')
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));

    // Option 2: Trigger scrape via API
    // fetch('/api/scrape-v2', { method: 'POST', body: JSON.stringify({ cardIds: [...] }) })
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>Error loading data</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Pokemon TCG Price Comparison</h1>
        <p className="text-gray-600">
          Comparing prices across {data.meta.totalSites} Japanese shops
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Cards Tracked"
          value={data.summary.totalCards}
          subtitle={`${data.summary.totalListings} total listings`}
        />
        <StatCard
          title="Sites Covered"
          value={`${data.summary.totalSitesSuccessful}/${data.summary.totalSitesAttempted}`}
          subtitle={`${(data.summary.totalSitesSuccessful / data.summary.totalSitesAttempted * 100).toFixed(0)}% success rate`}
        />
        <StatCard
          title="Price Range"
          value={`¥${data.summary.priceRange.lowest.toLocaleString()} - ¥${data.summary.priceRange.highest.toLocaleString()}`}
          subtitle="JPY"
        />
        <StatCard
          title="Credits Saved"
          value={`${data.summary.savingsPercentage}`}
          subtitle={`${data.summary.creditsSaved} free vs ${data.summary.totalCreditsUsed} paid`}
          highlight
        />
      </div>

      {/* Cards */}
      <div className="space-y-6">
        {data.cards.map((cardResult, idx) => (
          <CardPriceTable key={idx} data={cardResult} />
        ))}
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  subtitle: string;
  highlight?: boolean;
}> = ({ title, value, subtitle, highlight }) => (
  <div className={`p-4 rounded-lg ${highlight ? 'bg-green-50 border border-green-200' : 'bg-white'}`}>
    <div className="text-sm text-gray-500 mb-1">{title}</div>
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-gray-400">{subtitle}</div>
  </div>
);
```

### Usage in Page

```tsx
// app/prices/page.tsx
import { ScraperDashboard } from '@/components/ScraperDashboard';

export default function PricesPage() {
  return <ScraperDashboard />;
}
```

## Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Scraper API   │────▶│  JSON Output     │────▶│  Frontend       │
│   (/api/scrape) │     │  (scrape_output) │     │  (React/Next.js)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │  Price Display   │
                        │  - Lowest price  │
                        │  - Site compare  │
                        │  - Condition     │
                        └──────────────────┘
```

## Key Features

1. **Price Sorting**: All listings sorted by price (lowest first)
2. **Condition Tags**: Visual indicators for card condition (A-, B, C)
3. **Stock Status**: Green dot for in-stock items
4. **Direct Links**: Click to visit shop
5. **Cost Tracking**: Shows which requests used paid credits vs free
6. **Arbitrage Indicator**: Highlights best prices

## Next Steps

1. Import the JSON structure into your frontend types
2. Create the CardPriceTable component
3. Add loading states and error handling
4. Style with your preferred CSS (Tailwind, styled-components, etc.)
5. Add real-time refresh capability via the API endpoint
