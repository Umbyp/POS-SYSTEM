import { View, Text, Image, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Printer, ImageOff } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { resolveImageUrl } from '@/lib/imageUrl';
import { StatusBadge, SPINE_COLOR, OVERDUE_COLOR, overdueMinutes } from '@/components/StatusBadge';
import type { Order } from '@/types/pos';

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
  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data as Order,
  });

  if (isLoading || !order) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color="#C9622E" />
      </View>
    );
  }

  const late = overdueMinutes(order.status, order.createdAt);
  const typeLabel = order.table ? `โต๊ะ ${order.table.number}` : order.type === 'TAKEAWAY' ? 'กลับบ้าน' : 'เดลิเวอรี่';
  const chips = [order.type === 'DINE_IN' ? 'ทานที่ร้าน' : typeLabel, formatDate(order.createdAt), order.cashier ? `แคชเชียร์ ${order.cashier.name}` : null].filter(Boolean) as string[];

  return (
    <>
      <ScrollView contentContainerClassName="p-4 gap-4">
        <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-3">
          <View className="flex-row items-center gap-2.5">
            <View className="h-10 w-1.5 rounded-[3px]" style={{ backgroundColor: late ? OVERDUE_COLOR : SPINE_COLOR[order.status] }} />
            <View className="flex-1">
              <Text className="text-[19px] font-bold text-foreground dark:text-dark-foreground">#{order.orderNumber}</Text>
              <Text className={`text-[11px] ${late ? 'text-danger' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>
                {late ? `เกินเวลาครัว ${late} นาที · ` : ''}{typeLabel}
              </Text>
            </View>
            <StatusBadge status={order.status} />
          </View>
          <View className="flex-row flex-wrap gap-[7px]">
            {chips.map((c, i) => (
              <View key={i} className="rounded-full bg-muted px-2.5 py-[5px] dark:bg-dark-muted">
                <Text className="text-[11px] font-semibold text-[#4A382C] dark:text-dark-foreground">{c}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-3">
          <Text className="text-[12px] font-semibold text-[#8C6A4F] dark:text-dark-muted-foreground">รายการ</Text>
          {order.items.map((item) => (
            <View key={item.id} className="flex-row items-start justify-between gap-2">
              <View className="flex-row items-start flex-1 gap-2.5">
                <View className="w-11 h-11 rounded-lg bg-muted dark:bg-dark-muted overflow-hidden items-center justify-center">
                  {item.product?.image ? (
                    <Image source={{ uri: resolveImageUrl(item.product.image) }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <ImageOff size={16} color="#9CA3AF" />
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
                    <Text className="text-[11px] text-danger">คืนแล้ว {item.refundedQty}</Text>
                  ) : null}
                </View>
              </View>
              <Text className="text-[13px] text-foreground dark:text-dark-foreground">
                {formatCurrency(Number(item.unitPrice) * item.quantity)}
              </Text>
            </View>
          ))}
        </View>

        <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-1.5">
          <Row label="ยอดรวม" value={formatCurrency(order.subtotal)} />
          {Number(order.discount) > 0 && <Row label="ส่วนลด" value={`-${formatCurrency(order.discount)}`} />}
          {Number(order.serviceCharge) > 0 && <Row label="ค่าบริการ" value={formatCurrency(order.serviceCharge)} />}
          {Number(order.tax) > 0 && <Row label="ภาษี" value={formatCurrency(order.tax)} />}
          <View className="mt-1 flex-row items-baseline justify-between border-t border-border pt-2.5 dark:border-dark-border">
            <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">ยอดสุทธิ</Text>
            <Text className="text-[26px] font-bold text-foreground dark:text-dark-foreground">{formatCurrency(order.total)}</Text>
          </View>
        </View>

        {order.payments.length > 0 ? (
          <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-1.5">
            <Text className="text-[12px] font-semibold text-[#8C6A4F] dark:text-dark-muted-foreground mb-1">การชำระเงิน</Text>
            {order.payments.map((p, i) => (
              <Row key={i} label={PAYMENT_LABEL[p.method] ?? p.method} value={formatCurrency(p.amount)} />
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={() => onReceipt(order.id)}
          disabled={receiptBusy}
          className={`h-[52px] flex-row items-center justify-center gap-2 rounded-[11px] bg-primary ${receiptBusy ? 'opacity-50' : ''}`}
        >
          <Printer size={18} color="#FFFFFF" />
          <Text className="text-[15px] font-bold text-white">ใบเสร็จ / พิมพ์</Text>
        </Pressable>
      </ScrollView>
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
