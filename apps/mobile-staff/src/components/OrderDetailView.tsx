import { View, Text, Image, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, ImageOff, Ban, Undo2 } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatMinutes } from '@/lib/format';
import { resolveImageUrl } from '@/lib/imageUrl';
import { StatusBadge, SPINE_COLOR, OVERDUE_COLOR, overdueMinutes } from '@/components/StatusBadge';
import { OrderActionSheet, type OrderAction } from '@/components/OrderActionSheet';
import { BillOpButtons, BillOpsModal, type BillOp } from '@/components/BillOpsSheets';
import { useAuthStore } from '@/stores/auth.store';
import type { Order } from '@/types/pos';
import { useThemeColors } from '@/lib/theme';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'เงินสด',
  PROMPTPAY: 'พร้อมเพย์',
  BANK_TRANSFER: 'โอนเงิน',
  CREDIT_CARD: 'บัตรเครดิต',
};

interface OrderDetailViewProps {
  id: string;
  /** Called by the "receipt / print" button. */
  onReceipt: (orderId: string) => void;
  /** Disables the receipt button while an action is running. */
  receiptBusy?: boolean;
}

/** Order detail body shared by the stack screen (phone) and the orders split view (tablet). */
export function OrderDetailView({ id, onReceipt, receiptBusy }: OrderDetailViewProps) {
  const theme = useThemeColors();
  const role = useAuthStore((s) => s.user?.role);
  const [action, setAction] = useState<OrderAction | null>(null);
  const [billOp, setBillOp] = useState<BillOp | null>(null);
  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data as Order,
  });

  if (isLoading || !order) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color="#D25E3B" />
      </View>
    );
  }

  // Permissions mirror apps/api order.routes.ts: void + cancel = OWNER/ADMIN/CASHIER (unpaid only);
  // refund + refund-items = OWNER/ADMIN only (paid only).
  const paid = order.payments.length > 0;
  const staff = role === 'OWNER' || role === 'ADMIN' || role === 'CASHIER';
  const openUnpaid = !paid && ['PENDING', 'PREPARING', 'READY'].includes(order.status);
  const canVoid = staff && openUnpaid;
  const canCancel = staff && !paid && ['DRAFT', 'PENDING', 'PREPARING', 'READY'].includes(order.status);
  const canRefund =
    (role === 'OWNER' || role === 'ADMIN') && paid && order.status !== 'REFUNDED' && order.status !== 'CANCELLED' &&
    order.items.some((i) => i.quantity - (i.refundedQty || 0) > 0);
  const refundedTotal = Number(order.refundedAmount || 0);

  const late = overdueMinutes(order.status, order.createdAt);
  const typeLabel = order.table ? `โต๊ะ ${order.table.number}` : order.type === 'TAKEAWAY' ? 'กลับบ้าน' : 'เดลิเวอรี่';
  const chips = [order.type === 'DINE_IN' ? 'ทานที่ร้าน' : typeLabel, formatDate(order.createdAt), order.cashier ? `แคชเชียร์ ${order.cashier.name}` : null].filter(Boolean) as string[];

  return (
    <>
      <ScrollView contentContainerClassName="p-4 gap-3">
        <View className="rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-3">
          <View className="flex-row items-center gap-2.5">
            <View className="h-10 w-1.5 rounded-[3px]" style={{ backgroundColor: late ? OVERDUE_COLOR : SPINE_COLOR[order.status] }} />
            <View className="flex-1">
              <Text className="text-[19px] font-bold text-foreground dark:text-dark-foreground">#{order.orderNumber}</Text>
              <Text className={`text-[11px] ${late ? 'text-danger' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>
                {late ? `เกินเวลาครัว ${formatMinutes(late)} · ` : ''}{typeLabel}
              </Text>
            </View>
            <StatusBadge status={order.status} />
          </View>
          <View className="flex-row flex-wrap gap-[7px]">
            {chips.map((c, i) => (
              <View key={i} className="rounded-md bg-muted px-2 py-1 dark:bg-dark-muted">
                <Text className="text-[11px] font-semibold text-[#3A3A3A] dark:text-dark-foreground">{c}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-3">
          <Text className="text-[11px] font-semibold tracking-wider text-muted-foreground dark:text-dark-muted-foreground">รายการ</Text>
          {order.items.map((item) => (
            <View key={item.id} className="flex-row items-start justify-between gap-2">
              <View className="flex-row items-start flex-1 gap-2.5">
                <View className="w-11 h-11 rounded-md bg-muted dark:bg-dark-muted overflow-hidden items-center justify-center">
                  {item.product?.image ? (
                    <Image source={{ uri: resolveImageUrl(item.product.image) }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <ImageOff size={16} color={theme.faint} />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-[13px] text-foreground dark:text-dark-foreground">
                    {item.quantity}x {item.product?.name ?? 'สินค้า'}
                  </Text>
                  {item.notes ? (
                    <Text className="text-[11px] text-warning">{item.notes}</Text>
                  ) : null}
                  {item.refundedQty > 0 ? (
                    <Text className="text-[11px] text-danger dark:text-dark-danger">
                      {paid ? 'คืนแล้ว' : 'ยกเลิกแล้ว'} {item.refundedQty}
                      {item.refundReason ? ` · ${item.refundReason}` : ''}
                    </Text>
                  ) : null}
                  {canVoid && item.quantity - (item.refundedQty || 0) > 0 ? (
                    <Pressable
                      onPress={() => setAction({ kind: 'void', item })}
                      hitSlop={6}
                      className="mt-1.5 h-8 flex-row items-center gap-1 self-start rounded-md border border-danger px-2.5"
                    >
                      <Ban size={12} color={theme.danger} />
                      <Text className="text-[12px] font-semibold text-danger dark:text-dark-danger">ยกเลิกรายการ</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <Text className="text-[13px] text-foreground dark:text-dark-foreground">
                {formatCurrency(Number(item.unitPrice) * item.quantity)}
              </Text>
            </View>
          ))}
        </View>

        <View className="rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-1.5">
          <Row label="ยอดรวม" value={formatCurrency(order.subtotal)} />
          {Number(order.discount) > 0 && <Row label={order.promotionName ? `ส่วนลด (${order.promotionName})` : 'ส่วนลด'} value={`-${formatCurrency(order.discount)}`} />}
          {(order.pointsRedeemed ?? 0) > 0 && <Row label="ใช้แต้ม" value={`${order.pointsRedeemed!.toLocaleString()} แต้ม`} />}
          {(order.pointsEarned ?? 0) > 0 && <Row label="ได้รับแต้ม" value={`+${order.pointsEarned!.toLocaleString()} แต้ม`} />}
          {Number(order.serviceCharge) > 0 && <Row label="ค่าบริการ" value={formatCurrency(order.serviceCharge)} />}
          {Number(order.tax) > 0 && <Row label="ภาษี" value={formatCurrency(order.tax)} />}
          {paid && refundedTotal > 0 && <Row label="คืนเงินแล้ว" value={`-${formatCurrency(refundedTotal)}`} />}
          <View className="mt-1 flex-row items-baseline justify-between border-t border-border pt-2.5 dark:border-dark-border">
            <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">ยอดสุทธิ</Text>
            <Text className="text-[24px] font-bold text-foreground dark:text-dark-foreground">{formatCurrency(order.total)}</Text>
          </View>
        </View>

        {order.payments.length > 0 ? (
          <View className="rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-1.5">
            <Text className="text-[11px] font-semibold tracking-wider text-muted-foreground dark:text-dark-muted-foreground mb-1">การชำระเงิน</Text>
            {order.payments.map((p, i) => (
              <Row key={i} label={PAYMENT_LABEL[p.method] ?? p.method} value={formatCurrency(p.amount)} />
            ))}
          </View>
        ) : null}

        {staff && openUnpaid ? (
          <View className="gap-2.5 rounded-[10px] border border-border bg-card p-4 dark:border-dark-border dark:bg-dark-card">
            <Text className="text-[11px] font-semibold tracking-wider text-muted-foreground dark:text-dark-muted-foreground">จัดการบิล</Text>
            <BillOpButtons order={order} onPick={setBillOp} />
          </View>
        ) : null}

        <Pressable
          onPress={() => onReceipt(order.id)}
          disabled={receiptBusy}
          className={`h-[52px] flex-row items-center justify-center gap-2 rounded-[10px] bg-primary ${receiptBusy ? 'opacity-50' : ''}`}
        >
          <Printer size={18} color="#FFFFFF" />
          <Text className="text-[15px] font-bold text-white">ใบเสร็จ / พิมพ์</Text>
        </Pressable>

        {canRefund ? (
          <Pressable
            onPress={() => setAction({ kind: 'refund' })}
            className="h-[48px] flex-row items-center justify-center gap-2 rounded-[10px] border border-danger bg-card dark:bg-dark-card"
          >
            <Undo2 size={17} color={theme.danger} />
            <Text className="text-[14px] font-bold text-danger dark:text-dark-danger">คืนเงิน</Text>
          </Pressable>
        ) : null}
        {canCancel ? (
          <Pressable
            onPress={() => setAction({ kind: 'cancel' })}
            className="h-[48px] flex-row items-center justify-center gap-2 rounded-[10px] border border-danger bg-card dark:bg-dark-card"
          >
            <Ban size={17} color={theme.danger} />
            <Text className="text-[14px] font-bold text-danger dark:text-dark-danger">ยกเลิกบิล</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <OrderActionSheet order={order} action={action} onClose={() => setAction(null)} />
      <BillOpsModal order={order} op={billOp} onClose={() => setBillOp(null)} />
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Text className={`text-[12px] ${bold ? 'font-bold' : 'font-medium'} text-muted-foreground dark:text-dark-muted-foreground`}>{label}</Text>
      <Text className={`text-[12px] ${bold ? 'font-bold' : 'font-medium'} text-muted-foreground dark:text-dark-muted-foreground`}>{value}</Text>
    </View>
  );
}
