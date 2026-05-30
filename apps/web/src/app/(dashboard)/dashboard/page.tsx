'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAuth } from '@/stores/auth.store';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { formatCurrency, formatTime } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AIInsightsWidget } from '@/components/dashboard/AIInsightsWidget';

const STATUS_VARIANT: Record<string, any> = {
  PENDING: 'warning',
  PREPARING: 'accent',
  READY: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'danger',
};

const PAYMENT_EMOJI: Record<string, string> = {
  CASH: '💵',
  PROMPTPAY: '📱',
  CREDIT_CARD: '💳',
  BANK_TRANSFER: '🏦',
};

export default function DashboardPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const user = useAuth((s) => s.user);

  // If not OWNER/ADMIN → redirect to POS
  useEffect(() => {
    if (user && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      router.replace('/pos');
    }
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get('/dashboard/overview').then((r) => r.data),
    refetchInterval: 30_000, // 30s
    enabled: !!user && (user.role === 'OWNER' || user.role === 'ADMIN'),
  });

  // Realtime invalidate via socket
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ['dashboard-overview'] });
    s.on('order:created', refresh);
    s.on('order:status', refresh);
    s.on('order:refunded', refresh);
    s.on('table:updated', refresh);
    s.on('stock:updated', refresh);
    return () => {
      s.off('order:created', refresh);
      s.off('order:status', refresh);
      s.off('order:refunded', refresh);
      s.off('table:updated', refresh);
      s.off('stock:updated', refresh);
    };
  }, [qc]);

  if (isLoading || !data) {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="shimmer h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const { today, month, goals, restaurant, alerts, topItems, hourly, recentOrders, activePromotions, customers, insights } = data;

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin space-y-4">
      {/* === Hero: Today revenue + profit + Goal === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Today Revenue — flat, no gradient */}
        <div className="lg:col-span-2 rounded-lg bg-card border border-border p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Today's revenue
            </div>
            {today.vsYesterdayPct != null && (
              <div
                className={`text-xs tabular-nums font-medium ${
                  today.vsYesterdayPct >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {today.vsYesterdayPct >= 0 ? '+' : ''}
                {today.vsYesterdayPct.toFixed(1)}%
                <span className="text-muted-foreground font-normal ml-1">vs yesterday</span>
              </div>
            )}
          </div>
          <div className="text-metric-lg tabular-nums tracking-tight">
            {formatCurrency(today.revenue)}
          </div>
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-border">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Profit
              </div>
              <div className={`text-lg font-semibold tabular-nums ${today.profit >= 0 ? 'text-foreground' : 'text-danger'}`}>
                {formatCurrency(today.profit)}
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  {today.margin.toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Orders
              </div>
              <div className="text-lg font-semibold tabular-nums">{today.orders}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Avg/Ticket
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {formatCurrency(today.avgTicket)}
              </div>
            </div>
          </div>
        </div>

        {/* Goal — minimal */}
        <div className="rounded-lg bg-card border border-border p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4">
            Goals
          </div>
          {goals.dailyTarget > 0 || goals.monthlyTarget > 0 ? (
            <div className="space-y-4">
              {goals.dailyTarget > 0 && (
                <GoalRow label="Today" actual={goals.dailyActual} target={goals.dailyTarget} pct={goals.dailyPct} />
              )}
              {goals.monthlyTarget > 0 && (
                <GoalRow label="This month" actual={goals.monthlyActual} target={goals.monthlyTarget} pct={goals.monthlyPct} />
              )}
              {goals.monthlyTarget > 0 && month.projection > 0 && (
                <div className="text-[11px] text-muted-foreground pt-3 border-t border-border">
                  End-of-month forecast{' '}
                  <span className="text-foreground font-medium">
                    {formatCurrency(month.projection)}
                  </span>
                  <span className="ml-1">
                    ({((month.projection / goals.monthlyTarget) * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>
          ) : (
            <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground">
              Set goals in Settings →
            </Link>
          )}
        </div>
      </div>

      {/* === Smart Insights === */}
      {insights.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Today's summary
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {insights.map((ins: any, i: number) => (
              <InsightChip key={i} {...ins} />
            ))}
          </div>
        </div>
      )}

      {/* === Status grid: clean, no icons === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStat
          label="Kitchen queue"
          value={`${restaurant.pendingKitchen}`}
          href="/kds"
          urgent={restaurant.pendingKitchen > 5}
        />
        <QuickStat
          label="Active tables"
          value={`${restaurant.activeTables}/${restaurant.totalTables}`}
          href="/tables"
        />
        <QuickStat
          label="New customers today"
          value={`+${customers.newToday}`}
          subText={`Total ${customers.total}`}
          href="/customers"
        />
        <QuickStat
          label="Low stock"
          value={`${alerts.lowStock.length}`}
          subText={alerts.outOfStockCount > 0 ? `${alerts.outOfStockCount} out` : 'Normal'}
          href="/inventory"
          urgent={alerts.outOfStockCount > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Hourly mini chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Hourly revenue</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Today</p>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {today.orders} orders
            </span>
          </div>
          <HourlyChart hourly={hourly} />
        </div>

        {/* Top Items today */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Top sellers today</h3>
          {topItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              No orders yet
            </p>
          ) : (
            <div className="space-y-2.5">
              {topItems.slice(0, 5).map((it: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="text-xs text-muted-foreground tabular-nums w-4 text-right">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{it.name}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {formatCurrency(it.revenue)}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums text-sm shrink-0">{it.qty}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Recent Orders feed */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Recent orders</h3>
            <Link href="/orders" className="text-xs text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No orders yet</p>
          ) : (
            <div className="space-y-0 max-h-80 overflow-y-auto scrollbar-thin -mx-2">
              {recentOrders.map((o: any) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-card-hover transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      o.status === 'COMPLETED' ? 'bg-success' :
                      o.status === 'REFUNDED' || o.status === 'CANCELLED' ? 'bg-danger' :
                      'bg-warning'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">{o.orderNumber}</span>
                      {o.paymentMethod && (
                        <span className="text-[10px] text-muted-foreground">{o.paymentMethod}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {o.tableNumber && `Table ${o.tableNumber} · `}
                      {o.customerName && `${o.customerName} · `}
                      {o.itemCount} items · {formatTime(o.createdAt)}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums text-sm shrink-0">
                    {formatCurrency(o.total)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Stock to watch</h3>
            <Link href="/inventory" className="text-xs text-muted-foreground hover:text-foreground">
              View inventory →
            </Link>
          </div>
          {alerts.lowStock.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              All stock levels are normal
            </div>
          ) : (
            <div className="space-y-0 -mx-2">
              {alerts.lowStock.map((s: any) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-card-hover"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      s.quantity === 0 ? 'bg-danger' : 'bg-warning'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Min {s.lowStockAt}
                    </div>
                  </div>
                  <div
                    className={`text-lg font-semibold tabular-nums shrink-0 ${
                      s.quantity === 0 ? 'text-danger' : 'text-warning'
                    }`}
                  >
                    {s.quantity}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Insights */}
      <AIInsightsWidget />

      {/* Active Promotions */}
      {activePromotions.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">Active promotions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activePromotions.map((p: any) => (
              <div
                key={p.id}
                className="p-3 rounded-md bg-card-hover border border-border"
              >
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                  <span>
                    {p.type === 'PERCENT_OFF' && `${p.value}% off`}
                    {p.type === 'FIXED_OFF' && `฿${p.value} off`}
                    {p.type === 'BUY_X_GET_Y' && 'Buy & get free'}
                    {p.type === 'FIXED_PRICE' && `฿${p.value} fixed`}
                  </span>
                  {p.usageLimit && (
                    <span className="tabular-nums">
                      {p.usageCount}/{p.usageLimit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer link to reports */}
      <Link
        href="/reports"
        className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-card-hover transition-colors text-sm text-muted-foreground hover:text-foreground"
      >
        View detailed reports <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function GoalRow({ label, actual, target, pct }: { label: string; actual: number; target: number; pct: number | null }) {
  const p = Math.min(pct || 0, 100);
  const onTrack = (pct || 0) >= 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`tabular-nums font-semibold text-sm ${onTrack ? 'text-success' : 'text-foreground'}`}>
          {(pct || 0).toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-card-hover rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${onTrack ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${p}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
        {formatCurrency(actual)} / {formatCurrency(target)}
      </div>
    </div>
  );
}

function InsightChip({ type, text }: { type: string; text: string }) {
  // Use leading colored dot instead of colored border — cleaner
  const dotColor =
    type === 'positive' ? 'bg-success'
    : type === 'warning' ? 'bg-warning'
    : type === 'critical' ? 'bg-danger'
    : 'bg-muted-foreground';
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-md bg-card-hover/40 text-sm">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 shrink-0`} />
      <span className="flex-1 text-foreground/90">{text}</span>
    </div>
  );
}

function QuickStat({
  label,
  value,
  subText,
  href,
  urgent,
}: {
  label: string;
  value: string;
  subText?: string;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block p-4 rounded-lg border bg-card hover:bg-card-hover transition-colors ${
        urgent ? 'border-danger/60' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {urgent && <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />}
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1.5 tracking-tight">{value}</div>
      {subText && <div className="text-[10px] text-muted-foreground mt-0.5">{subText}</div>}
    </Link>
  );
}

function HourlyChart({ hourly }: { hourly: any[] }) {
  const max = Math.max(...hourly.map((h) => h.revenue), 1);
  const now = new Date().getHours();
  return (
    <div className="flex items-end gap-0.5 h-28">
      {hourly.map((h) => {
        const pct = (h.revenue / max) * 100;
        const isNow = h.hour === now;
        const isPast = h.hour < now;
        return (
          <div key={h.hour} className="flex-1 flex flex-col items-center justify-end group relative">
            <div className="absolute -top-7 text-[10px] bg-card border border-border px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              {String(h.hour).padStart(2, '0')}:00 · {formatCurrency(h.revenue)}
            </div>
            <div
              className={`w-full rounded-sm transition-colors ${
                isNow
                  ? 'bg-foreground'
                  : isPast
                  ? 'bg-primary/70 group-hover:bg-primary'
                  : 'bg-card-hover'
              }`}
              style={{ height: `${Math.max(pct, h.revenue > 0 ? 4 : 1)}%` }}
            />
            {h.hour % 4 === 0 && (
              <div className="text-[9px] text-muted-foreground mt-1.5 tabular-nums">
                {String(h.hour).padStart(2, '0')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
