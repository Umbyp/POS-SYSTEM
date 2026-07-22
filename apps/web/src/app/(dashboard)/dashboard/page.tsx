'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowRight,
  Receipt,
  CreditCard,
  Coins,
  Box,
  ChefHat,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { formatCurrency, formatTime } from '@/lib/format';
import { useT } from '@/lib/i18n';

const STATUS_VARIANT: Record<string, any> = {
  PENDING: 'warning',
  PREPARING: 'accent',
  READY: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'danger',
};

type Period = 'today' | 'month';

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'dash.greeting.morning';
  if (h < 18) return 'dash.greeting.afternoon';
  return 'dash.greeting.evening';
}

export default function DashboardPage() {
  const t = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [period, setPeriod] = useState<Period>('today');

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

  // Shares the 'shift-active' query cache with ShiftButton — no extra request.
  const { data: activeShift } = useQuery({
    queryKey: ['shift-active'],
    queryFn: () => api.get('/employees/shifts/active').then((r) => r.data),
    refetchInterval: 30_000,
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

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }).format(
        new Date()
      ),
    []
  );

  const openDuration = useMemo(() => {
    if (!activeShift?.startTime) return null;
    const mins = Math.max(0, Math.floor((Date.now() - new Date(activeShift.startTime).getTime()) / 60000));
    return `${Math.floor(mins / 60)} ${t('dash.hoursShort')} ${mins % 60} ${t('dash.minutesShort')}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShift?.startTime]);

  if (isLoading || !data) {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="shimmer h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const { today, month, goals, restaurant, alerts, topItems, hourly, recentOrders, customers, insights } = data;

  // Needs-attention items — only built from real, currently-true signals
  // (no fabricated "table waiting" alert; the API doesn't compute per-table
  // wait times, only aggregate counts — see order.service.ts / dashboard.routes.ts).
  const outOfStock = (alerts.lowStock as any[]).filter((s) => s.quantity === 0);
  const lowOnly = (alerts.lowStock as any[]).filter((s) => s.quantity > 0);
  const kitchenBusy = restaurant.pendingKitchen > 5;
  const otherInsights = (insights as any[]).filter(
    (i) => (i.type === 'critical' || i.type === 'warning') && !i.text.includes('สต๊อก') && !i.text.includes('สต็อก')
  );

  const attentionItems: {
    key: string;
    icon: React.ReactNode;
    tone: 'danger' | 'warning' | 'primary';
    title: string;
    subtitle: string;
    cta: string;
    href: string;
  }[] = [];

  if (outOfStock.length > 0) {
    attentionItems.push({
      key: 'stock',
      icon: <Box className="w-[18px] h-[18px]" />,
      tone: 'danger',
      title:
        `"${outOfStock[0].name}" ${t('dash.stockOutTitle')}` +
        (outOfStock.length - 1 + lowOnly.length > 0
          ? ` · ${t('dash.stockMoreNearEmpty').replace('%s', String(outOfStock.length - 1 + lowOnly.length))}`
          : ''),
      subtitle: t('dash.stockSubtitle'),
      cta: t('dash.orderMore'),
      href: '/inventory',
    });
  } else if (lowOnly.length > 0) {
    attentionItems.push({
      key: 'stock',
      icon: <Box className="w-[18px] h-[18px]" />,
      tone: 'warning',
      title: t('dash.stockLowCountTitle').replace('%s', String(lowOnly.length)),
      subtitle: t('dash.stockSubtitle'),
      cta: t('dash.orderMore'),
      href: '/inventory',
    });
  }

  if (kitchenBusy) {
    attentionItems.push({
      key: 'kitchen',
      icon: <ChefHat className="w-[18px] h-[18px]" />,
      tone: 'primary',
      title: t('dash.kitchenBusyTitle').replace('%s', String(restaurant.pendingKitchen)),
      subtitle: t('dash.kitchenBusySubtitle'),
      cta: t('dash.viewKitchen'),
      href: '/kds',
    });
  }

  otherInsights.forEach((ins, i) => {
    attentionItems.push({
      key: `insight-${i}`,
      icon: <AlertTriangle className="w-[18px] h-[18px]" />,
      tone: ins.type === 'critical' ? 'danger' : 'warning',
      title: ins.text,
      subtitle: '',
      cta: t('dash.viewDetails'),
      href: '/reports',
    });
  });

  const peakHour = (hourly as any[]).reduce((best, h) => (h.revenue > (best?.revenue ?? -1) ? h : best), null as any);

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin space-y-4">
      {/* === Greeting + period switch === */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
            {t(greetingKey())}, คุณ{user?.name}
          </h1>
          <div className="text-xs text-muted-foreground mt-0.5">
            {dateLabel}
            {openDuration && ` · ${t('dash.openSince')} ${openDuration}`}
          </div>
        </div>
        <div className="flex bg-card border border-border rounded-lg p-1 text-[13px] font-semibold">
          {(['today', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 rounded-md transition-colors ${
                period === p ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === 'today' ? t('dash.today') : t('dash.thisMonth')}
            </button>
          ))}
        </div>
      </div>

      {/* === Focal band: big sales card + KPI trio === */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3.5">
        {period === 'today' ? (
          <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-6">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary opacity-[0.07]" />
            <div className="text-[13px] font-semibold text-muted-foreground">{t('dash.todayRevenue')}</div>
            <div className="text-metric-lg tabular-nums tracking-tight mt-1.5 mb-1">
              {formatCurrency(today.revenue)}
            </div>
            {today.vsYesterdayPct != null && (
              <span
                className={`inline-flex items-center gap-1 text-[13px] font-bold px-2.5 py-1 rounded-full ${
                  today.vsYesterdayPct >= 0 ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
                }`}
              >
                {today.vsYesterdayPct >= 0 ? '▲' : '▼'} {Math.abs(today.vsYesterdayPct).toFixed(1)}%{' '}
                <span className="text-muted-foreground font-medium">{t('dash.vsYesterday')}</span>
              </span>
            )}
            {goals.dailyTarget > 0 && <GoalBar target={goals.dailyTarget} actual={goals.dailyActual} pct={goals.dailyPct} t={t} />}
            {goals.dailyTarget === 0 && (
              <Link href="/settings" className="block mt-4 text-xs text-muted-foreground hover:text-foreground">
                {t('dash.setGoals')}
              </Link>
            )}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-6">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary opacity-[0.07]" />
            <div className="text-[13px] font-semibold text-muted-foreground">{t('dash.thisMonth')}</div>
            <div className="text-metric-lg tabular-nums tracking-tight mt-1.5 mb-1">
              {formatCurrency(month.revenue)}
            </div>
            {month.projection > 0 && (
              <span className="inline-flex items-center gap-1 text-[13px] font-bold px-2.5 py-1 rounded-full text-primary bg-primary/10">
                <TrendingUp className="w-3.5 h-3.5" /> {t('dash.monthProjected')}{' '}
                <span className="tabular-nums">{formatCurrency(month.projection)}</span>
              </span>
            )}
            {goals.monthlyTarget > 0 && (
              <GoalBar target={goals.monthlyTarget} actual={goals.monthlyActual} pct={goals.monthlyPct} t={t} />
            )}
            {goals.monthlyTarget === 0 && (
              <Link href="/settings" className="block mt-4 text-xs text-muted-foreground hover:text-foreground">
                {t('dash.setGoals')}
              </Link>
            )}
          </div>
        )}

        <div className="grid grid-rows-3 gap-2.5">
          {period === 'today' ? (
            <>
              <KpiTile icon={<Receipt className="w-[18px] h-[18px]" />} tone="primary" label={t('dash.orders')} value={`${today.orders}`} suffix={t('shift.ordersWord')} />
              <KpiTile icon={<CreditCard className="w-[18px] h-[18px]" />} tone="info" label={t('dash.avgTicket')} value={formatCurrency(today.avgTicket)} />
              <KpiTile
                icon={<Coins className="w-[18px] h-[18px]" />}
                tone="success"
                label={t('dash.profit')}
                value={formatCurrency(today.profit)}
                suffix={`${today.margin.toFixed(0)}%`}
              />
            </>
          ) : (
            <>
              <KpiTile icon={<Receipt className="w-[18px] h-[18px]" />} tone="primary" label={t('dash.orders')} value={`${month.orders}`} suffix={t('shift.ordersWord')} />
              <KpiTile
                icon={<CalendarClock className="w-[18px] h-[18px]" />}
                tone="info"
                label={t('dash.monthDayProgress')}
                value={`${month.dayOfMonth}/${month.daysInMonth}`}
              />
              <KpiTile icon={<Coins className="w-[18px] h-[18px]" />} tone="success" label={t('dash.monthProjected')} value={formatCurrency(month.projection)} />
            </>
          )}
        </div>
      </div>

      {/* === Needs attention === */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-danger shadow-[0_0_0_4px_rgba(239,68,68,0.15)]" />
          <span className="text-sm font-extrabold">{t('dash.needsAttention')}</span>
          {attentionItems.length > 0 && (
            <span className="text-[11.5px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full">
              {attentionItems.length} {t('dash.mattersSuffix')}
            </span>
          )}
        </div>
        {attentionItems.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">{t('dash.allClear')}</div>
        ) : (
          <div className="space-y-2">
            {attentionItems.map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                  item.tone === 'danger'
                    ? 'bg-danger/[0.06] border-danger/25'
                    : item.tone === 'warning'
                      ? 'bg-warning/[0.07] border-warning/25'
                      : 'bg-card-hover border-border'
                }`}
              >
                <div
                  className={`w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0 ${
                    item.tone === 'danger'
                      ? 'bg-danger/15 text-danger'
                      : item.tone === 'warning'
                        ? 'bg-warning/15 text-warning'
                        : 'bg-primary/10 text-primary'
                  }`}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold truncate">{item.title}</div>
                  {item.subtitle && <div className="text-[11.5px] text-muted-foreground">{item.subtitle}</div>}
                </div>
                <Link
                  href={item.href}
                  className={`shrink-0 h-8 px-3.5 rounded-lg text-xs font-bold flex items-center transition-colors ${
                    item.tone === 'danger'
                      ? 'bg-danger text-white hover:bg-danger/90'
                      : 'border border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {item.cta} →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === Quick stats === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStat
          label={t('dash.kitchenQueue')}
          value={`${restaurant.pendingKitchen}`}
          href="/kds"
          urgent={restaurant.pendingKitchen > 5}
        />
        <QuickStat
          label={t('dash.activeTables')}
          value={`${restaurant.activeTables}/${restaurant.totalTables}`}
          href="/tables"
        />
        <QuickStat
          label={t('dash.newCustomersToday')}
          value={`+${customers.newToday}`}
          subText={`${t('dash.total')} ${customers.total}`}
          href="/customers"
        />
        <QuickStat
          label={t('inventoryPage.lowStock')}
          value={`${alerts.lowStock.length}`}
          subText={alerts.outOfStockCount > 0 ? `${alerts.outOfStockCount} ${t('dash.outSuffix')}` : t('inventoryPage.statusNormal')}
          href="/inventory"
          urgent={alerts.outOfStockCount > 0}
        />
      </div>

      {/* === Trends === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">{t('dash.hourlyRevenue')}</h3>
            {peakHour && peakHour.revenue > 0 && (
              <span className="text-[11.5px] text-muted-foreground">
                {t('dash.peakHour')} {String(peakHour.hour).padStart(2, '0')}:00
              </span>
            )}
          </div>
          <HourlyChart hourly={hourly} />
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="text-sm font-bold mb-4">{t('dash.topSellers')}</h3>
          {topItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">{t('orders.empty')}</p>
          ) : (
            <div className="space-y-2.5">
              {topItems.slice(0, 5).map((it: any, i: number) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span
                    className={`w-[18px] h-[18px] rounded-[6px] shrink-0 flex items-center justify-center text-[10px] font-extrabold ${
                      i === 0 ? 'bg-primary text-white' : 'bg-muted text-foreground'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0 text-[12.5px] truncate">{it.name}</span>
                  <span className="font-bold tabular-nums text-[12.5px] shrink-0">{it.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Recent Orders feed */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">{t('dash.recentOrders')}</h3>
            <Link href="/orders" className="text-xs text-muted-foreground hover:text-foreground">
              {t('dash.viewAll')}
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">{t('orders.empty')}</p>
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
                      STATUS_VARIANT[o.status] === 'accent' ? 'bg-primary' : 'bg-warning'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">{o.orderNumber}</span>
                      {o.paymentMethod && (
                        <span className="text-[10px] text-muted-foreground">{t(`orders.paymentMethod.${o.paymentMethod}`, o.paymentMethod)}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {o.tableNumber && `${t('cart.tableWord')} ${o.tableNumber} · `}
                      {o.customerName && `${o.customerName} · `}
                      {o.itemCount} {t('display.items')} · {formatTime(o.createdAt)}
                    </div>
                  </div>
                  <div className="font-bold tabular-nums text-sm shrink-0">
                    {formatCurrency(o.total)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">{t('dash.stockToWatch')}</h3>
            <Link href="/inventory" className="text-xs text-muted-foreground hover:text-foreground">
              {t('dash.viewInventory')}
            </Link>
          </div>
          {alerts.lowStock.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">{t('dash.allStockNormal')}</div>
          ) : (
            <div className="space-y-0 -mx-2">
              {alerts.lowStock.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-card-hover">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.quantity === 0 ? 'bg-danger' : 'bg-warning'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t('inventoryPage.minShort')} {s.lowStockAt}
                    </div>
                  </div>
                  <div className={`text-lg font-bold tabular-nums shrink-0 ${s.quantity === 0 ? 'text-danger' : 'text-warning'}`}>
                    {s.quantity}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer link to reports */}
      <Link
        href="/reports"
        className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-card-hover transition-colors text-sm text-muted-foreground hover:text-foreground"
      >
        {t('dash.viewReports')} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function GoalBar({
  target,
  actual,
  pct,
  t,
}: {
  target: number;
  actual: number;
  pct: number | null;
  t: (k: string, f?: string) => string;
}) {
  const p = Math.min(pct || 0, 100);
  const remaining = target - actual;
  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">
          {t('dash.goals')} {formatCurrency(target)}
        </span>
        <span className="font-bold text-success">
          {(pct || 0).toFixed(0)}%{' '}
          {remaining > 0 ? `· ${t('dash.remaining')} ${formatCurrency(remaining)}` : `· ${t('dash.targetReached')}`}
        </span>
      </div>
      <div className="h-[9px] rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

function KpiTile({
  icon,
  tone,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  tone: 'primary' | 'info' | 'success';
  label: string;
  value: string;
  suffix?: string;
}) {
  const toneClass =
    tone === 'primary' ? 'bg-primary/[0.12] text-primary' : tone === 'info' ? 'bg-info/[0.12] text-info' : 'bg-success/[0.12] text-success';
  return (
    <div className="bg-card border border-border rounded-xl px-3.5 py-3 flex items-center gap-3">
      <div className={`w-[38px] h-[38px] rounded-[10px] flex items-center justify-center shrink-0 ${toneClass}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-[19px] font-extrabold tracking-tight tabular-nums truncate">
          {value} {suffix && <span className="text-xs font-medium text-muted-foreground">{suffix}</span>}
        </div>
      </div>
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
