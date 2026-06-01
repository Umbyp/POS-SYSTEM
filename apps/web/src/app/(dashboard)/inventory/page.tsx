'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Boxes,
  Search,
  PackagePlus,
  TrendingDown,
  ClipboardCheck,
  Edit3,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { StockAdjustDialog } from '@/components/inventory/StockAdjustDialog';

const TYPE_META: Record<string, { label: string; color: string }> = {
  PURCHASE: { label: 'Received', color: 'text-success' },
  SALE: { label: 'Sold', color: 'text-muted-foreground' },
  RETURN: { label: 'Return', color: 'text-warning' },
  ADJUSTMENT: { label: 'Adjustment', color: 'text-primary' },
  WASTE: { label: 'Waste/Loss', color: 'text-danger' },
};

export default function InventoryPage() {
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

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin space-y-5">
      {/* KPIs — flat */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total SKUs" value={inventory.length} />
        <Kpi
          label="Low stock"
          value={lowStock.length}
          tone={lowStock.length > 0 ? 'warning' : 'default'}
        />
        <Kpi
          label="Out of stock"
          value={outOfStock.length}
          tone={outOfStock.length > 0 ? 'warning' : 'default'}
        />
        <Kpi
          label="Total units"
          value={inventory.reduce((s: number, i: any) => s + i.quantity, 0)}
        />
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search product / SKU..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex border border-border rounded-md p-0.5 text-xs">
          {(
            [
              { k: 'all', label: 'All' },
              { k: 'low', label: `Low stock (${lowStock.length})` },
            ] as const
          ).map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`px-3 py-1.5 rounded-sm transition-colors ${
                filter === f.k
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory list */}
      <div>
        <h3 className="font-semibold mb-3">Inventory items ({filtered.length})</h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer h-16 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Boxes className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No items found</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3 text-right">In stock</th>
                  <th className="p-3 text-right">Min</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right w-32">Adjust</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i: any) => {
                  const low = i.quantity <= i.lowStockAt;
                  return (
                    <tr key={i.id} className="border-t border-border hover:bg-card-hover">
                      <td className="p-3">
                        <div className="font-medium">{i.product.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {i.product.sku}
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums font-bold text-lg">
                        {i.quantity}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {i.lowStockAt}
                      </td>
                      <td className="p-3">
                        {i.quantity === 0 ? (
                          <Badge variant="danger">Out</Badge>
                        ) : low ? (
                          <Badge variant="warning">Low</Badge>
                        ) : (
                          <Badge variant="success">Normal</Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setAdjusting(i)}>
                          <Edit3 className="w-3.5 h-3.5 mr-1" /> Adjust
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {filtered.map((i: any) => {
                const low = i.quantity <= i.lowStockAt;
                return (
                  <div key={i.id} className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{i.product.name}</div>
                        <div className="flex gap-1 flex-wrap mt-0.5">
                          {i.quantity === 0 ? (
                            <Badge variant="danger" className="text-[10px]">Out</Badge>
                          ) : low ? (
                            <Badge variant="warning" className="text-[10px]">Low</Badge>
                          ) : (
                            <Badge variant="success" className="text-[10px]">Normal</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-bold tabular-nums">{i.quantity}</div>
                        <div className="text-[10px] text-muted-foreground">
                          Min {i.lowStockAt}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setAdjusting(i)}>
                      <Edit3 className="w-3.5 h-3.5 mr-1" /> Adjust stock
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent movements */}
      <div>
        <h3 className="font-semibold mb-3">Recent movements</h3>
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              No movements yet
            </p>
          ) : (
            <div className="divide-y divide-border max-h-96 overflow-y-auto scrollbar-thin">
              {movements.slice(0, 30).map((m: any) => {
                const meta = TYPE_META[m.type] || { label: m.type, color: '' };
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-card-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-[10px]">
                          {meta.label}
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

function Kpi({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className={`bg-card border rounded-lg p-4 ${
        tone === 'warning' ? 'border-warning/60' : 'border-border'
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-metric-md mt-1.5">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
