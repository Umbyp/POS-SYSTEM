'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, X, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Bell icon in the Topbar — shows carts customers built themselves via a
 * table's QR code, waiting for a staff tap before they touch the kitchen or
 * the table's bill (see self-order.service.ts). Realtime badge count comes
 * from the 'selforder:new'/'selforder:update' socket events wired in
 * useOrderRealtime(); refetchInterval is just a safety net.
 */
export function PendingSelfOrders() {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const { data: pending = [] } = useQuery({
    queryKey: ['self-order-pending'],
    queryFn: () => api.get('/self-order/pending').then((r) => r.data),
    refetchInterval: 15_000,
  });

  const { data: billCalls = [] } = useQuery({
    queryKey: ['bill-calls-pending'],
    queryFn: () => api.get('/self-order/bill-calls/pending').then((r) => r.data),
    refetchInterval: 15_000,
  });

  const invalidateAfterResolve = () => {
    qc.invalidateQueries({ queryKey: ['self-order-pending'] });
    qc.invalidateQueries({ queryKey: ['tables'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };

  const acknowledgeBillCall = useMutation({
    mutationFn: (id: string) => api.post(`/self-order/bill-calls/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bill-calls-pending'] }),
    onError: (e: any) => toast.error(e.response?.data?.error || t('selfOrderPanel.acknowledgeFailed')),
  });

  const totalCount = pending.length + billCalls.length;

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/self-order/${id}/approve`),
    onSuccess: () => {
      invalidateAfterResolve();
      toast.success(t('selfOrderPanel.approved'));
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('selfOrderPanel.approveFailed')),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post(`/self-order/${id}/reject`, { reason }),
    onSuccess: () => {
      invalidateAfterResolve();
      toast.success(t('selfOrderPanel.rejected'));
      setRejectingId(null);
      setReason('');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('selfOrderPanel.rejectFailed')),
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
        title={t('selfOrderPanel.title')}
      >
        <Bell className="w-4 h-4" />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
            {totalCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>{t('selfOrderPanel.title')}</DialogTitle>
          </DialogHeader>

          {billCalls.length > 0 && (
            <div className="space-y-2 pb-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('selfOrderPanel.billCallsTitle')}
              </div>
              {billCalls.map((call: any) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between gap-2 border border-warning/30 bg-warning/5 rounded-xl p-3"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Receipt className="w-4 h-4 text-warning" />
                    {t('cart.tableWord')} {call.table?.number}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acknowledgeBillCall.isPending}
                    onClick={() => acknowledgeBillCall.mutate(call.id)}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> {t('selfOrderPanel.acknowledge')}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {pending.length === 0 ? (
            billCalls.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">{t('selfOrderPanel.empty')}</p>
            )
          ) : (
            <div className="space-y-3">
              {pending.map((req: any) => (
                <div key={req.id} className="border border-border rounded-xl p-3">
                  <div className="font-semibold text-sm mb-1.5">
                    {t('cart.tableWord')} {req.table?.number}
                  </div>
                  <div className="space-y-1 text-sm mb-2">
                    {req.items.map((it: any, i: number) => (
                      <div key={i} className="flex justify-between text-muted-foreground">
                        <span>
                          {it.quantity}× {it.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  {req.note && (
                    <div className="text-xs italic text-muted-foreground mb-2">
                      {t('selfOrderPanel.noteLabel')}: {req.note}
                    </div>
                  )}

                  {rejectingId === req.id ? (
                    <div className="flex gap-2">
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t('selfOrderPanel.rejectReasonPrompt')}
                        className="flex-1 h-9 text-xs"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={reject.isPending}
                        onClick={() => reject.mutate({ id: req.id, reason: reason.trim() || undefined })}
                      >
                        {t('selfOrderPanel.reject')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejectingId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        className="flex-1"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(req.id)}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> {t('selfOrderPanel.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setRejectingId(req.id)}
                      >
                        <X className="w-3.5 h-3.5 mr-1" /> {t('selfOrderPanel.reject')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
