import { View, Text, Image, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Printer, ImageOff } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { resolveImageUrl } from '@/lib/imageUrl';
import { StatusBadge } from '@/components/StatusBadge';
import type { Order } from '@/types/pos';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'เงินสด',
  PROMPTPAY: 'พร้อมเพย์',
  BANK_TRANSFER: 'โอนเงิน',
  CREDIT_CARD: 'บัตรเครดิต',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

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

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="p-4 gap-4">
        <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">#{order.orderNumber}</Text>
            <StatusBadge status={order.status} />
          </View>
          <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
            {formatDate(order.createdAt)} · {order.table ? `โต๊ะ ${order.table.number}` : order.type === 'TAKEAWAY' ? 'กลับบ้าน' : 'เดลิเวอรี่'}
          </Text>
          {order.cashier ? (
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">แคชเชียร์: {order.cashier.name}</Text>
          ) : null}
        </View>

        <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-3">
          <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">รายการ</Text>
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
                    <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{item.notes}</Text>
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
          <View className="h-px bg-border dark:bg-dark-border my-1" />
          <Row label="ยอดสุทธิ" value={formatCurrency(order.total)} bold />
        </View>

        {order.payments.length > 0 ? (
          <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-1.5">
            <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground mb-1">การชำระเงิน</Text>
            {order.payments.map((p, i) => (
              <Row key={i} label={PAYMENT_LABEL[p.method] ?? p.method} value={formatCurrency(p.amount)} />
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push(`/orders/${order.id}/receipt` as never)}
          className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-primary"
        >
          <Printer size={18} color="#FFFFFF" />
          <Text className="text-[15px] font-semibold text-white">ใบเสร็จ / พิมพ์</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Text className={`text-[13px] ${bold ? 'font-bold' : ''} text-foreground dark:text-dark-foreground`}>{label}</Text>
      <Text className={`text-[13px] ${bold ? 'font-bold' : ''} text-foreground dark:text-dark-foreground`}>{value}</Text>
    </View>
  );
}
