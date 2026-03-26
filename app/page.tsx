import { CardsWithFilters } from '@/components/CardsWithFilters';
import { ReloadAllCardsButton } from '@/components/ReloadAllCardsButton';
import { getDashboardData } from '@/lib/dashboard-data';
import Link from 'next/link';

// Revalidate every 3 days
export const revalidate = 259200;

export default async function Home() {
  const cardsData = await getDashboardData();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Pokemon TCG Arbitrage</h1>
              <p className="text-purple-200">
                Japanese S12a (VSTAR Universe) - AR/SAR/SR/CHR/UR/SSR/RRR Price Tracker (Japan → US Market)
              </p>
              <p className="text-purple-300 text-sm mt-2">Last updated: {new Date(cardsData.lastUpdated).toLocaleString()}</p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/compare"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/15 transition"
              >
                Compare JP Shops
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <ReloadAllCardsButton />
          <a
            href="/compare"
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 text-sm"
          >
            Compare shops →
          </a>
        </div>

        <CardsWithFilters 
          initialCards={cardsData.opportunities} 
          totalCards={cardsData.stats.totalCards}
          viableOpportunities={cardsData.stats.viableOpportunities}
          avgMargin={cardsData.stats.avgMargin}
          lastUpdated={cardsData.lastUpdated}
        />
      </div>
    </main>
  );
}
