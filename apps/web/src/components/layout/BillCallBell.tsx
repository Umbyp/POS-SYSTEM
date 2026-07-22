'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Receipt } from 'lucide-react';
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

/**
 * Bell icon in the Topbar — shows tables that tapped "call for the bill"
 * from the self-order page (see self-order.service.ts callForBill). Self-
 * orders themselves need no staff action: they're merged into the tab and
 * hit the kitchen the moment a customer submits.
 */
export function BillCallBell() {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: billCalls = [] } = useQuery({
    queryKey: ['bill-calls-pending'],
    queryFn: () => api.get('/self-order/bill-calls/pending').then((r) => r.data),
    refetchInterval: 15_000,
  });

  const acknowledgeBillCall = useMutation({
    mutationFn: (id: string) => api.post(`/self-order/bill-calls/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bill-calls-pending'] }),
    onError: (e: any) => toast.error(e.response?.data?.error || t('selfOrderPanel.acknowledgeFailed')),
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
        title={t('selfOrderPanel.billCallsTitle')}
      >
        <Bell className="w-4 h-4" />
        {billCalls.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
            {billCalls.length}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>{t('selfOrderPanel.billCallsTitle')}</DialogTitle>
          </DialogHeader>

          {billCalls.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('selfOrderPanel.empty')}</p>
          ) : (
            <div className="space-y-2 pb-1">
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
        </DialogContent>
      </Dialog>
    </>
  );
}
