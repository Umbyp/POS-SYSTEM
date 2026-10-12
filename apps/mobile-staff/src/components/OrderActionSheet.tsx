import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { X, Minus, Plus, AlertTriangle } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import type { Order, OrderItem } from '@/types/pos';
import { useThemeColors } from '@/lib/theme';

export type OrderAction =
  | { kind: 'void'; item: OrderItem }
  | { kind: 'cancel' }
  | { kind: 'refund' };

interface OrderActionSheetProps {
  order: Order;
  action: OrderAction | null;
  onClose: () => void;
}

const REASONS: Record<OrderAction['kind'], string[]> = {
  void: ['สั่งผิด', 'ลูกค้าเปลี่ยนใจ', 'ของหมด', 'ครัวทำผิด'],
  cancel: ['ลูกค้ายกเลิก', 'เปิดบิลผิด', 'ซ้ำกับบิลอื่น'],
  refund: ['สินค้ามีปัญหา', 'ลูกค้าไม่พอใจ', 'ทำผิดพลาด', 'ลูกค้าเปลี่ยนใจ'],
};

const remainingOf = (i: OrderItem) => Math.max(0, i.quantity - (i.refundedQty || 0));

const errMsg = (err: unknown, fallback: string) =>
  isAxiosError(err) ? (err.response?.data?.error as string | undefined) ?? fallback : fallback;

/** One confirmation sheet for the three destructive order actions:
 *  - void:   POST /orders/:id/items/:itemId/void   {qty, reason}   (unpaid open bill)
 *  - cancel: PATCH /orders/:id/status              {status:'CANCELLED', reason?}  (unpaid)
 *  - refund: POST /orders/:id/refund-items         {items:[{orderItemId, qty, reason}]}  (paid; OWNER/ADMIN) */
export function OrderActionSheet({ order, action, onClose }: OrderActionSheetProps) {
  const theme = useThemeColors();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [voidQty, setVoidQty] = useState(1);
  const [fullRefund, setFullRefund] = useState(true);
  const [refundQty, setRefundQty] = useState<Record<string, number>>({});

  const refundable = useMemo(() => order.items.filter((i) => remainingOf(i) > 0), [order.items]);

  useEffect(() => {
    if (!action) return;
    setReason('');
    setFullRefund(true);
    setVoidQty(action.kind === 'void' ? remainingOf(action.item) : 1);
    setRefundQty(Object.fromEntries(order.items.map((i) => [i.id, remainingOf(i)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const refundLines = refundable
    .map((i) => ({ item: i, qty: fullRefund ? remainingOf(i) : Math.min(remainingOf(i), refundQty[i.id] ?? 0) }))
    .filter((l) => l.qty > 0);
  // Mirrors the server: a line's refund is its share of the bill total (after bill discount, tax, service charge).
  const refundTotal = (() => {
    const total = Number(order.total) || 0;
    const left = Math.max(0, total - Number(order.refundedAmount || 0));
    if (fullRefund) return left;
    const subtotal = Number(order.subtotal) || 0;
    if (subtotal <= 0) return 0;
    const net = refundLines.reduce((s, l) => {
      const q = l.item.quantity || 1;
      const gross = Number(l.item.unitPrice) * q - Number(l.item.discount || 0);
      return s + (Math.max(0, gross) * l.qty) / q;
    }, 0);
    return Math.min(left, Math.round(((total * net) / subtotal) * 100) / 100);
  })();

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['kds-orders'] });
    qc.invalidateQueries({ queryKey: ['tables'] });
  }

  const run = useMutation({
    mutationFn: async () => {
      if (!action) return null;
      const why = reason.trim();
      if (action.kind === 'void') {
        return (await api.post(`/orders/${order.id}/items/${action.item.id}/void`, { qty: voidQty, reason: why })).data;
      }
      if (action.kind === 'cancel') {
        return (await api.patch(`/orders/${order.id}/status`, { status: 'CANCELLED', ...(why ? { reason: why } : {}) })).data;
      }
      return (
        await api.post(`/orders/${order.id}/refund-items`, {
          items: refundLines.map((l) => ({ orderItemId: l.item.id, qty: l.qty, reason: why })),
        })
      ).data;
    },
    onSuccess: (data) => {
      invalidate();
      const kind = action?.kind;
      onClose();
      if (kind === 'void') Alert.alert('ยกเลิกรายการแล้ว', 'ยอดบิลและสต็อกถูกปรับเรียบร้อย');
      else if (kind === 'cancel') Alert.alert('ยกเลิกบิลแล้ว', 'คืนสต็อกและปลดโต๊ะเรียบร้อย');
      else
        Alert.alert(
          data?.fullyRefunded ? 'คืนเงินทั้งบิลแล้ว' : 'คืนเงินบางรายการแล้ว',
          `ยอดคืน ${formatCurrency(data?.refundedAmount ?? refundTotal)}`
        );
    },
    onError: (err) => {
      const title = action?.kind === 'void' ? 'ยกเลิกรายการไม่สำเร็จ' : action?.kind === 'cancel' ? 'ยกเลิกบิลไม่สำเร็จ' : 'คืนเงินไม่สำเร็จ';
      Alert.alert(title, errMsg(err, 'ลองใหม่อีกครั้ง'));
    },
  });

  if (!action) return null;

  const needsReason = action.kind !== 'cancel';
  const canSubmit =
    !run.isPending &&
    (!needsReason || reason.trim().length > 0) &&
    (action.kind !== 'refund' || refundLines.length > 0);

  const title = action.kind === 'void' ? 'ยกเลิกรายการ' : action.kind === 'cancel' ? 'ยกเลิกบิล' : 'คืนเงิน';
  const confirmLabel =
    action.kind === 'void'
      ? `ยกเลิก ${voidQty} รายการ`
      : action.kind === 'cancel'
        ? 'ยืนยันยกเลิกบิล'
        : `คืนเงิน ${formatCurrency(refundTotal)}`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
          <Pressable className="max-h-[90%] rounded-t-[14px] bg-card dark:bg-dark-card" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
              <View className="flex-row items-center gap-2">
                <AlertTriangle size={18} color={theme.danger} />
                <Text className="text-[16px] font-bold text-danger dark:text-dark-danger">{title}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <X size={22} color={theme.faint} />
              </Pressable>
            </View>

            <ScrollView contentContainerClassName="gap-3 px-4 pb-6" keyboardShouldPersistTaps="handled">
              <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                บิล #{order.orderNumber}
                {action.kind === 'void' ? ` · ${action.item.product?.name ?? 'สินค้า'}` : ''}
              </Text>

              {action.kind === 'void' ? (
                <Stepper label="จำนวนที่ยกเลิก" value={voidQty} min={1} max={remainingOf(action.item)} onChange={setVoidQty} />
              ) : null}

              {action.kind === 'cancel' ? (
                <Text className="text-[13px] text-foreground dark:text-dark-foreground">
                  ยกเลิกบิลที่ยังไม่ชำระ — คืนสต็อกทุกรายการและปลดโต๊ะ ย้อนกลับไม่ได้
                </Text>
              ) : null}

              {action.kind === 'refund' ? (
                <>
                  <View className="flex-row overflow-hidden rounded-lg border border-border dark:border-dark-border">
                    {[{ k: true, l: 'คืนทั้งบิล' }, { k: false, l: 'เลือกรายการ' }].map((o) => (
                      <Pressable
                        key={String(o.k)}
                        onPress={() => setFullRefund(o.k)}
                        className={`h-10 flex-1 items-center justify-center ${fullRefund === o.k ? 'bg-danger' : 'bg-card dark:bg-dark-card'}`}
                      >
                        <Text className={`text-[13px] font-semibold ${fullRefund === o.k ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>{o.l}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {refundable.map((i) => (
                    <View key={i.id} className="gap-1.5 rounded-[10px] border border-border p-3 dark:border-dark-border">
                      <View className="flex-row justify-between gap-2">
                        <Text className="flex-1 text-[13px] font-semibold text-foreground dark:text-dark-foreground">{i.product?.name ?? 'สินค้า'}</Text>
                        <Text className="text-[13px] text-foreground dark:text-dark-foreground">{formatCurrency(Number(i.unitPrice))}</Text>
                      </View>
                      {fullRefund ? (
                        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">คืน {remainingOf(i)} จาก {i.quantity}</Text>
                      ) : (
                        <Stepper
                          label={`คืน (สูงสุด ${remainingOf(i)})`}
                          value={refundQty[i.id] ?? 0}
                          min={0}
                          max={remainingOf(i)}
                          onChange={(n) => setRefundQty((m) => ({ ...m, [i.id]: n }))}
                        />
                      )}
                    </View>
                  ))}
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                    ยอดคืนคิดตามราคาสินค้า (ไม่รวมส่วนลดทั้งบิล) · คืนทั้งบิลจะดึงแต้มที่ได้จากบิลนี้กลับด้วย
                  </Text>
                </>
              ) : null}

              <View className="gap-2">
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder={needsReason ? 'เหตุผล (จำเป็น)' : 'เหตุผล (ไม่บังคับ)'}
                  placeholderTextColor={theme.placeholder}
                  className="h-11 rounded-lg border border-border bg-background px-3 text-[14px] text-foreground dark:border-dark-border dark:bg-dark-input dark:text-dark-foreground"
                />
                <View className="flex-row flex-wrap gap-1.5">
                  {REASONS[action.kind].map((r) => (
                    <Pressable key={r} onPress={() => setReason(r)} className="rounded-full bg-muted px-3 py-1.5 dark:bg-dark-muted">
                      <Text className="text-[12px] text-foreground dark:text-dark-foreground">{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable
                onPress={() => run.mutate()}
                disabled={!canSubmit}
                className={`h-12 items-center justify-center rounded-lg bg-danger ${!canSubmit ? 'opacity-50' : ''}`}
              >
                {run.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[15px] font-bold text-white">{confirmLabel}</Text>}
              </Pressable>
              <Pressable onPress={onClose} className="h-11 items-center justify-center rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card">
                <Text className="text-[14px] font-medium text-foreground dark:text-dark-foreground">ไม่ทำรายการ</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          hitSlop={6}
          className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card"
        >
          <Minus size={16} color={theme.mutedForeground} />
        </Pressable>
        <Text className="w-8 text-center text-[16px] font-bold text-foreground dark:text-dark-foreground">{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          hitSlop={6}
          className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card"
        >
          <Plus size={16} color={theme.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}
