'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Printer,
  Undo2,
  User,
  Calendar,
  Hash,
  Wallet,
  Receipt as ReceiptIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RefundDialog } from '@/components/orders/RefundDialog';
import { useAuth } from '@/stores/auth.store';
import { useT } from '@/lib/i18n';

const STATUS_VARIANT: Record<string, any> = {
  PENDING: 'warning',
  PREPARING: 'accent',
  READY: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'danger',
};

export default function OrderDetailPage() {
  const t = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const [refundOpen, setRefundOpen] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then((r) => r.data),
  });

  if (isLoading || !order) {
    return (
      <div className="p-6 text-center text-muted-foreground">{t('orders.loading')}</div>
    );
  }

  const canRefund =
    (user?.role === 'OWNER' || user?.role === 'ADMIN') &&
    order.status !== 'REFUNDED' &&
    order.status !== 'CANCELLED' &&
    order.items.some((i: any) => (i.refundedQty || 0) < i.quantity);

  const totalRefunded = order.items.reduce(
    (s: number, i: any) => s + (i.refundedQty || 0) * Number(i.unitPrice),
    0
  );

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('orders.back')}
          </Button>
          <h2 className="text-lg sm:text-xl font-bold">{order.orderNumber}</h2>
          <Badge variant={STATUS_VARIANT[order.status]}>
            {t(`orders.status.${order.status}`, order.status)}
          </Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/orders/${order.id}/receipt`, '_blank')}
          >
            <Printer className="w-4 h-4 mr-1" /> {t('orders.receipt')}
          </Button>
          {canRefund && (
            <Button variant="danger" size="sm" onClick={() => setRefundOpen(true)}>
              <Undo2 className="w-4 h-4 mr-1" /> {t('orders.refund')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('orders.itemsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {order.items.map((item: any) => {
                const refunded = item.refundedQty || 0;
                const isFullyRefunded = refunded >= item.quantity;
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border ${
                      isFullyRefunded
                        ? 'border-danger/30 bg-danger/5 opacity-60'
                        : refunded > 0
                        ? 'border-warning/30 bg-warning/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{item.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.unitPrice)} × {item.quantity}
                        </div>
                        {item.notes && (
                          <div className="text-xs italic text-muted-foreground mt-1">
                            ↪ {item.notes}
                          </div>
                        )}
                        {refunded > 0 && (
                          <div className="mt-1 text-xs">
                            <Badge variant="warning" className="text-[10px]">
                              {t('orders.refundedBadge')} {refunded}/{item.quantity}
                            </Badge>
                            {item.refundReason && (
                              <span className="ml-2 italic text-muted-foreground">
                                {item.refundReason}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold tabular-nums">
                          {formatCurrency(Number(item.unitPrice) * item.quantity)}
                        </div>
                        {refunded > 0 && (
                          <div className="text-xs text-warning tabular-nums">
                            -{formatCurrency(Number(item.unitPrice) * refunded)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Summary + Meta */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ReceiptIcon className="w-4 h-4" /> {t('orders.summary')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('cart.subtotal')}</span>
                <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('cart.discount')}</span>
                  <span className="tabular-nums">-{formatCurrency(order.discount)}</span>
                </div>
              )}
              {Number(order.serviceCharge) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('cart.serviceCharge')}</span>
                  <span className="tabular-nums">{formatCurrency(order.serviceCharge)}</span>
                </div>
              )}
              {Number(order.tax) > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground/70">
                  <span>{t('orders.vatIncl')}</span>
                  <span className="tabular-nums">{formatCurrency(order.tax)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                <span>{t('cart.total')}</span>
                <span className="tabular-nums text-accent">{formatCurrency(order.total)}</span>
              </div>
              {totalRefunded > 0 && (
                <div className="flex justify-between text-warning font-medium pt-2 border-t border-border">
                  <span>{t('orders.refunded')}</span>
                  <span className="tabular-nums">-{formatCurrency(totalRefunded)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4" /> {t('orders.payment')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {order.payments?.map((p: any) => (
                <div key={p.id}>
                  <div className="flex justify-between">
                    <span>{t(`orders.paymentMethod.${p.method}`, p.method)}</span>
                    <span className="tabular-nums font-medium">
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                  {p.reference && (
                    <div className="text-xs text-muted-foreground pl-1">
                      {t('orders.ref')}: {p.reference}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('orders.information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row icon={<Hash className="w-4 h-4" />} label={t('orders.number')} value={order.orderNumber} />
              <Row
                icon={<Calendar className="w-4 h-4" />}
                label={t('orders.date')}
                value={formatDate(order.createdAt)}
              />
              <Row
                icon={<User className="w-4 h-4" />}
                label={t('orders.cashier')}
                value={order.cashier?.name || '-'}
              />
              {order.table && (
                <Row label={t('cart.tableWord')} value={`${order.table.number}`} />
              )}
              {order.customer && (
                <Row label={t('orders.customer')} value={order.customer.name} />
              )}
              {order.customerName && !order.customer && (
                <Row label={t('orders.customer')} value={order.customerName} />
              )}
              {order.customerTaxId && (
                <Row label={t('orders.taxIdShort')} value={order.customerTaxId} />
              )}
              {order.notes && (
                <div className="pt-2 border-t border-border">
                  <div className="text-xs text-muted-foreground">{t('orders.notes')}</div>
                  <div>{order.notes}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <RefundDialog open={refundOpen} onClose={() => setRefundOpen(false)} order={order} />
    </div>
  );
}

function Row({ icon, label, value }: { icon?: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground text-xs w-20 shrink-0">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
