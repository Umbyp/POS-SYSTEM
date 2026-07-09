'use client';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { Cart } from '@/components/pos/Cart';
import { CrossSellSuggest } from '@/components/pos/CrossSellSuggest';
import { MobileCartSheet, MobileCartEmptyHint } from '@/components/pos/MobileCartSheet';
import { PaymentDialog } from './PaymentDialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';

export default function POSPage() {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const t = useT();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', q, categoryId],
    queryFn: () =>
      api.get('/products', { params: { q: q || undefined, categoryId: categoryId || undefined } })
        .then((r) => r.data),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories').then((r) => r.data),
  });

  // Focus search with F2
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="grid grid-cols-12 gap-3 h-full p-3 overflow-hidden">
      {/*
        On mobile/tablet (< lg) products take full width and cart becomes a
        bottom-sheet (see MobileCartSheet below). Add pb-24 so the floating
        cart button doesn't cover the last row of products.
      */}
      <section className="col-span-12 lg:col-span-8 flex flex-col gap-3 overflow-hidden pb-24 lg:pb-0">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder={t('pos.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 h-12"
          />
        </div>

        {/* Categories — flat text chips, no decorative color/emoji */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {[{ id: null, name: t('pos.all') }, ...categories].map((c: any) => {
            const active = categoryId === c.id;
            return (
              <button
                key={c.id ?? 'all'}
                onClick={() => setCategoryId(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin pr-1">
          <ProductGrid products={products} loading={isLoading} />
        </div>
      </section>

      {/* Cart sidebar — desktop only (lg+) */}
      <aside className="hidden lg:flex col-span-4 bg-card rounded-xl p-4 flex-col overflow-hidden border border-border shadow-card">
        <Cart onCheckout={() => setPayOpen(true)} />
      </aside>

      {/* Mobile/Tablet — floating cart button + bottom sheet */}
      <MobileCartSheet onCheckout={() => setPayOpen(true)} />
      <MobileCartEmptyHint />

      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} />
      <CrossSellSuggest />
    </div>
  );
}
