'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Minus, Plus, UtensilsCrossed, X } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { resolveImageUrl } from '@/lib/imageUrl';

export interface OrderVariant {
  name: string; // "<Group>: <Option>" — same shape the staff POS sends
  priceDelta: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number; // 0 = unlimited
  options: { id: string; name: string; priceDelta: number; isDefault?: boolean }[];
}

/** Normalise a product's `optionGroups` from the public menu. Tolerates the
 *  flat shape ({id,name,minSelect,maxSelect,options}) and the staff-API shape
 *  ({group:{...}}); missing/empty → no options. */
export function getOptionGroups(product: any): OptionGroup[] {
  const raw: any[] = Array.isArray(product?.optionGroups) ? product.optionGroups : [];
  const out: OptionGroup[] = [];
  for (const item of raw) {
    const g = item?.group ?? item;
    if (!g || g.isActive === false) continue;
    const options = (g.options || [])
      .filter((o: any) => o && o.isActive !== false)
      .map((o: any) => ({
        id: String(o.id ?? o.name),
        name: o.name,
        priceDelta: Number(o.priceDelta) || 0,
        isDefault: !!o.isDefault,
      }));
    if (options.length === 0) continue;
    out.push({
      id: String(g.id ?? g.name),
      name: g.name,
      minSelect: Number(g.minSelect) || 0,
      maxSelect: g.maxSelect == null ? 1 : Number(g.maxSelect),
      options,
    });
  }
  // Legacy per-product `variants` (pre option-groups): one optional pick. The
  // API folds these into a 'ตัวเลือก' group on submit (self-order.service
  // toGroupDefs) and matches by "<group>: <name>", so mirror that here.
  const legacy: any[] = Array.isArray(product?.variants) ? product.variants.filter((v: any) => v?.name) : [];
  if (legacy.length > 0) {
    out.push({
      id: 'legacy-variants',
      name: 'ตัวเลือก',
      minSelect: 0,
      maxSelect: 1,
      options: legacy.map((v: any) => ({
        id: String(v.id ?? v.name),
        name: v.name,
        priceDelta: Number(v.priceDelta) || 0,
        isDefault: false,
      })),
    });
  }
  return out;
}

export function variantsKey(variants: OrderVariant[] | undefined, notes?: string) {
  const v = [...(variants || [])].map((x) => x.name).sort().join('|');
  return `${v}#${(notes || '').trim()}`;
}

/** "Sweetness: 50%" → "50%" for compact chips. */
export function variantLabel(v: OrderVariant) {
  const i = v.name.indexOf(': ');
  return i >= 0 ? v.name.slice(i + 2) : v.name;
}

interface Props {
  product: any | null;
  onClose: () => void;
  onConfirm: (opts: { quantity: number; variants: OrderVariant[]; notes?: string }) => void;
}

export function ItemOptionSheet({ product, onClose, onConfirm }: Props) {
  return (
    <AnimatePresence>
      {product && <SheetBody key={product.id} product={product} onClose={onClose} onConfirm={onConfirm} />}
    </AnimatePresence>
  );
}

function SheetBody({ product, onClose, onConfirm }: { product: any; onClose: () => void; onConfirm: Props['onConfirm'] }) {
  const groups = useMemo(() => getOptionGroups(product), [product]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id);
      init[g.id] = g.maxSelect === 1 ? defaults.slice(0, 1) : g.maxSelect > 0 ? defaults.slice(0, g.maxSelect) : defaults;
    }
    return init;
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toggle = (g: OptionGroup, optionId: string) => {
    setSelected((cur) => {
      const chosen = cur[g.id] || [];
      const has = chosen.includes(optionId);
      let next: string[];
      if (g.maxSelect === 1) {
        // radio; a required group can't be cleared by re-tapping
        next = has ? (g.minSelect > 0 ? chosen : []) : [optionId];
      } else if (has) {
        next = chosen.filter((x) => x !== optionId);
      } else if (g.maxSelect > 0 && chosen.length >= g.maxSelect) {
        next = [...chosen.slice(1), optionId];
      } else {
        next = [...chosen, optionId];
      }
      return { ...cur, [g.id]: next };
    });
  };

  const variants: OrderVariant[] = [];
  const missing: string[] = [];
  for (const g of groups) {
    const ids = selected[g.id] || [];
    if (g.minSelect > 0 && ids.length < g.minSelect) missing.push(g.name);
    for (const id of ids) {
      const o = g.options.find((x) => x.id === id);
      if (o) variants.push({ name: `${g.name}: ${o.name}`, priceDelta: o.priceDelta });
    }
  }
  const unit = Number(product.sellingPrice) + variants.reduce((s, v) => s + v.priceDelta, 0);
  const total = unit * quantity;
  const canAdd = missing.length === 0;

  const rule = (g: OptionGroup) => {
    if (g.maxSelect === 1) return 'เลือก 1 อย่าง';
    if (g.maxSelect > 1) return `เลือกได้สูงสุด ${g.maxSelect}`;
    return g.minSelect > 1 ? `เลือกอย่างน้อย ${g.minSelect}` : 'เลือกได้หลายอย่าง';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-lg max-h-[90dvh] bg-card rounded-t-3xl flex flex-col"
      >
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1.5 rounded-full bg-border" />
        </div>
        <div className="flex items-center gap-3 px-4 pb-3 shrink-0 border-b border-border">
          <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden shrink-0">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveImageUrl(product.image)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold leading-snug line-clamp-2">{product.name}</div>
            <div className="text-sm text-primary font-bold tabular-nums">{formatCurrency(product.sellingPrice)}</div>
          </div>
          <button onClick={onClose} aria-label="close" className="p-1.5 rounded-full hover:bg-muted self-start">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-4">
          {groups.map((g) => {
            const chosen = selected[g.id] || [];
            const isMissing = missing.includes(g.name);
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</span>
                    {g.minSelect > 0 && (
                      <span className="px-1.5 py-px rounded bg-danger/10 text-danger text-[10px] font-semibold">จำเป็น</span>
                    )}
                  </div>
                  <span className={`text-[11px] ${isMissing ? 'text-danger' : 'text-muted-foreground'}`}>{rule(g)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {g.options.map((o) => {
                    const isSel = chosen.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggle(g, o.id)}
                        className={`relative text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          isSel ? 'border-primary bg-primary/10' : 'border-border bg-card'
                        }`}
                      >
                        {isSel && <Check className="w-3.5 h-3.5 text-primary absolute top-2 right-2" />}
                        <div className="font-medium pr-4 leading-snug">{o.name}</div>
                        {o.priceDelta !== 0 && (
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {o.priceDelta > 0 ? '+' : ''}
                            {formatCurrency(o.priceDelta)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
              หมายเหตุ (ถ้ามี)
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
              placeholder="เช่น ไม่ใส่ผัก, แยกน้ำแข็ง"
              className="w-full h-10 px-3 rounded-lg border border-border bg-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2.5 shrink-0">
          {!canAdd && <p className="text-xs text-danger">กรุณาเลือก: {missing.join(', ')}</p>}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 border border-border rounded-lg">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="-"
                className="w-10 h-11 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="+"
                className="w-10 h-11 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <button
              disabled={!canAdd}
              onClick={() => {
                onConfirm({ quantity, variants, notes: notes.trim() || undefined });
                onClose();
              }}
              className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-between px-4 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <span>เพิ่มลงตะกร้า</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
