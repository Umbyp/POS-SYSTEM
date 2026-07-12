'use client';
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { useT } from '@/lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  productId?: string | null; // null = create, string = edit
}

interface Variant {
  name: string;
  priceDelta: number;
  sku?: string;
}

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  image: string;
  costPrice: string;
  sellingPrice: string;
  categoryId: string;
  trackStock: boolean;
  initialStock: string;
  lowStockAt: string;
  variants: Variant[];
}

const EMPTY: FormState = {
  name: '',
  sku: '',
  barcode: '',
  description: '',
  image: '',
  costPrice: '',
  sellingPrice: '',
  categoryId: '',
  trackStock: true,
  initialStock: '0',
  lowStockAt: '10',
  variants: [],
};

export function ProductFormDialog({ open, onClose, productId }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories').then((r) => r.data),
    enabled: open,
  });

  // Load product for editing
  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.get(`/products/${productId}`).then((r) => r.data),
    enabled: open && !!productId,
  });

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode || '',
        description: product.description || '',
        image: product.image || '',
        costPrice: String(product.costPrice),
        sellingPrice: String(product.sellingPrice),
        categoryId: product.categoryId,
        trackStock: product.trackStock,
        initialStock: String(product.inventory?.quantity || 0),
        lowStockAt: String(product.inventory?.lowStockAt || 10),
        variants: product.variants || [],
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, product]);

  const save = useMutation({
    mutationFn: async (payload: any) => {
      if (productId) {
        return api.put(`/products/${productId}`, payload).then((r) => r.data);
      }
      return api.post('/products', payload).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(productId ? t('productForm.updated') : t('productForm.added'));
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || t('productForm.saveFailed'));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      name: form.name,
      sku: form.sku,
      barcode: form.barcode || null,
      description: form.description || null,
      image: form.image || null,
      costPrice: parseFloat(form.costPrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      categoryId: form.categoryId,
      trackStock: form.trackStock,
    };
    if (!productId) {
      payload.initialStock = parseInt(form.initialStock) || 0;
      payload.lowStockAt = parseInt(form.lowStockAt) || 10;
      if (form.variants.length) payload.variants = form.variants;
    }
    save.mutate(payload);
  };

  const margin =
    form.sellingPrice && form.costPrice
      ? ((parseFloat(form.sellingPrice) - parseFloat(form.costPrice)) / parseFloat(form.sellingPrice)) * 100
      : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{productId ? t('productForm.editTitle') : t('productForm.addTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label className="mb-1.5 block">Product name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label className="mb-1.5 block">SKU *</Label>
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                required
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Barcode</Label>
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Category *</Label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                required
                className="w-full h-10 bg-input border border-border rounded-lg px-3 text-sm"
              >
                <option value="">Select category...</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1.5 block">Product image</Label>
              <ImageUploader
                value={form.image}
                onChange={(v) => setForm({ ...form, image: v })}
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Cost *</Label>
              <Input
                type="number" step="0.01" min="0"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                required
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Selling price *</Label>
              <Input
                type="number" step="0.01" min="0"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                required
              />
              {margin > 0 && (
                <div className="text-xs text-success mt-1">
                  Margin {margin.toFixed(1)}%
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1.5 block">Description</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>

          {/* Stock + Ingredient flag */}
          <div className="border-t border-border pt-4 space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.trackStock}
                onChange={(e) => setForm({ ...form, trackStock: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm font-medium">Track stock</span>
            </label>

            {form.trackStock && !productId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5 block">Initial stock</Label>
                  <Input
                    type="number" min="0"
                    value={form.initialStock}
                    onChange={(e) => setForm({ ...form, initialStock: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Alert when below</Label>
                  <Input
                    type="number" min="0"
                    value={form.lowStockAt}
                    onChange={(e) => setForm({ ...form, lowStockAt: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Variants (only when creating new) */}
          {!productId && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <Label>Options (Variants)</Label>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() =>
                    setForm({
                      ...form,
                      variants: [...form.variants, { name: '', priceDelta: 0 }],
                    })
                  }
                >
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              {form.variants.map((v, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <Input
                    placeholder="Name (e.g. Size L)"
                    value={v.name}
                    onChange={(e) => {
                      const next = [...form.variants];
                      next[i] = { ...next[i], name: e.target.value };
                      setForm({ ...form, variants: next });
                    }}
                  />
                  <Input
                    type="number" step="0.01"
                    placeholder="Price +/-"
                    value={v.priceDelta}
                    onChange={(e) => {
                      const next = [...form.variants];
                      next[i] = { ...next[i], priceDelta: parseFloat(e.target.value) || 0 };
                      setForm({ ...form, variants: next });
                    }}
                    className="w-24"
                  />
                  <Button
                    type="button" size="icon" variant="ghost"
                    onClick={() => setForm({ ...form, variants: form.variants.filter((_, idx) => idx !== i) })}
                  >
                    <Trash2 className="w-4 h-4 text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
