'use client';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ScanLine, ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import { useCart } from '@/stores/cart.store';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { Cart } from '@/components/pos/Cart';
import { ParkedOrdersDialog } from '@/components/pos/ParkedOrdersDialog';
import { CrossSellSuggest } from '@/components/pos/CrossSellSuggest';
import { PaymentDialog } from './PaymentDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function POSPage() {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [parkedOpen, setParkedOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const add = useCart((s) => s.addItem);

  const { data: parkedCount = 0 } = useQuery({
    queryKey: ['parked-count'],
    queryFn: () =>
      api.get('/orders/parked').then((r) => (Array.isArray(r.data) ? r.data.length : 0)),
    refetchInterval: 10_000,
  });

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

  // Barcode handler: when Enter is pressed in search → try direct barcode lookup
  const handleSearchEnter = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !q) return;
    // If input looks like a barcode (digits only, ≥ 8 chars)
    if (/^\d{8,}$/.test(q)) {
      try {
        const { data } = await api.get(`/products/barcode/${q}`);
        add({ productId: data.id, name: data.name, unitPrice: Number(data.sellingPrice), image: data.image });
        toast.success(`Added: ${data.name}`);
        setQ('');
      } catch {
        toast.error('Barcode not found');
      }
    }
  };

  // Focus search with F2 (most barcode scanners act as keyboard input)
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
    <div className="grid grid-cols-12 gap-4 h-full p-4 overflow-hidden">
      <section className="col-span-12 lg:col-span-8 flex flex-col gap-3 overflow-hidden">
        {/* Search + scan */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search products or scan barcode (F2)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={handleSearchEnter}
              className="pl-10 h-12"
            />
          </div>
          <Button variant="outline" size="lg" onClick={() => searchRef.current?.focus()}>
            <ScanLine className="w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setParkedOpen(true)}
            className="relative"
          >
            <ClipboardList className="w-5 h-5" />
            {parkedCount > 0 && (
              <Badge
                variant="accent"
                className="absolute -top-1.5 -right-1.5 text-[10px] h-5 min-w-5 px-1"
              >
                {parkedCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <Button
            variant={!categoryId ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryId(null)}
            className="shrink-0"
          >
            All
          </Button>
          {categories.map((c: any) => (
            <Button
              key={c.id}
              variant={categoryId === c.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryId(c.id)}
              className="shrink-0"
            >
              <span className="mr-1">{c.icon}</span>
              {c.name}
            </Button>
          ))}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin pr-1">
          <ProductGrid products={products} loading={isLoading} />
        </div>
      </section>

      {/* Cart */}
      <aside className="col-span-12 lg:col-span-4 bg-card rounded-xl p-4 flex flex-col overflow-hidden border border-border shadow-card">
        <Cart onCheckout={() => setPayOpen(true)} />
      </aside>

      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} />
      <ParkedOrdersDialog open={parkedOpen} onClose={() => setParkedOpen(false)} />
      <CrossSellSuggest />
    </div>
  );
}
