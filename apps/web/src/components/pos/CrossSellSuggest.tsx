'use client';
import { useEffect, useState } from 'react';
import { Sparkles, X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/stores/cart.store';
import { analyticsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

interface Suggestion {
  productId: string;
  name: string;
  price: number;
  image?: string;
  co_count: number;
}

/**
 * When cart has items → query pos-analytics to suggest "customers who bought this also bought X"
 * Shows a small popup in the bottom-right corner of the POS page
 */
export function CrossSellSuggest() {
  const { items, addItem } = useCart();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [productMeta, setProductMeta] = useState<Record<string, any>>({});

  const storeId = typeof window !== 'undefined' ? localStorage.getItem('storeId') : null;
  // Read storeId from auth store
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const auth = localStorage.getItem('pos-auth');
    if (auth) {
      try {
        const parsed = JSON.parse(auth);
        const sid = parsed.state?.user?.storeId;
        if (sid) localStorage.setItem('storeId', sid);
      } catch {}
    }
  }, []);

  const realStoreId =
    typeof window !== 'undefined' ? localStorage.getItem('storeId') : null;

  // Debounced: when items change → query cross-sell for the latest item
  useEffect(() => {
    if (!realStoreId || items.length === 0) {
      setSuggestions([]);
      return;
    }
    const lastItem = items[items.length - 1];
    const t = setTimeout(async () => {
      try {
        const { data } = await analyticsApi.get(
          `/api/basket/cross-sell/${lastItem.productId}`,
          { params: { store_id: realStoreId, days: 90 } }
        );
        const all: Suggestion[] = (data.suggestions || []).filter(
          (s: any) =>
            !items.some((i) => i.productId === s.productId) && !dismissed.has(s.productId)
        );
        setSuggestions(all.slice(0, 3));
      } catch {
        // analytics service down? hide silently
        setSuggestions([]);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [items.length, items.map((i) => i.productId).join(','), realStoreId]);

  const dismiss = (id: string) => {
    setDismissed((s) => new Set([...s, id]));
    setSuggestions((s) => s.filter((x) => x.productId !== id));
  };

  if (suggestions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-4 right-4 max-w-xs bg-gradient-to-br from-accent/20 to-card border-2 border-accent/40 rounded-2xl p-3 shadow-xl z-40"
      >
        <div className="flex items-center gap-2 mb-2 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="font-medium text-accent">Customers also bought</span>
        </div>

        <div className="space-y-1.5">
          {suggestions.map((s) => (
            <div
              key={s.productId}
              className="flex items-center gap-2 p-2 rounded-lg bg-card/80 border border-border"
            >
              {s.image ? (
                <img src={s.image} alt="" className="w-9 h-9 rounded object-cover" />
              ) : (
                <div className="w-9 h-9 rounded bg-muted flex items-center justify-center text-lg">
                  🍽️
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{s.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatCurrency(s.price)} · bundled {s.co_count}×
                </div>
              </div>
              <button
                onClick={() => {
                  addItem({
                    productId: s.productId,
                    name: s.name,
                    unitPrice: Number(s.price),
                    image: s.image,
                  });
                  dismiss(s.productId);
                }}
                className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center shrink-0 hover:opacity-80"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => dismiss(s.productId)}
                className="w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        <p className="text-[9px] text-muted-foreground text-center mt-2">
          AI Cross-sell · from your store data
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
