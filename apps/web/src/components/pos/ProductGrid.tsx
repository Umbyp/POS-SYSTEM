'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ImageIcon } from 'lucide-react';
import { useCart } from '@/stores/cart.store';
import { useT } from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { resolveImageUrl } from '@/lib/imageUrl';
import { VariantPicker } from './VariantPicker';

/** Initials for photo-less products — calm, consistent, no rainbow/emoji. */
function initials(name: string) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}

export function ProductGrid({ products, loading }: { products: any[]; loading: boolean }) {
  const add = useCart((s) => s.addItem);
  const t = useT();
  const [picking, setPicking] = useState<any>(null);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="shimmer aspect-[4/5] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ImageIcon className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm">{t('pos.noProducts')}</p>
      </div>
    );
  }

  const handleClick = (p: any) => {
    const hasVariants = p.variants && p.variants.length > 0;
    if (hasVariants) {
      setPicking(p);
    } else {
      add({
        productId: p.id,
        name: p.name,
        unitPrice: Number(p.sellingPrice),
        image: p.image,
      });
    }
  };

  return (
    <>
      <motion.div
        layout
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5"
      >
        {products.map((p) => {
          const stock = p.inventory?.quantity ?? 0;
          const lowStock = p.trackStock && stock <= (p.inventory?.lowStockAt || 10);
          const outOfStock = p.trackStock && stock === 0;
          const hasVariants = p.variants && p.variants.length > 0;

          return (
            <motion.button
              key={p.id}
              layout
              whileTap={{ scale: 0.98 }}
              disabled={outOfStock}
              onClick={() => handleClick(p)}
              className="group relative bg-card rounded-lg border border-border hover:border-primary/60 hover:bg-card-hover p-1.5 text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed overflow-hidden"
            >
              {/* Image / placeholder — single neutral surface, no decorative color */}
              <div className="aspect-square rounded-md mb-1.5 overflow-hidden bg-muted relative flex items-center justify-center">
                {p.image ? (
                  <img
                    src={resolveImageUrl(p.image)}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-xl font-bold uppercase text-muted-foreground/50 select-none tracking-tight">
                    {initials(p.name)}
                  </span>
                )}

                {/* Stock — the only status that earns a colored badge */}
                {p.trackStock && (outOfStock || lowStock) && (
                  <div className="absolute top-1 right-1">
                    {outOfStock ? (
                      <span className="px-1.5 py-0.5 rounded bg-danger text-white text-[10px] font-semibold">
                        หมด
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-warning text-white text-[10px] font-semibold tabular-nums">
                        เหลือ {stock}
                      </span>
                    )}
                  </div>
                )}

                {/* Options / Set — monochrome labels, not attention-grabbing color */}
                {(hasVariants || p.isCombo) && (
                  <div className="absolute bottom-1 left-1 flex gap-1">
                    {hasVariants && (
                      <span className="px-1 py-0.5 rounded bg-foreground/75 text-background text-[9px] font-semibold uppercase tracking-wide">
                        ตัวเลือก
                      </span>
                    )}
                    {p.isCombo && (
                      <span className="px-1 py-0.5 rounded bg-foreground/75 text-background text-[9px] font-semibold uppercase tracking-wide">
                        เซ็ต
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Name + price */}
              <div className="px-0.5">
                <div className="font-medium text-[13px] leading-snug line-clamp-2 min-h-[2.25rem]">
                  {p.name}
                </div>
                <div className="text-primary text-sm font-bold tabular-nums mt-0.5">
                  {formatCurrency(p.sellingPrice)}
                </div>
              </div>
            </motion.button>
          );
        })}
      </motion.div>

      <VariantPicker
        open={!!picking}
        product={picking}
        onClose={() => setPicking(null)}
        onConfirm={({ quantity, variants, notes }) => {
          if (!picking) return;
          const variantDelta = variants.reduce((s, v) => s + v.priceDelta, 0);
          add({
            productId: picking.id,
            name: picking.name,
            unitPrice: Number(picking.sellingPrice) + variantDelta,
            image: picking.image,
            notes,
            variants,
            quantity,
          });
        }}
      />
    </>
  );
}
