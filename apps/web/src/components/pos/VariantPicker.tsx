'use client';
import { useState, useEffect } from 'react';
import { Plus, Minus, MessageSquare } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface VariantOption {
  name: string;
  priceDelta: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  product: any;
  onConfirm: (opts: {
    quantity: number;
    variants: VariantOption[];
    notes?: string;
  }) => void;
}

export function VariantPicker({ open, onClose, product, onConfirm }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<VariantOption[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setSelected([]);
      setNotes('');
    }
  }, [open, product?.id]);

  if (!product) return null;

  const variants = product.variants || [];
  const totalVariantDelta = selected.reduce((s, v) => s + v.priceDelta, 0);
  const unitPrice = Number(product.sellingPrice) + totalVariantDelta;
  const total = unitPrice * quantity;

  const toggleVariant = (v: any) => {
    const variant = { name: v.name, priceDelta: Number(v.priceDelta) };
    setSelected((cur) => {
      const idx = cur.findIndex((x) => x.name === variant.name);
      if (idx >= 0) {
        return cur.filter((_, i) => i !== idx);
      }
      return [...cur, variant];
    });
  };

  const handleConfirm = () => {
    onConfirm({ quantity, variants: selected, notes: notes.trim() || undefined });
    onClose();
  };

  // Group variants by prefix (e.g., "Size:S" / "Size:M") OR show all flat
  const groupedVariants = (() => {
    const groups: Record<string, any[]> = {};
    for (const v of variants) {
      const [group, ...rest] = v.name.split(':');
      const key = rest.length > 0 ? group : '_other';
      const display = rest.length > 0 ? rest.join(':') : v.name;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ ...v, _display: display });
    }
    return groups;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        {/* Product preview */}
        <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
          <div className="w-14 h-14 rounded-lg bg-card flex items-center justify-center text-2xl shrink-0 overflow-hidden">
            {product.image ? (
              <img src={product.image} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{product.category?.icon || '📦'}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-muted-foreground">Base price</div>
            <div className="font-bold tabular-nums">
              {formatCurrency(product.sellingPrice)}
            </div>
          </div>
        </div>

        {/* Variants */}
        {variants.length > 0 ? (
          <div className="space-y-3">
            {Object.entries(groupedVariants).map(([group, vs]) => (
              <div key={group}>
                {group !== '_other' && (
                  <Label className="mb-1.5 block text-xs uppercase text-muted-foreground">
                    {group}
                  </Label>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {vs.map((v) => {
                    const isSel = selected.some((s) => s.name === v.name);
                    const delta = Number(v.priceDelta);
                    return (
                      <button
                        key={v.id || v.name}
                        type="button"
                        onClick={() => toggleVariant(v)}
                        className={`p-2.5 rounded-lg border-2 text-sm transition-all text-left ${
                          isSel
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                      >
                        <div className="font-medium">{v._display}</div>
                        {delta !== 0 && (
                          <div
                            className={`text-xs tabular-nums ${
                              delta > 0 ? 'text-success' : 'text-muted-foreground'
                            }`}
                          >
                            {delta > 0 ? '+' : ''}
                            {formatCurrency(delta)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No options available for this product
          </p>
        )}

        {/* Notes */}
        <div>
          <Label className="mb-1.5 block text-xs flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Notes (optional)
          </Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. less sweet, no sugar, separate bag..."
            className="text-sm"
          />
        </div>

        {/* Quantity */}
        <div className="flex items-center justify-between">
          <Label>Quantity</Label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-9 h-9 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center text-lg font-bold tabular-nums">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-9 h-9 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Total + Add button */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Total</span>
            <span className="text-xl font-bold text-accent tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>
          <Button size="xl" className="w-full" onClick={handleConfirm}>
            Add to cart · {formatCurrency(total)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
