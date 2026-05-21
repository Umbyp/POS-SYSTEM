'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  DollarSign,
  Receipt,
  Package,
  Calendar,
  Download,
  Banknote,
  QrCode,
  CreditCard,
  Building2,
  Users as UsersIcon,
  Printer,
  Snowflake,
  Tag,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type RangeKey = 'today' | '7d' | '30d' | '90d' | 'custom';

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
];

function getRange(key: RangeKey, customFrom?: string, customTo?: string) {
  const now = new Date();
  const to = key === 'custom' && customTo ? new Date(customTo + 'T23:59:59') : now;
  let from: Date;
  if (key === 'today') {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  } else if (key === 'custom' && customFrom) {
    from = new Date(customFrom + 'T00:00:00');
  } else {
    const r = RANGES.find((r) => r.key === key) || RANGES[2];
    from = new Date(now.getTime() - r.days * 86400_000);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

const PAYMENT_META: Record<string, { label: string; icon: any; color: string }> = {
  CASH: { label: 'Cash', icon: Banknote, color: 'text-success bg-success/10' },
  PROMPTPAY: { label: 'PromptPay', icon: QrCode, color: 'text-primary bg-primary/10' },
  CREDIT_CARD: { label: 'Credit Card', icon: CreditCard, color: 'text-accent bg-accent/10' },
  BANK_TRANSFER: { label: 'Bank Transfer', icon: Building2, color: 'text-warning bg-warning/10' },
};

const TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine-in',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

export default function ReportsPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const params = useMemo(
    () => getRange(range, customFrom, customTo),
    [range, customFrom, customTo]
  );

  const { data: summary, isLoading } = useQuery({
    queryKey: ['reports-summary', params],
    queryFn: () => api.get('/reports/summary', { params }).then((r) => r.data),
  });

  const { data: daily = [] } = useQuery({
    queryKey: ['daily-sales', params],
    queryFn: () => api.get('/reports/daily-sales', { params }).then((r) => r.data),
  });

  const { data: hourly = [] } = useQuery({
    queryKey: ['hourly-sales', params],
    queryFn: () => api.get('/reports/hourly', { params }).then((r) => r.data),
  });

  const { data: byCategory = [] } = useQuery({
    queryKey: ['by-category', params],
    queryFn: () => api.get('/reports/by-category', { params }).then((r) => r.data),
  });

  const { data: cashiers = [] } = useQuery({
    queryKey: ['cashier-performance', params],
    queryFn: () => api.get('/reports/cashier-performance', { params }).then((r) => r.data),
  });

  const { data: topProfitable = [] } = useQuery({
    queryKey: ['top-profitable', params],
    queryFn: () => api.get('/reports/top-profitable', { params }).then((r) => r.data),
  });

  const { data: dayOfWeek = [] } = useQuery({
    queryKey: ['day-of-week', params],
    queryFn: () => api.get('/reports/day-of-week').then((r) => r.data),
  });

  const { data: deadStock = [] } = useQuery({
    queryKey: ['dead-stock'],
    queryFn: () => api.get('/reports/dead-stock', { params: { days: 30 } }).then((r) => r.data),
  });

  const { data: promoROI = [] } = useQuery({
    queryKey: ['promotion-roi', params],
    queryFn: () => api.get('/reports/promotion-roi', { params }).then((r) => r.data),
  });

  const exportCSV = () => {
    if (!daily.length) return;
    const headers = 'Date,Revenue,Orders\n';
    const rows = daily
      .map((d: any) => `${d.date.slice(0, 10)},${d.revenue},${d.orders}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${params.from.slice(0, 10)}-${params.to.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin space-y-4">
      {/* Header + Date range */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold">Reports</h2>
          <p className="text-xs text-muted-foreground">
            {new Date(params.from).toLocaleDateString('en-US', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            -{' '}
            {new Date(params.to).toLocaleDateString('en-US', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-muted rounded-lg p-1 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 rounded transition-colors ${
                  range === r.key ? 'bg-primary text-white' : 'text-muted-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setRange('custom')}
              className={`px-3 py-1.5 rounded transition-colors ${
                range === 'custom' ? 'bg-primary text-white' : 'text-muted-foreground'
              }`}
            >
              <Calendar className="w-3 h-3 inline mr-1" /> Custom
            </button>
          </div>

          <Button size="sm" variant="outline" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Custom date range inputs */}
      {range === 'custom' && (
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="bg-input border border-border rounded-lg px-3 py-1.5"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="bg-input border border-border rounded-lg px-3 py-1.5"
          />
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shimmer h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard
              icon={DollarSign}
              label="Total revenue"
              value={formatCurrency(summary?.revenue || 0)}
              growth={summary?.growth?.revenue}
              accent="bg-success/20 text-success"
            />
            <KpiCard
              icon={TrendingUp}
              label="Gross profit"
              value={formatCurrency(summary?.grossProfit || 0)}
              subText={`${(summary?.profitMargin || 0).toFixed(1)}% margin`}
              accent="bg-success/20 text-success"
              highlight
            />
            <KpiCard
              icon={Receipt}
              label="Orders"
              value={(summary?.orderCount || 0).toLocaleString()}
              growth={summary?.growth?.orderCount}
              accent="bg-primary/20 text-primary"
            />
            <KpiCard
              icon={TrendingUp}
              label="Avg/Ticket"
              value={formatCurrency(summary?.avgTicket || 0)}
              growth={summary?.growth?.avgTicket}
              accent="bg-accent/20 text-accent"
            />
            <KpiCard
              icon={Package}
              label="Items sold"
              value={(summary?.itemsSold || 0).toLocaleString() + ' pcs'}
              accent="bg-warning/20 text-warning"
            />
          </div>

          {/* Revenue chart */}
          <DailySalesChart daily={daily} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Hourly heatmap */}
            <HourlyChart hourly={hourly} />

            {/* Payment breakdown */}
            <PaymentBreakdown
              data={summary?.paymentBreakdown || []}
              totalRevenue={summary?.revenue || 0}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Order types */}
            <OrderTypeBreakdown
              data={summary?.orderTypeBreakdown || []}
              totalRevenue={summary?.revenue || 0}
            />

            {/* Categories */}
            <CategoryBreakdown data={byCategory} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top products */}
            <TopProducts data={summary?.topProducts || []} />

            {/* Top profitable */}
            <TopProfitable data={topProfitable} />
          </div>

          {/* Cashier performance + Promotion ROI */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CashierPerformance data={cashiers} />
            <PromotionROI data={promoROI} />
          </div>

          {/* Day-of-week heatmap */}
          <DayOfWeekHeatmap data={dayOfWeek} />

          {/* Dead stock */}
          <DeadStock data={deadStock} />
        </>
      )}
    </div>
  );
}

// ============================================================
// Components
// ============================================================

function KpiCard({
  label,
  value,
  growth,
  subText,
  highlight,
}: {
  icon?: any;
  label: string;
  value: string;
  growth?: number | null;
  subText?: string;
  accent?: string;
  highlight?: boolean;
}) {
  const isUp = growth != null && growth >= 0;
  return (
    <div
      className={`bg-card border rounded-lg p-5 ${
        highlight ? 'border-success/60' : 'border-border'
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-metric-md mt-1.5 tabular-nums truncate">
        {value}
      </div>
      {growth != null && (
        <div className="text-xs mt-2 tabular-nums">
          <span className={isUp ? 'text-success font-medium' : 'text-danger font-medium'}>
            {isUp ? '+' : ''}
            {growth.toFixed(1)}%
          </span>
          <span className="text-muted-foreground ml-1.5">vs previous period</span>
        </div>
      )}
      {subText && !growth && (
        <div className="text-xs text-muted-foreground mt-2">{subText}</div>
      )}
    </div>
  );
}

function DailySalesChart({ daily }: { daily: any[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const revenues = daily.map((d: any) => d.revenue || 0);
  const maxRevenue = Math.max(...revenues, 1);
  const totalRevenue = revenues.reduce((s: number, v: number) => s + v, 0);
  const avgRevenue = daily.length ? totalRevenue / daily.length : 0;
  const best = daily.length
    ? daily.reduce((p: any, c: any) => ((c.revenue || 0) > (p.revenue || 0) ? c : p))
    : null;

  // Round Y-axis nicely (e.g. 1500 → 2000, 12000 → 15000)
  const niceMax = (() => {
    if (maxRevenue <= 1000) return Math.ceil(maxRevenue / 100) * 100;
    if (maxRevenue <= 10000) return Math.ceil(maxRevenue / 1000) * 1000;
    if (maxRevenue <= 100000) return Math.ceil(maxRevenue / 5000) * 5000;
    return Math.ceil(maxRevenue / 10000) * 10000;
  })();
  const ySteps = [0, 0.25, 0.5, 0.75, 1].map((p) => niceMax * p);
  const avgPct = niceMax > 0 ? (avgRevenue / niceMax) * 100 : 0;

  // X-axis label strategy — show every N bars when there are many
  const labelEvery =
    daily.length <= 14 ? 1 : daily.length <= 31 ? 3 : daily.length <= 60 ? 7 : 14;

  const fmtCompact = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
    return Math.round(n).toString();
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Daily revenue</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total{' '}
            <span className="text-accent font-medium">
              {formatCurrency(totalRevenue)}
            </span>{' '}
            · Avg {formatCurrency(avgRevenue)}/day · {daily.length} day{daily.length !== 1 ? 's' : ''}
          </p>
        </div>
        {best && (
          <div className="text-right text-xs">
            <div className="text-muted-foreground">Best day</div>
            <div className="font-medium">
              {new Date(best.date).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
              })}{' '}
              · <span className="text-accent">{formatCurrency(best.revenue)}</span>
            </div>
          </div>
        )}
      </div>

      {daily.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No data in this range
        </div>
      ) : (
        <>
          {/* Chart area with Y-axis + grid */}
          <div className="flex gap-2 h-56">
            {/* Y-axis labels */}
            <div className="flex flex-col-reverse justify-between text-[10px] text-muted-foreground tabular-nums py-1 w-10 text-right pr-1">
              {ySteps.map((v) => (
                <div key={v}>{fmtCompact(v)}</div>
              ))}
            </div>

            {/* Bars area */}
            <div className="flex-1 relative">
              {/* Grid lines */}
              <div className="absolute inset-0 flex flex-col-reverse justify-between pointer-events-none">
                {ySteps.map((_, i) => (
                  <div
                    key={i}
                    className={`border-t ${
                      i === 0 ? 'border-border' : 'border-border/30'
                    }`}
                  />
                ))}
              </div>

              {/* Average line */}
              {avgRevenue > 0 && (
                <div
                  className="absolute left-0 right-0 border-t-2 border-dashed border-warning/60 pointer-events-none z-10"
                  style={{ bottom: `${avgPct}%` }}
                >
                  <span className="absolute -top-4 right-0 text-[10px] text-warning bg-card px-1 rounded">
                    Avg {fmtCompact(avgRevenue)}
                  </span>
                </div>
              )}

              {/* Bars */}
              <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5 overflow-x-auto scrollbar-thin">
                {daily.map((d: any, i: number) => {
                  const pct = (d.revenue || 0) / niceMax * 100;
                  const date = new Date(d.date);
                  const today = new Date();
                  const isToday = date.toDateString() === today.toDateString();
                  const isBest = best && d.date === best.date;
                  const hovered = hoverIdx === i;

                  return (
                    <div
                      key={d.date}
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                      className="flex-1 min-w-[14px] flex flex-col items-center justify-end relative cursor-pointer"
                    >
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          isToday
                            ? 'bg-accent shadow-[0_0_12px_rgba(236,72,153,0.5)]'
                            : isBest
                            ? 'bg-warning'
                            : hovered
                            ? 'bg-accent'
                            : 'bg-primary'
                        }`}
                        style={{ height: `${Math.max(pct, 1.5)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* X-axis labels under chart */}
          <div className="flex gap-2 mt-1">
            <div className="w-10" />
            <div className="flex-1 flex gap-1 sm:gap-1.5">
              {daily.map((d: any, i: number) => {
                const date = new Date(d.date);
                const showLabel =
                  i === 0 || i === daily.length - 1 || i % labelEvery === 0;
                const today = new Date();
                const isToday = date.toDateString() === today.toDateString();
                return (
                  <div
                    key={d.date}
                    className="flex-1 min-w-[14px] text-center"
                    style={{ visibility: showLabel ? 'visible' : 'hidden' }}
                  >
                    <div
                      className={`text-[10px] tabular-nums ${
                        isToday ? 'text-accent font-bold' : 'text-muted-foreground'
                      }`}
                    >
                      {date.getDate()}
                    </div>
                    <div className="text-[8px] text-muted-foreground/60">
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail strip when hovering */}
          {hoverIdx !== null && daily[hoverIdx] && (
            <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Date</div>
                <div className="font-medium">
                  {new Date(daily[hoverIdx].date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Revenue · Orders</div>
                <div className="tabular-nums">
                  <span className="text-accent font-bold text-lg">
                    {formatCurrency(daily[hoverIdx].revenue || 0)}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    · {daily[hoverIdx].orders} orders
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary" /> Revenue
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-accent shadow-[0_0_6px_rgba(236,72,153,0.6)]" />{' '}
              Today
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-warning" /> Best day
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t-2 border-dashed border-warning/60" />{' '}
              Average line
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HourlyChart({ hourly }: { hourly: any[] }) {
  const maxOrders = Math.max(...hourly.map((h: any) => h.orders || 0), 1);
  const peak = hourly.length
    ? hourly.reduce((p: any, c: any) => ((c.orders || 0) > (p.orders || 0) ? c : p))
    : null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Peak hours</h3>
          {peak && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Peak: <span className="text-accent font-medium">
                {String(peak.hour).padStart(2, '0')}:00
              </span>
            </p>
          )}
        </div>
      </div>

      {hourly.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="flex items-end gap-0.5 h-32">
          {Array.from({ length: 24 }).map((_, h) => {
            const d = hourly.find((x: any) => x.hour === h);
            const pct = d ? ((d.orders || 0) / maxOrders) * 100 : 0;
            return (
              <div key={h} className="flex-1 flex flex-col items-center justify-end group">
                <div className="absolute -top-8 bg-popover border border-border px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {String(h).padStart(2, '0')}:00 — {d?.orders || 0} orders
                </div>
                <div
                  className="w-full bg-primary/70 hover:bg-accent rounded-t transition-colors"
                  style={{ height: `${Math.max(pct, d ? 4 : 0)}%` }}
                />
                {h % 4 === 0 && (
                  <div className="text-[9px] text-muted-foreground mt-1">
                    {String(h).padStart(2, '0')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaymentBreakdown({
  data,
  totalRevenue,
}: {
  data: any[];
  totalRevenue: number;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <h3 className="font-semibold mb-3">Payment channels</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No data</p>
      ) : (
        <div className="space-y-2">
          {data.map((p: any) => {
            const meta = PAYMENT_META[p.method] || {
              label: p.method,
              icon: DollarSign,
              color: 'text-muted-foreground bg-muted',
            };
            const Icon = meta.icon;
            const pct = totalRevenue > 0 ? (p.amount / totalRevenue) * 100 : 0;
            return (
              <div key={p.method} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-medium">{meta.label}</span>
                    <span className="text-xs text-muted-foreground">({p.count})</span>
                  </div>
                  <span className="tabular-nums font-medium">
                    {formatCurrency(p.amount)}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[10px] text-right text-muted-foreground tabular-nums">
                  {pct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrderTypeBreakdown({
  data,
  totalRevenue,
}: {
  data: any[];
  totalRevenue: number;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <h3 className="font-semibold mb-3">Order types</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No data</p>
      ) : (
        <div className="space-y-2.5">
          {data.map((t: any) => {
            const pct = totalRevenue > 0 ? (t.amount / totalRevenue) * 100 : 0;
            return (
              <div key={t.type}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">
                    {TYPE_LABEL[t.type] || t.type}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({t.count})
                    </span>
                  </span>
                  <span className="tabular-nums">{formatCurrency(t.amount)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryBreakdown({ data }: { data: any[] }) {
  const max = Math.max(...data.map((d: any) => d.revenue || 0), 1);
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <h3 className="font-semibold mb-3">Sales by category</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No data</p>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 6).map((c: any) => {
            const pct = ((c.revenue || 0) / max) * 100;
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium flex items-center gap-1.5">
                    <span>{c.icon || '📦'}</span>
                    {c.name}
                    <span className="text-xs text-muted-foreground">
                      ({c.quantity})
                    </span>
                  </span>
                  <span className="tabular-nums">{formatCurrency(c.revenue)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopProducts({ data }: { data: any[] }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <h3 className="font-semibold mb-3">Top 10 best sellers</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No data</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
          {data.map((tp: any, i: number) => (
            <div
              key={tp.product?.id || i}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    i === 0
                      ? 'bg-warning/20 text-warning'
                      : i === 1
                      ? 'bg-muted-foreground/20 text-muted-foreground'
                      : i === 2
                      ? 'bg-accent/20 text-accent'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </div>
                <span className="text-sm font-medium truncate">
                  {tp.product?.name || 'Unknown'}
                </span>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div className="text-sm tabular-nums">
                  <span className="font-bold text-accent">{tp.quantity}</span>
                  <span className="text-xs text-muted-foreground ml-0.5">pcs</span>
                </div>
                {tp.revenue > 0 && (
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {formatCurrency(tp.revenue)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopProfitable({ data }: { data: any[] }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        💎 Top 10 most profitable
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No data</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
          {data.map((p: any, i: number) => (
            <div
              key={p.id || i}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    i === 0
                      ? 'bg-warning/20 text-warning'
                      : i === 1
                      ? 'bg-muted-foreground/20 text-muted-foreground'
                      : i === 2
                      ? 'bg-accent/20 text-accent'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {p.quantity} pcs · margin {p.margin?.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div className="text-sm font-bold text-success tabular-nums">
                  +{formatCurrency(p.profit || 0)}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  from {formatCurrency(p.revenue || 0)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromotionROI({ data }: { data: any[] }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Tag className="w-4 h-4 text-accent" /> Promotion ROI
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No promotions yet
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((p: any) => {
            const netRevenue = p.revenue - p.totalDiscount;
            const roiText = p.totalDiscount > 0
              ? `${(p.revenue / p.totalDiscount).toFixed(1)}x`
              : '—';
            return (
              <div key={p.id} className="p-3 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm truncate">{p.name}</span>
                  <Badge variant="accent" className="text-[10px]">{p.type}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                  <div>
                    <div className="text-muted-foreground">Used</div>
                    <div className="font-bold tabular-nums">{p.ordersUsed} orders</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Revenue</div>
                    <div className="font-bold tabular-nums">{formatCurrency(p.revenue)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Discount given</div>
                    <div className="font-bold tabular-nums text-warning">
                      -{formatCurrency(p.totalDiscount)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">ROI</span>
                  <span className={`font-bold tabular-nums ${
                    p.totalDiscount === 0 ? 'text-muted-foreground' :
                    p.revenue >= p.totalDiscount * 5 ? 'text-success' :
                    p.revenue >= p.totalDiscount * 2 ? 'text-foreground' :
                    'text-danger'
                  }`}>
                    {roiText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DayOfWeekHeatmap({ data }: { data: any[] }) {
  const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const max = Math.max(...data.map((d: any) => d.revenue || 0), 1);
  const grid: Record<number, Record<number, any>> = {};
  for (const d of data) {
    if (!grid[d.dow]) grid[d.dow] = {};
    grid[d.dow][d.hour] = d;
  }
  const dowTotals = Array.from({ length: 7 }, (_, dow) => {
    return data.filter((d: any) => d.dow === dow).reduce((s: number, d: any) => s + (d.revenue || 0), 0);
  });
  const bestDow = dowTotals.indexOf(Math.max(...dowTotals));

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">📅 Day × Hour heatmap (last 90 days)</h3>
        {bestDow >= 0 && (
          <span className="text-xs text-muted-foreground">
            Best day: <span className="text-accent font-medium">{DOW_LABEL[bestDow]}</span>
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No data</p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[600px]">
            {/* Header: hours */}
            <div className="grid grid-cols-[40px_repeat(24,1fr)] gap-0.5 mb-0.5">
              <div className="text-[10px] text-muted-foreground" />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="text-[8px] text-center text-muted-foreground">
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                </div>
              ))}
            </div>
            {/* Rows */}
            {Array.from({ length: 7 }, (_, dow) => (
              <div key={dow} className="grid grid-cols-[40px_repeat(24,1fr)] gap-0.5 mb-0.5">
                <div className="text-[10px] text-muted-foreground flex items-center font-medium">
                  {DOW_LABEL[dow]}
                </div>
                {Array.from({ length: 24 }, (_, h) => {
                  const cell = grid[dow]?.[h];
                  const intensity = cell ? Math.min(1, cell.revenue / max) : 0;
                  return (
                    <div
                      key={h}
                      className="aspect-square rounded relative group cursor-pointer"
                      style={{
                        backgroundColor:
                          intensity === 0
                            ? 'rgba(255,255,255,0.05)'
                            : `rgba(124, 77, 255, ${0.2 + intensity * 0.8})`,
                      }}
                    >
                      {cell && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border border-border px-2 py-1 rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                          {DOW_LABEL[dow]} {String(h).padStart(2, '0')}:00
                          <br />
                          {formatCurrency(cell.revenue)} · {cell.orders} orders
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-muted-foreground">
              <span>Low</span>
              <div className="flex gap-0.5">
                {[0.2, 0.4, 0.6, 0.8, 1].map((v) => (
                  <div
                    key={v}
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: `rgba(124, 77, 255, ${v})` }}
                  />
                ))}
              </div>
              <span>High</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeadStock({ data }: { data: any[] }) {
  const totalTiedUp = data.reduce((s: number, d: any) => s + (d.tiedUpCost || 0), 0);
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Snowflake className="w-4 h-4 text-primary" /> 🐢 Dead stock (30 days)
        </h3>
        {data.length > 0 && (
          <span className="text-xs">
            <span className="text-muted-foreground">Capital tied up: </span>
            <span className="text-danger font-bold tabular-nums">
              {formatCurrency(totalTiedUp)}
            </span>
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-success text-center py-4">
          ✅ No dead stock — all items moving normally
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="p-2">Product</th>
                <th className="p-2 text-right">In stock</th>
                <th className="p-2 text-right">Price</th>
                <th className="p-2 text-right">Tied up</th>
                <th className="p-2 text-right">Idle for</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 20).map((d: any) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-2">
                    <div className="font-medium">
                      {d.categoryIcon} {d.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">{d.sku}</div>
                  </td>
                  <td className="p-2 text-right tabular-nums">{d.quantity}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(d.sellingPrice)}
                  </td>
                  <td className="p-2 text-right tabular-nums text-danger font-medium">
                    {formatCurrency(d.tiedUpCost)}
                  </td>
                  <td className="p-2 text-right text-xs">
                    <Badge variant={d.daysSinceSale > 60 ? 'danger' : 'warning'} className="text-[10px]">
                      {d.daysSinceSale > 365 ? 'Never sold' : `${d.daysSinceSale} days`}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CashierPerformance({ data }: { data: any[] }) {
  const maxRev = Math.max(...data.map((c: any) => c.revenue || 0), 1);
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <UsersIcon className="w-4 h-4" /> Sales by cashier
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No data</p>
      ) : (
        <div className="space-y-2">
          {data.map((c: any, i: number) => {
            const pct = ((c.revenue || 0) / maxRev) * 100;
            const initial = c.cashier?.name?.[0] || '?';
            return (
              <div key={c.cashier?.id || i}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                      {initial}
                    </div>
                    <div>
                      <div className="font-medium">{c.cashier?.name}</div>
                      <Badge variant="default" className="text-[9px] mt-0.5">
                        {c.cashier?.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums font-medium">
                      {formatCurrency(c.revenue)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.orderCount} orders
                    </div>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
