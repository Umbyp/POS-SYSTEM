'use client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Receipt as ReceiptIcon, Printer, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

const STATUS_VARIANT: Record<string, any> = {
  PENDING: 'warning',
  PREPARING: 'accent',
  READY: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'danger',
};

export default function OrdersPage() {
  const t = useT();
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get('/orders').then((r) => r.data),
    refetchInterval: 10_000,
  });

  return (
    <div className="p-6 h-full overflow-y-auto scrollbar-thin">
      <h2 className="text-xl font-bold mb-4">{t('orders.title')}</h2>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-20 rounded-xl" />
          ))}
        </div>
      ) : !data?.data?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ReceiptIcon className="w-12 h-12 mb-3 opacity-30" />
          <p>{t('orders.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.data.map((o: any, idx: number) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              className="bg-card border border-border rounded-xl p-4 hover:bg-card-hover transition-colors"
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-mono text-sm text-muted-foreground">{o.orderNumber}</div>
                    <div className="font-medium">
                      {o.items.length} {t('display.items')} · {formatDate(o.createdAt)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('orders.by')} {o.cashier?.name} ·{' '}
                      {o.type === 'DINE_IN' ? t('cart.dineIn') : o.type === 'TAKEAWAY' ? t('cart.takeaway') : t('cart.delivery')}
                      {o.table && ` · ${t('cart.tableWord')} ${o.table.number}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={STATUS_VARIANT[o.status]}>{t(`orders.status.${o.status}`, o.status)}</Badge>
                  <div className="text-lg font-bold text-accent tabular-nums">
                    {formatCurrency(o.total)}
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => router.push(`/orders/${o.id}`)}
                  >
                    <Eye className="w-4 h-4 mr-1" /> {t('orders.details')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => window.open(`/orders/${o.id}/receipt`, '_blank')}
                  >
                    <Printer className="w-4 h-4 mr-1" /> {t('orders.receipt')}
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
