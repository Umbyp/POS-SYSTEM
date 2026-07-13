'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { toast } from 'sonner';
import { playCashRegister } from '@/lib/sounds';
import { announcePayment } from '@/lib/voice';
import { formatCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';

export function useOrderRealtime() {
  const t = useT();
  const qc = useQueryClient();

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onCreated = (order: any) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      // Check payment method → for PromptPay/transfer/card play cha-ching sound to alert staff
      const hasTransferPayment = order.payments?.some(
        (p: any) => p.method !== 'CASH'
      );
      if (hasTransferPayment) {
        playCashRegister();
        const method = order.payments[0]?.method;
        const label =
          method === 'PROMPTPAY'
            ? '📱 PromptPay'
            : method === 'BANK_TRANSFER'
            ? '🏦 Transfer'
            : method === 'CREDIT_CARD'
            ? '💳 Card'
            : '';
        toast.success(`💰 Payment received ${label}: ${order.orderNumber}`, { duration: 6000 });
      } else {
        toast.success(`New order: ${order.orderNumber}`);
      }
    };
    const onStatus = () => qc.invalidateQueries({ queryKey: ['orders'] });
    const onStock = () => qc.invalidateQueries({ queryKey: ['products'] });
    const onKdsNew = () => qc.invalidateQueries({ queryKey: ['kds-orders'] });
    const onSelfOrderNew = (n: { tableNumber: string }) => {
      qc.invalidateQueries({ queryKey: ['self-order-pending'] });
      toast.info(`🛎️ ${t('selfOrderPanel.newOrder')} ${n.tableNumber}`);
    };
    const onSelfOrderUpdate = () => qc.invalidateQueries({ queryKey: ['self-order-pending'] });
    const onBillCallNew = (n: { tableNumber: string }) => {
      qc.invalidateQueries({ queryKey: ['bill-calls-pending'] });
      toast.info(`🧾 ${t('cart.tableWord')} ${n.tableNumber} ${t('selfOrderPanel.newBillCall')}`);
    };
    const onBillCallUpdate = () => qc.invalidateQueries({ queryKey: ['bill-calls-pending'] });

    const onTableUpdated = (table: any) => {
      qc.setQueryData(['tables'], (old: any[] = []) => {
        if (!Array.isArray(old)) return old;
        const idx = old.findIndex((t) => t.id === table.id);
        if (idx === -1) return [...old, table];
        const next = [...old];
        next[idx] = { ...next[idx], ...table };
        return next;
      });
      if (table.status === 'RESERVED') {
        toast.info(`Table ${table.number} reserved`);
      }
    };

    // Inbound bank SMS/email notification: play sound + voice-announce + toast
    const onPaymentReceived = (n: {
      amount: number;
      hasAmount?: boolean;
      bank?: string;
      senderName?: string;
      matchedOrderNumber?: string | null;
    }) => {
      // Persist preference: "voice-announce" (default on)
      const voiceOn = localStorage.getItem('voice-announce') !== '0';
      const lang = (localStorage.getItem('voice-lang') as 'th' | 'en') || 'th';

      playCashRegister();
      if (voiceOn) {
        announcePayment(n.amount || 0, lang);
      }

      if (n.hasAmount === false || !n.amount) {
        // Privacy-aware bank notification — no amount available
        toast.warning(`🔔 Payment activity detected`, {
          duration: 12000,
          description:
            (n.bank ? `${n.bank} · ` : '') +
            'Bank notification arrived without amount. Please verify in your banking app.',
        });
      } else {
        const matchedLabel = n.matchedOrderNumber
          ? ` · matched ${n.matchedOrderNumber}`
          : ' · no match';
        toast.success(`💰 Money in ${formatCurrency(n.amount)}${matchedLabel}`, {
          duration: 8000,
          description: n.senderName ? `From ${n.senderName}` : undefined,
        });
      }

      // Refresh orders / dashboard if we matched an order, or refresh notifications list
      qc.invalidateQueries({ queryKey: ['payment-notifications'] });
      if (n.matchedOrderNumber) {
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['dashboard-overview'] });
      }
    };

    s.on('order:created', onCreated);
    s.on('order:status', onStatus);
    s.on('order:refunded', onStatus);
    s.on('stock:updated', onStock);
    s.on('kds:new', onKdsNew);
    s.on('kds:status', onKdsNew);
    s.on('table:updated', onTableUpdated);
    s.on('payment:received', onPaymentReceived);
    s.on('selforder:new', onSelfOrderNew);
    s.on('selforder:update', onSelfOrderUpdate);
    s.on('billcall:new', onBillCallNew);
    s.on('billcall:update', onBillCallUpdate);

    return () => {
      s.off('order:created', onCreated);
      s.off('order:status', onStatus);
      s.off('order:refunded', onStatus);
      s.off('stock:updated', onStock);
      s.off('kds:new', onKdsNew);
      s.off('kds:status', onKdsNew);
      s.off('table:updated', onTableUpdated);
      s.off('payment:received', onPaymentReceived);
      s.off('selforder:new', onSelfOrderNew);
      s.off('selforder:update', onSelfOrderUpdate);
      s.off('billcall:new', onBillCallNew);
      s.off('billcall:update', onBillCallUpdate);
    };
  }, [qc]);
}
