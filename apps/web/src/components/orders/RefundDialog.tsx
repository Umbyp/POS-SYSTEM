'use client';
import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  order: any;
}

export function RefundDialog({ open, onClose, order }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

  const items = order?.items || [];

  const refundable = useMemo(
    () =>
      items.map((item: any) => ({
        ...item,
        remaining: item.quantity - (item.refundedQty || 0),
      })),
    [items]
  );

  const totalRefund = useMemo(() => {
    return refundable.reduce((sum: number, item: any) => {
      const qty = qtyMap[item.id] || 0;
      return sum + qty * Number(item.unitPrice);
    }, 0);
  }, [qtyMap, refundable]);

  const selectedCount = Object.values(qtyMap).filter((q) => q > 0).length;

  const mut = useMutation({
    mutationFn: (payload: any) =>
      api.post(`/orders/${order.id}/refund-items`, payload).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      toast.success(
        `${data.fullyRefunded ? t('refund.full') : t('refund.partial')} (${formatCurrency(data.refundedAmount)})`
      );
      setQtyMap({});
      setReason('');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('refund.failed')),
  });

  const submit = () => {
    const itemsToRefund = Object.entries(qtyMap)
      .filter(([, qty]) => qty > 0)
      .map(([orderItemId, qty]) => ({
        orderItemId,
        qty,
        reason: reason || undefined,
      }));

    if (itemsToRefund.length === 0) {
      toast.error(t('refund.noItemsSelected'));
      return;
    }
    if (!reason.trim()) {
      if (!confirm(t('refund.noReasonConfirm'))) return;
    }
    mut.mutate({ items: itemsToRefund });
  };

  const selectAll = () => {
    const all: Record<string, number> = {};
    refundable.forEach((item: any) => {
      if (item.remaining > 0) all[item.id] = item.remaining;
    });
    setQtyMap(all);
  };

  const clearAll = () => setQtyMap({});

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-warning" /> {t('orders.refund')}
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground">
          {t('refund.selectHint')}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            {t('refund.selectAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll}>
            {t('cart.clear')}
          </Button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
          {refundable.map((item: any) => {
            const qty = qtyMap[item.id] || 0;
            const allRefunded = item.remaining === 0;
            return (
              <div
                key={item.id}
                className={`p-3 rounded-lg border ${
                  allRefunded
                    ? 'border-border opacity-50'
                    : qty > 0
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.product.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(item.unitPrice)} × {item.quantity}
                      {item.refundedQty > 0 && (
                        <span className="text-warning ml-2">
                          ({t('refund.refundedParen')} {item.refundedQty})
                        </span>
                      )}
                    </div>
                  </div>
                  {allRefunded ? (
                    <span className="text-xs text-success px-2 py-1 bg-success/10 rounded">
                      {t('refund.fullyRefunded')}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setQtyMap({ ...qtyMap, [item.id]: Math.max(0, qty - 1) })
                        }
                        className="w-7 h-7 rounded bg-muted hover:bg-muted/80 disabled:opacity-30"
                        disabled={qty <= 0}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={item.remaining}
                        value={qty || ''}
                        onChange={(e) => {
                          const v = Math.min(
                            item.remaining,
                            Math.max(0, parseInt(e.target.value) || 0)
                          );
                          setQtyMap({ ...qtyMap, [item.id]: v });
                        }}
                        className="w-12 h-7 bg-input border border-border rounded text-center text-sm tabular-nums"
                        placeholder="0"
                      />
                      <button
                        onClick={() =>
                          setQtyMap({
                            ...qtyMap,
                            [item.id]: Math.min(item.remaining, qty + 1),
                          })
                        }
                        className="w-7 h-7 rounded bg-muted hover:bg-muted/80 disabled:opacity-30"
                        disabled={qty >= item.remaining}
                      >
                        +
                      </button>
                      <span className="text-xs text-muted-foreground ml-1">
                        /{item.remaining}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <Label className="mb-1.5 block">{t('refund.reasonLabel')}</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('refund.reasonPlaceholder')}
          />
        </div>

        {selectedCount > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">{t('refund.amount')}</div>
            <div className="text-2xl font-bold text-warning tabular-nums">
              {formatCurrency(totalRefund)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {selectedCount} {t(selectedCount !== 1 ? 'refund.items' : 'refund.item')}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={selectedCount === 0 || mut.isPending}
            onClick={submit}
          >
            {mut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              `${t('refund.confirmButton')} ${formatCurrency(totalRefund)}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
