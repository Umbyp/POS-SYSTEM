'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ImageIcon } from 'lucide-react';
import { useCart } from '@/stores/cart.store';
import { formatCurrency } from '@/lib/format';
import { VariantPicker } from './VariantPicker';

/** Subtle pastel gradient placeholders — keyed by product id so same product = same color */
const PLACEHOLDER_GRADIENTS = [
  'from-orange-100 to-orange-50',
  'from-rose-100 to-rose-50',
  'from-amber-100 to-amber-50',
  'from-lime-100 to-lime-50',
  'from-emerald-100 to-emerald-50',
  'from-sky-100 to-sky-50',
  'from-indigo-100 to-indigo-50',
  'from-fuchsia-100 to-fuchsia-50',
];

function pickGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PLACEHOLDER_GRADIENTS[Math.abs(hash) % PLACEHOLDER_GRADIENTS.length];
}

export function ProductGrid({ products, loading }: { products: any[]; loading: boolean }) {
  const add = useCart((s) => s.addItem);
  const [picking, setPicking] = useState<any>(null);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="shimmer aspect-[3/4] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ImageIcon className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm">No products found</p>
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
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
      >
        {products.map((p) => {
          const stock = p.inventory?.quantity ?? 0;
          const lowStock = p.trackStock && stock <= (p.inventory?.lowStockAt || 10);
          const outOfStock = p.trackStock && stock === 0;
          const hasVariants = p.variants && p.variants.length > 0;
          const gradient = pickGradient(p.id);

          return (
            <motion.button
              key={p.id}
              layout
              whileTap={{ scale: 0.97 }}
              disabled={outOfStock}
              onClick={() => handleClick(p)}
              className="group relative bg-card rounded-xl shadow-card hover:shadow-card-hover border border-border hover:border-primary/30 p-2 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              {/* Image */}
              <div className={`aspect-square rounded-lg mb-2 overflow-hidden bg-gradient-to-br ${gradient} relative`}>
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl select-none opacity-70">
                      {p.category?.icon || '🍽️'}
                    </span>
                  </div>
                )}

                {/* Stock badge — overlay on image top-right */}
                {p.trackStock && (outOfStock || lowStock) && (
                  <div className="absolute top-1.5 right-1.5">
                    {outOfStock ? (
                      <span className="px-2 py-0.5 rounded-full bg-danger text-white text-[10px] font-medium shadow-sm">
                        SOLD OUT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-warning text-white text-[10px] font-medium tabular-nums shadow-sm">
                        {stock} left
                      </span>
                    )}
                  </div>
                )}

                {/* Options chip — overlay top-left */}
                {hasVariants && (
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-white/95 text-foreground text-[9px] font-semibold uppercase tracking-wider shadow-sm">
                    Options
                  </span>
                )}

                {/* Combo dot */}
                {p.isCombo && (
                  <span
                    className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-primary text-white text-[9px] font-semibold uppercase tracking-wider shadow-sm"
                    title="Combo"
                  >
                    Set
                  </span>
                )}
              </div>

              {/* Name + price */}
              <div className="px-1">
                <div className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
                  {p.name}
                </div>
                <div className="text-primary text-base font-bold tabular-nums mt-1">
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
