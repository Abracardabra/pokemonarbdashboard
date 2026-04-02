import { CompareClient } from '@/components/CompareClient';
import { getCompareData } from '@/lib/compare-data';

export const revalidate = 259200; // 3 days

export default async function ComparePage() {
  // Fetch data from PostgreSQL database (replaces JSON file)
  const builder = await getCompareData();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-1">Compare JP Shops</h1>
          <p className="text-purple-200 text-sm">Compare A- / B prices per shop, with stock status and links.</p>
          <p className="text-purple-300 text-xs mt-1">
            Data from database • {builder.cards.length} cards • Last updated: {new Date(builder.meta.builtAt).toLocaleString()}
          </p>
        </div>

        <CompareClient builder={builder} />
      </div>
    </main>
  );
}
