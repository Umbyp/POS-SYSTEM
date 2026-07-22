'use client';
import { useState, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  const parentRef = useRef<HTMLDivElement>(null);

  // Grid: 2 columns below the `sm` breakpoint, 3 at sm+ — must track
  // grid-cols-2 sm:grid-cols-3 below exactly, or virtual rows (grouped in JS)
  // stop matching the CSS line wraps and cards overlap.
  const [columns, setColumns] = useState(3);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setColumns(mq.matches ? 3 : 2);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const rowCount = Math.ceil(products.length / columns);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // approx row height (aspect-[5/3] image + text)
    overscan: 3,
  });

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {Array.from({ length: 9 }).map((_, i) => (
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

  const hasOptions = (p: any) =>
    (p.variants && p.variants.length > 0) ||
    (p.optionGroups && p.optionGroups.length > 0);

  const handleClick = (p: any) => {
    if (hasOptions(p)) {
      setPicking(p);
    } else {
      add({
        productId: p.id,
        name: p.name,
        unitPrice: Number(p.sellingPrice),
        image: p.image,
        categoryId: p.categoryId,
      });
    }
  };

  const renderCard = (p: any) => {
    const stock = p.inventory?.quantity ?? 0;
    const lowStock = p.trackStock && stock <= (p.inventory?.lowStockAt || 10);
    const outOfStock = p.trackStock && stock === 0;
    const hasVariants = hasOptions(p);

    return (
      <button
        key={p.id}
        disabled={outOfStock}
        onClick={() => handleClick(p)}
        className="group relative bg-card rounded-lg border border-border hover:border-primary/60 hover:bg-card-hover text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
      >
        {/* Image / placeholder — single neutral surface, no decorative color */}
        <div className="aspect-[5/3] overflow-hidden bg-muted relative flex items-center justify-center">
          {p.image ? (
            <img
              src={resolveImageUrl(p.image)}
              alt={p.name}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-lg font-extrabold uppercase text-muted-foreground/50 select-none tracking-tight">
              {initials(p.name)}
            </span>
          )}

          {/* Options / Set — monochrome label, top-left */}
          {(hasVariants || p.isCombo) && (
            <div className="absolute top-2 left-2 flex gap-1">
              {hasVariants && (
                <span className="px-2 py-0.5 rounded-full bg-foreground text-background text-[10px] font-semibold">
                  ตัวเลือก
                </span>
              )}
              {p.isCombo && (
                <span className="px-2 py-0.5 rounded-full bg-foreground text-background text-[10px] font-semibold">
                  เซ็ต
                </span>
              )}
            </div>
          )}

          {/* Stock — the only status that earns a colored badge, top-right */}
          {p.trackStock && (outOfStock || lowStock) && (
            <div className="absolute top-2 right-2">
              {outOfStock ? (
                <span className="px-2 py-0.5 rounded-full bg-danger text-white text-[10px] font-semibold">
                  หมด
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-warning text-white text-[10px] font-semibold tabular-nums">
                  เหลือ {stock}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Name + price */}
        <div className="p-2.5">
          <div className="font-semibold text-[13px] leading-snug line-clamp-2 min-h-[2.25rem]">
            {p.name}
          </div>
          <div className="text-primary text-sm font-extrabold tabular-nums mt-0.5">
            {formatCurrency(p.sellingPrice)}
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <div ref={parentRef} className="h-full overflow-y-auto scrollbar-thin pr-1">
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columns;
            const rowItems = products.slice(start, start + columns);
            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute top-0 left-0 w-full pb-2.5"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {rowItems.map((p) => renderCard(p))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
            categoryId: picking.categoryId,
            notes,
            variants,
            quantity,
          });
        }}
      />
    </>
  );
}
