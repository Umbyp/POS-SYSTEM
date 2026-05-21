'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { toast } from 'sonner';
import { playCashRegister } from '@/lib/sounds';

export function useOrderRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onCreated = (order: any) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      // ตรวจวิธีชำระเงิน → ถ้าเป็น PromptPay/โอน/บัตร → เล่นเสียง cha-ching เพื่อเตือนพนักงาน
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
            ? '🏦 โอน'
            : method === 'CREDIT_CARD'
            ? '💳 บัตร'
            : '';
        toast.success(`💰 รับเงิน ${label}: ${order.orderNumber}`, { duration: 6000 });
      } else {
        toast.success(`ออเดอร์ใหม่: ${order.orderNumber}`);
      }
    };
    const onStatus = () => qc.invalidateQueries({ queryKey: ['orders'] });
    const onStock = () => qc.invalidateQueries({ queryKey: ['products'] });
    const onKdsNew = () => qc.invalidateQueries({ queryKey: ['kds-orders'] });
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
        toast.info(`โต๊ะ ${table.number} ถูกจอง`);
      }
    };

    s.on('order:created', onCreated);
    s.on('order:status', onStatus);
    s.on('order:refunded', onStatus);
    s.on('stock:updated', onStock);
    s.on('kds:new', onKdsNew);
    s.on('kds:status', onKdsNew);
    s.on('table:updated', onTableUpdated);

    return () => {
      s.off('order:created', onCreated);
      s.off('order:status', onStatus);
      s.off('order:refunded', onStatus);
      s.off('stock:updated', onStock);
      s.off('kds:new', onKdsNew);
      s.off('kds:status', onKdsNew);
      s.off('table:updated', onTableUpdated);
    };
  }, [qc]);
}
