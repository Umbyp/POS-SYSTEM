'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Search, Edit3 } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { StockAdjustDialog } from '@/components/inventory/StockAdjustDialog';
import { useT } from '@/lib/i18n';

const TYPE_META: Record<string, { labelKey: string; color: string }> = {
  PURCHASE: { labelKey: 'inventoryPage.type.PURCHASE', color: 'text-success' },
  SALE: { labelKey: 'inventoryPage.type.SALE', color: 'text-muted-foreground' },
  RETURN: { labelKey: 'inventoryPage.type.RETURN', color: 'text-warning' },
  ADJUSTMENT: { labelKey: 'inventoryPage.type.ADJUSTMENT', color: 'text-primary' },
  WASTE: { labelKey: 'inventoryPage.type.WASTE', color: 'text-danger' },
};

export default function InventoryPage() {
  const t = useT();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [adjusting, setAdjusting] = useState<any>(null);

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then((r) => r.data),
  });

  const { data: movements = [] } = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: () => api.get('/inventory/movements').then((r) => r.data),
  });

  const filtered = inventory.filter((i: any) => {
    if (q && !i.product.name.toLowerCase().includes(q.toLowerCase()) &&
        !i.product.sku.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'low' && i.quantity > i.lowStockAt) return false;
    return true;
  });

  const lowStock = inventory.filter((i: any) => i.quantity <= i.lowStockAt);
  const outOfStock = inventory.filter((i: any) => i.quantity === 0);

  const urgent = filtered
    .filter((i: any) => i.quantity <= i.lowStockAt)
    .sort((a: any, b: any) => a.quantity - b.quantity);
  const normal = filtered.filter((i: any) => i.quantity > i.lowStockAt);

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin space-y-5">
      {/* Header + counts */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
          {t('inventoryPage.itemsTitle')}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-danger bg-danger/10 px-2.5 py-1.5 rounded-full">
            {t('inventoryPage.statusOut')} {outOfStock.length}
          </span>
          <span className="font-bold text-warning bg-warning/10 px-2.5 py-1.5 rounded-full">
            {t('inventoryPage.lowStock')} {lowStock.length}
          </span>
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('inventoryPage.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 h-10 rounded-lg"
          />
        </div>
        <div className="flex border border-border rounded-lg p-0.5 text-xs">
          {(
            [
              { k: 'all', label: t('pos.all') },
              { k: 'low', label: `${t('inventoryPage.lowStock')} (${lowStock.length})` },
            ] as const
          ).map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                filter === f.k
                  ? 'bg-foreground text-background font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Boxes className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">{t('inventoryPage.noneFound')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {urgent.length > 0 && (
            <div>
              <div className="text-[11.5px] font-extrabold text-muted-foreground uppercase tracking-wide mb-2">
                {t('inventoryPage.needsAttention')}
              </div>
              <div className="space-y-2">
                {urgent.map((i: any) => {
                  const out = i.quantity === 0;
                  return (
                    <div
                      key={i.id}
                      className={`bg-card border rounded-xl pl-3.5 pr-3.5 py-3 flex items-center gap-3.5 flex-wrap ${
                        out ? 'border-danger/30 border-l-4 border-l-danger' : 'border-border border-l-4 border-l-warning'
                      }`}
                    >
                      <div className="flex-1 min-w-[160px]">
                        <div className="text-sm font-bold">{i.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('inventoryPage.remaining')}{' '}
                          <b className={out ? 'text-danger' : 'text-warning'}>{i.quantity}</b>{' '}
                          · {t('inventoryPage.colMin')} {i.lowStockAt}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                          out ? 'text-danger bg-danger/10' : 'text-warning bg-warning/10'
                        }`}
                      >
                        {out ? t('inventoryPage.statusOut') : t('inventoryPage.statusLow')}
                      </span>
                      {out ? (
                        <Button size="sm" onClick={() => setAdjusting(i)}>
                          {t('inventoryPage.receiveStock')}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setAdjusting(i)}>
                          <Edit3 className="w-3.5 h-3.5 mr-1.5" /> {t('inventoryPage.adjustStock')}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {normal.length > 0 && (
            <div>
              <div className="text-[11.5px] font-extrabold text-muted-foreground uppercase tracking-wide mb-2">
                {t('inventoryPage.normalSection')}
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {normal.map((i: any) => (
                  <button
                    key={i.id}
                    onClick={() => setAdjusting(i)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-card-hover transition-colors text-left"
                  >
                    <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                    <div className="flex-1 min-w-0 text-sm font-semibold truncate">{i.product.name}</div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {t('inventoryPage.colMin')} {i.lowStockAt}
                    </div>
                    <div className="text-sm font-bold tabular-nums w-11 text-right shrink-0">
                      {i.quantity}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent movements */}
      <div>
        <h3 className="text-[11.5px] font-extrabold text-muted-foreground uppercase tracking-wide mb-2">
          {t('inventoryPage.recentMovements')}
        </h3>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              {t('inventoryPage.noMovements')}
            </p>
          ) : (
            <div className="divide-y divide-border max-h-96 overflow-y-auto scrollbar-thin">
              {movements.slice(0, 30).map((m: any) => {
                const meta = TYPE_META[m.type];
                const label = meta ? t(meta.labelKey) : m.type;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-card-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-[10px]">
                          {label}
                        </Badge>
                        <span className="font-medium text-sm truncate">
                          {m.inventory?.product?.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDate(m.createdAt)}
                        {m.reason && ` · ${m.reason}`}
                      </div>
                    </div>
                    <div
                      className={`text-right tabular-nums font-bold shrink-0 ${
                        m.quantity > 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {m.quantity > 0 ? '+' : ''}
                      {m.quantity}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {adjusting && (
        <StockAdjustDialog
          open={!!adjusting}
          item={adjusting}
          onClose={() => setAdjusting(null)}
        />
      )}
    </div>
  );
}
