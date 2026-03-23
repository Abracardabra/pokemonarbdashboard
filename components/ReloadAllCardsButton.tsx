'use client';

import { RefreshCw } from 'lucide-react';

export function ReloadAllCardsButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('reload-all-cards'));
      }}
      className="inline-flex items-center gap-2 px-3 py-2 rounded bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 text-sm"
      title="Reload all currently filtered cards on the homepage"
      aria-label="Reload all cards"
    >
      <RefreshCw className="h-4 w-4" />
      Reload all cards
    </button>
  );
}

