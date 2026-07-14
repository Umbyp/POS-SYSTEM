'use client';
import { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, MessageSquare, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { resolveImageUrl } from '@/lib/imageUrl';
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

interface RenderGroup {
  key: string;
  name: string;
  minSelect: number;
  maxSelect: number; // 0 = unlimited
  options: { id: string; name: string; priceDelta: number; isDefault?: boolean }[];
}

/** Build the list of option groups to render from a product's attached
 *  store-level groups, falling back to legacy per-product variants. */
function buildGroups(product: any): RenderGroup[] {
  const groups: RenderGroup[] = [];

  for (const pog of product?.optionGroups || []) {
    const g = pog.group;
    if (!g || g.isActive === false) continue;
    groups.push({
      key: g.id,
      name: g.name,
      minSelect: g.minSelect ?? 0,
      maxSelect: g.maxSelect ?? 1,
      options: (g.options || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        priceDelta: Number(o.priceDelta),
        isDefault: o.isDefault,
      })),
    });
  }

  // Legacy per-product variants → one optional multi-select group.
  const legacy = product?.variants || [];
  if (legacy.length > 0) {
    groups.push({
      key: '_legacy',
      name: 'ตัวเลือกเพิ่มเติม',
      minSelect: 0,
      maxSelect: 0,
      options: legacy.map((v: any) => ({
        id: v.id || v.name,
        name: v.name,
        priceDelta: Number(v.priceDelta),
      })),
    });
  }

  return groups;
}

export function VariantPicker({ open, onClose, product, onConfirm }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  // groupKey -> selected optionIds
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const groups = useMemo(() => buildGroups(product), [product]);

  useEffect(() => {
    if (!open) return;
    setQuantity(1);
    setNotes('');
    // preselect defaults
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id);
      init[g.key] = g.maxSelect === 1 ? defaults.slice(0, 1) : defaults;
    }
    setSelected(init);
  }, [open, product?.id]);

  if (!product) return null;

  const toggle = (g: RenderGroup, optionId: string) => {
    setSelected((cur) => {
      const chosen = cur[g.key] || [];
      const has = chosen.includes(optionId);
      let next: string[];
      if (g.maxSelect === 1) {
        next = has ? [] : [optionId]; // single-select (radio, deselectable)
      } else if (has) {
        next = chosen.filter((x) => x !== optionId);
      } else if (g.maxSelect > 0 && chosen.length >= g.maxSelect) {
        next = [...chosen.slice(1), optionId]; // over the cap → drop the oldest
      } else {
        next = [...chosen, optionId];
      }
      return { ...cur, [g.key]: next };
    });
  };

  // Flatten selection → priced variant snapshots + validation
  const chosenVariants: VariantOption[] = [];
  const missing: string[] = [];
  for (const g of groups) {
    const ids = selected[g.key] || [];
    if (g.minSelect > 0 && ids.length < g.minSelect) missing.push(g.name);
    for (const id of ids) {
      const opt = g.options.find((o) => o.id === id);
      if (opt) chosenVariants.push({ name: `${g.name}: ${opt.name}`, priceDelta: opt.priceDelta });
    }
  }

  const totalVariantDelta = chosenVariants.reduce((s, v) => s + v.priceDelta, 0);
  const unitPrice = Number(product.sellingPrice) + totalVariantDelta;
  const total = unitPrice * quantity;
  const canAdd = missing.length === 0;

  const handleConfirm = () => {
    if (!canAdd) return;
    onConfirm({ quantity, variants: chosenVariants, notes: notes.trim() || undefined });
    onClose();
  };

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
              <img src={resolveImageUrl(product.image)} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{product.category?.icon || '📦'}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-muted-foreground">ราคาเริ่มต้น</div>
            <div className="font-bold tabular-nums">{formatCurrency(product.sellingPrice)}</div>
          </div>
        </div>

        {/* Option groups */}
        {groups.length > 0 ? (
          <div className="space-y-3">
            {groups.map((g) => {
              const chosen = selected[g.key] || [];
              const rule = g.maxSelect === 1 ? 'เลือก 1 อย่าง' : 'เลือกได้หลายอย่าง';
              const isMissing = missing.includes(g.name);
              return (
                <div key={g.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs uppercase text-muted-foreground flex items-center gap-1.5">
                      {g.name}
                      {g.minSelect > 0 && <span className="text-danger normal-case">* จำเป็น</span>}
                    </Label>
                    <span className={`text-[10px] ${isMissing ? 'text-danger' : 'text-muted-foreground'}`}>{rule}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {g.options.map((o) => {
                      const isSel = chosen.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggle(g, o.id)}
                          className={`p-2.5 rounded-lg border-2 text-sm transition-all text-left relative ${
                            isSel ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          {isSel && <Check className="w-3.5 h-3.5 text-primary absolute top-1.5 right-1.5" />}
                          <div className="font-medium pr-4">{o.name}</div>
                          {o.priceDelta !== 0 && (
                            <div className={`text-xs tabular-nums ${o.priceDelta > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                              {o.priceDelta > 0 ? '+' : ''}{formatCurrency(o.priceDelta)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">เมนูนี้ไม่มีตัวเลือก</p>
        )}

        {/* Notes */}
        <div>
          <Label className="mb-1.5 block text-xs flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> หมายเหตุ (ถ้ามี)
          </Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="เช่น แยกน้ำแข็ง, ใส่ถุงแยก..."
            className="text-sm"
          />
        </div>

        {/* Quantity */}
        <div className="flex items-center justify-between">
          <Label>จำนวน</Label>
          <div className="flex items-center gap-3">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-9 h-9 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center">
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center text-lg font-bold tabular-nums">{quantity}</span>
            <button onClick={() => setQuantity(quantity + 1)}
              className="w-9 h-9 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Total + Add */}
        <div className="border-t border-border pt-3">
          {!canAdd && (
            <div className="text-xs text-danger mb-2">กรุณาเลือก: {missing.join(', ')}</div>
          )}
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">รวม</span>
            <span className="text-xl font-bold text-accent tabular-nums">{formatCurrency(total)}</span>
          </div>
          <Button size="xl" className="w-full" onClick={handleConfirm} disabled={!canAdd}>
            เพิ่มลงตะกร้า · {formatCurrency(total)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
