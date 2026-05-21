'use client';
import { useEffect, useState } from 'react';
import { Sparkles, X, Plus, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/stores/cart.store';
import { analyticsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { resolveImageUrl } from '@/lib/imageUrl';

interface Suggestion {
  productId: string;
  name: string;
  price: number;
  image?: string;
  co_count: number;
}

/**
 * When cart has items → query pos-analytics to suggest "customers who bought this also bought X"
 *
 * Collapsible bottom-right widget — small pill by default so it doesn't cover the
 * cart's Pay button. Clicking the pill expands to show items. State is persisted
 * in localStorage so it doesn't re-open on every cart change.
 */
export function CrossSellSuggest() {
  const { items, addItem } = useCart();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<boolean>(false);
  const [hidden, setHidden] = useState<boolean>(false);

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
    // Restore expanded preference (default collapsed)
    setExpanded(localStorage.getItem('crosssell-expanded') === '1');
  }, []);

  const persistExpanded = (v: boolean) => {
    setExpanded(v);
    if (typeof window !== 'undefined') {
      localStorage.setItem('crosssell-expanded', v ? '1' : '0');
    }
  };

  const realStoreId =
    typeof window !== 'undefined' ? localStorage.getItem('storeId') : null;

  // Debounced: when items change → query cross-sell for the latest item
  useEffect(() => {
    if (!realStoreId || items.length === 0) {
      setSuggestions([]);
      setHidden(false); // un-hide so it appears again next basket
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

  if (suggestions.length === 0 || hidden) return null;

  return (
    <div className="fixed bottom-20 right-4 z-30 pointer-events-none">
      <AnimatePresence mode="wait">
        {!expanded ? (
          /* Collapsed pill */
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={() => persistExpanded(true)}
            className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-full bg-card border border-primary/40 shadow-card hover:shadow-card-hover hover:border-primary transition-all group"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium">
              {suggestions.length} แนะนำ
            </span>
            <span className="text-[10px] text-muted-foreground">
              ลูกค้ามักซื้อด้วย
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground rotate-180 group-hover:translate-y-[-1px] transition-transform" />
          </motion.button>
        ) : (
          /* Expanded panel */
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-auto w-[280px] bg-card border border-border rounded-xl shadow-card-hover overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-primary/5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">
                  ลูกค้ามักซื้อด้วย
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => persistExpanded(false)}
                  className="w-6 h-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                  title="ย่อ"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setHidden(true)}
                  className="w-6 h-6 rounded hover:bg-muted text-muted-foreground hover:text-danger flex items-center justify-center transition-colors"
                  title="ปิด"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Suggestions */}
            <div className="p-2 space-y-1">
              {suggestions.map((s) => (
                <div
                  key={s.productId}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-card-hover transition-colors"
                >
                  {s.image ? (
                    <img
                      src={resolveImageUrl(s.image)}
                      alt=""
                      className="w-9 h-9 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-muted flex items-center justify-center text-base shrink-0">
                      🍽️
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate leading-tight">
                      {s.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {formatCurrency(s.price)} · {s.co_count}×
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
                    className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:bg-primary-600 transition-colors"
                    title="เพิ่มลงตะกร้า"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
