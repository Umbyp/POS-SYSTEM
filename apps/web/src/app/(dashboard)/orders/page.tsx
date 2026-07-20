'use client';
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Receipt as ReceiptIcon, Printer, Eye, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';

const STATUS_VARIANT: Record<string, any> = {
  PENDING: 'warning',
  PREPARING: 'default',
  READY: 'default',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'danger',
};

const STATUS_DOT: Record<string, string> = {
  PENDING: 'bg-warning',
  PREPARING: 'bg-primary',
  READY: 'bg-primary',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-danger',
  REFUNDED: 'bg-danger',
};

type StatusFilter = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
type Period = 'today' | 'week' | 'month' | 'all';

function periodRange(period: Period): { from?: string; to?: string } {
  if (period === 'all') return {};
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (period === 'week') from.setDate(from.getDate() - 6);
  if (period === 'month') from.setDate(from.getDate() - 29);
  return { from: from.toISOString(), to };
}

export default function OrdersPage() {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [period, setPeriod] = useState<Period>('today');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  // Memoized on `period` alone — periodRange() calls `new Date()`, so
  // recomputing on every render would change the queryKey each time and
  // refetch in a loop.
  const { from, to } = useMemo(() => periodRange(period), [period]);
  const { data, isLoading } = useQuery({
    queryKey: ['orders', from, to, debouncedQ],
    queryFn: () =>
      api
        .get('/orders', { params: { from, to, q: debouncedQ || undefined, limit: 200 } })
        .then((r) => r.data),
    refetchInterval: 10_000,
  });

  const orders: any[] = data?.data ?? [];
  const filtered = useMemo(() => {
    if (status === 'ALL') return orders;
    if (status === 'IN_PROGRESS') return orders.filter((o) => o.status === 'PREPARING' || o.status === 'READY');
    return orders.filter((o) => o.status === status);
  }, [orders, status]);

  const FILTERS: { key: StatusFilter; label: string; dot?: string }[] = [
    { key: 'ALL', label: t('pos.all') },
    { key: 'PENDING', label: t('orders.status.PENDING'), dot: 'bg-warning' },
    { key: 'IN_PROGRESS', label: t('orders.filter.inProgress'), dot: 'bg-primary' },
    { key: 'COMPLETED', label: t('orders.status.COMPLETED'), dot: 'bg-success' },
  ];

  return (
    <div className="p-6 h-full overflow-y-auto scrollbar-thin">
      {/* Header: title + count, search */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="text-xl font-extrabold tracking-tight">
          {t('orders.todayTitle')}{' '}
          <span className="text-muted-foreground font-semibold text-base">
            {data?.total ?? 0} {t('orders.billsCount')}
          </span>
        </h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('orders.searchPlaceholder')}
            className="pl-10 h-10 rounded-lg"
          />
        </div>
      </div>

      {/* Filter chips: status + period */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => {
          const active = status === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                active
                  ? 'bg-foreground text-background'
                  : 'bg-card border border-border text-foreground hover:bg-muted'
              }`}
            >
              {f.dot && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-background' : f.dot}`} />}
              {f.label}
            </button>
          );
        })}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="ml-auto h-[34px] px-3 rounded-lg text-[13px] font-semibold bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <option value="today">{t('orders.period.today')}</option>
          <option value="week">{t('orders.period.week')}</option>
          <option value="month">{t('orders.period.month')}</option>
          <option value="all">{t('orders.period.all')}</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-20 rounded-xl" />
          ))}
        </div>
      ) : !orders.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ReceiptIcon className="w-12 h-12 mb-3 opacity-30" />
          <p>{t('orders.empty')}</p>
        </div>
      ) : !filtered.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ReceiptIcon className="w-12 h-12 mb-3 opacity-30" />
          <p>{t('orders.noMatch')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o: any, idx: number) => {
            const typeLabel =
              o.type === 'DINE_IN' ? t('cart.dineIn') : o.type === 'TAKEAWAY' ? t('cart.takeaway') : t('cart.delivery');
            const usedTable = o.type === 'DINE_IN' && o.table;
            const primaryLabel = usedTable ? `${t('cart.tableWord')} ${o.table.number}` : typeLabel;
            const paymentMethod = o.payments?.[0]?.method;
            const secondaryParts = [
              usedTable ? typeLabel : null,
              o.status === 'REFUNDED'
                ? t('orders.refunded')
                : paymentMethod
                  ? t(`orders.paymentMethod.${paymentMethod}`, paymentMethod)
                  : null,
              formatTime(o.createdAt),
              `${t('orders.by')} ${o.cashier?.name || t('activity.unknown')}`,
            ].filter(Boolean);
            const shortNumber = o.orderNumber?.slice(-3);
            const isRefunded = o.status === 'REFUNDED';

            return (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="bg-card border border-border rounded-xl p-3.5 flex items-center flex-wrap gap-3.5 hover:bg-card-hover transition-colors"
              >
                <div className="flex items-center gap-3.5 flex-1 min-w-[220px]">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[o.status] || 'bg-muted-foreground'}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">
                      {primaryLabel}
                      {o.customer?.name && <span className="font-semibold"> · คุณ{o.customer.name}</span>}{' '}
                      <span className="text-xs text-muted-foreground font-medium">
                        #{shortNumber} · {o.items.length} {t('display.items')}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {secondaryParts.join(' · ')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 shrink-0 ml-auto">
                  <span
                    className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                      STATUS_VARIANT[o.status] === 'default'
                        ? 'text-primary bg-primary/10'
                        : STATUS_VARIANT[o.status] === 'success'
                          ? 'text-success bg-success/10'
                          : STATUS_VARIANT[o.status] === 'warning'
                            ? 'text-warning bg-warning/10'
                            : 'text-danger bg-danger/10'
                    }`}
                  >
                    {t(`orders.status.${o.status}`, o.status)}
                  </span>

                  <div
                    className={`shrink-0 text-base font-extrabold tabular-nums w-16 text-right ${
                      isRefunded ? 'text-muted-foreground line-through' : ''
                    }`}
                  >
                    {formatCurrency(o.total)}
                  </div>

                  <div className="shrink-0 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/orders/${o.id}`)}>
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> {t('orders.details')}
                    </Button>
                    <Button size="sm" onClick={() => window.open(`/orders/${o.id}/receipt`, '_blank')}>
                      <Printer className="w-3.5 h-3.5 mr-1.5" /> {t('orders.receipt')}
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
