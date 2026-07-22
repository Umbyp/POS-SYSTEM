'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Search, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProductFormDialog } from '@/components/products/ProductFormDialog';
import { useT } from '@/lib/i18n';

export default function ProductsPage() {
  const t = useT();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', q],
    queryFn: () => api.get('/products', { params: { q } }).then((r) => r.data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(t('productsPage.deleted'));
    },
  });

  const openCreate = () => {
    setEditId(null);
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    setEditId(id);
    setFormOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
          {t('productsPage.title')}{' '}
          <span className="text-muted-foreground font-semibold text-base">
            {products.length} {t('display.items')}
          </span>
        </h2>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('productsPage.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 h-10 rounded-lg w-full sm:w-[220px]"
            />
          </div>
          <Button onClick={openCreate} className="h-10 rounded-lg shrink-0">
            <Plus className="w-4 h-4 mr-1.5" /> {t('productsPage.add')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer h-16 rounded-xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package className="w-12 h-12 mb-3 opacity-30" />
          <p>{t('productsPage.noneFound')}</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> {t('productsPage.addFirst')}
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-2xl border border-border overflow-hidden">
            <div className="grid grid-cols-[2.2fr_1fr_1.1fr_1.2fr_0.9fr] gap-2.5 px-4 py-3 bg-muted text-[11.5px] font-bold text-muted-foreground">
              <span>{t('productsPage.colProduct')}</span>
              <span>{t('productsPage.colCategory')}</span>
              <span className="text-right">{t('productsPage.colSellingPrice')}</span>
              <span>{t('productsPage.colMargin')}</span>
              <span className="text-right">{t('productsPage.colActions')}</span>
            </div>
            <div className="divide-y divide-border">
              {products.map((p: any) => {
                const margin = ((Number(p.sellingPrice) - Number(p.costPrice)) / Number(p.sellingPrice)) * 100;
                const stock = p.inventory?.quantity ?? 0;
                const outOfStock = p.trackStock && stock === 0;
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-[2.2fr_1fr_1.1fr_1.2fr_0.9fr] gap-2.5 px-4 py-3.5 items-center hover:bg-card-hover transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-[38px] h-[38px] rounded-lg bg-muted text-muted-foreground font-extrabold text-xs flex items-center justify-center shrink-0">
                        {p.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold truncate flex items-center gap-1.5">
                          <span className="truncate">{p.name}</span>
                          {outOfStock && (
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-danger/10 text-danger">
                              {t('inventoryPage.statusOut')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                          {p.sku}
                          {p.trackStock && !outOfStock && ` · ${t('productsPage.colStock')} ${stock}`}
                        </div>
                      </div>
                    </div>
                    <span className="text-[12.5px] truncate">
                      {p.category?.icon} {p.category?.name}
                    </span>
                    <span className="text-right text-sm font-bold tabular-nums">
                      {formatCurrency(p.sellingPrice)}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-success">{margin.toFixed(0)}%</div>
                      <div className="h-[5px] rounded-full bg-muted mt-1 overflow-hidden">
                        <div
                          className="h-full bg-success rounded-full"
                          style={{ width: `${Math.max(0, Math.min(100, margin))}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openEdit(p.id)}
                        className="w-[34px] h-[34px] rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${t('productsPage.confirmDelete')} "${p.name}"?`)) remove.mutate(p.id);
                        }}
                        className="w-[34px] h-[34px] rounded-lg border border-border flex items-center justify-center text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {products.map((p: any) => {
              const margin = ((Number(p.sellingPrice) - Number(p.costPrice)) / Number(p.sellingPrice)) * 100;
              const stock = p.inventory?.quantity ?? 0;
              const outOfStock = p.trackStock && stock === 0;
              return (
                <div key={p.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted text-muted-foreground font-extrabold text-xs flex items-center justify-center shrink-0">
                      {p.name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                            <span className="truncate">{p.name}</span>
                            {outOfStock && (
                              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-danger/10 text-danger">
                                {t('inventoryPage.statusOut')}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono truncate">
                            {p.sku}
                            {p.trackStock && !outOfStock && ` · ${t('productsPage.colStock')} ${stock}`}
                          </div>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0">
                          {formatCurrency(p.sellingPrice)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2.5">
                        <span className="text-xs text-muted-foreground truncate">
                          {p.category?.icon} {p.category?.name}
                        </span>
                        <span className="text-xs font-bold text-success shrink-0">{margin.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2.5">
                        <button
                          onClick={() => openEdit(p.id)}
                          className="flex-1 h-8 rounded-lg border border-border flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" /> {t('productsPage.colActions')}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`${t('productsPage.confirmDelete')} "${p.name}"?`)) remove.mutate(p.id);
                          }}
                          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-danger hover:bg-danger/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <ProductFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        productId={editId}
      />
    </div>
  );
}
