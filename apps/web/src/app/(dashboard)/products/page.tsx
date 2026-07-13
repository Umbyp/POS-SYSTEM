'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Search, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    <div className="p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-bold">{t('productsPage.title')}</h2>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> {t('productsPage.add')}
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t('productsPage.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10 max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer h-24 rounded-xl" />
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
        <div className="overflow-x-auto bg-card rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">{t('productsPage.colProduct')}</th>
                <th className="p-3">{t('productsPage.colSku')}</th>
                <th className="p-3">{t('productsPage.colCategory')}</th>
                <th className="p-3 text-right">{t('productsPage.colCost')}</th>
                <th className="p-3 text-right">{t('productsPage.colSellingPrice')}</th>
                <th className="p-3 text-right">{t('productsPage.colMargin')}</th>
                <th className="p-3 text-right">{t('productsPage.colStock')}</th>
                <th className="p-3 text-right">{t('productsPage.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: any) => {
                const margin = ((Number(p.sellingPrice) - Number(p.costPrice)) / Number(p.sellingPrice)) * 100;
                const stock = p.inventory?.quantity ?? 0;
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-card-hover">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 font-mono text-xs">{p.sku}</td>
                    <td className="p-3">
                      {p.category?.icon} {p.category?.name}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(p.costPrice)}</td>
                    <td className="p-3 text-right tabular-nums text-accent">
                      {formatCurrency(p.sellingPrice)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-success">
                      {margin.toFixed(1)}%
                    </td>
                    <td className="p-3 text-right">
                      {p.trackStock ? (
                        <Badge variant={stock === 0 ? 'danger' : stock < 10 ? 'warning' : 'success'}>
                          {stock}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p.id)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => {
                            if (confirm(`${t('productsPage.confirmDelete')} "${p.name}"?`)) remove.mutate(p.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-danger" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProductFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        productId={editId}
      />
    </div>
  );
}
