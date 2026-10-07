import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import { OrderDetailView } from '@/components/OrderDetailView';
import { useIsTablet } from '@/hooks/useIsTablet';
import { printReceipt, PrinterError } from '@/lib/printer';
import { StatusBadge, SPINE_COLOR, OVERDUE_COLOR, overdueMinutes } from '@/components/StatusBadge';
import type { Order } from '@/types/pos';
import type { StoreSettings } from '@/types/backoffice';

const PERIODS = [
  { key: 'today', label: 'วันนี้' },
  { key: 'week', label: 'สัปดาห์นี้' },
  { key: 'all', label: 'ทั้งหมด' },
] as const;

function periodRange(period: (typeof PERIODS)[number]['key']) {
  if (period === 'all') return {};
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (period === 'week') from.setDate(from.getDate() - from.getDay());
  return { from: from.toISOString(), to: now.toISOString() };
}

export default function OrdersScreen() {
  const router = useRouter();
  const isTablet = useIsTablet();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('today');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders', period],
    queryFn: async () => {
      const { from, to } = periodRange(period);
      const params: Record<string, string> = { limit: '200' };
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get('/orders', { params });
      return res.data as { data: Order[]; total: number };
    },
    refetchInterval: 15000,
  });

  const orders = useMemo(
    () => [...(data?.data ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [data]
  );

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data as StoreSettings,
    enabled: isTablet,
  });

  // Split view: keep a selection, falling back to the newest order.
  const activeId = isTablet ? (orders.find((o) => o.id === selectedId)?.id ?? orders[0]?.id ?? null) : null;

  async function onPrint(orderId: string) {
    if (!store) return;
    setPrinting(true);
    try {
      const order = (await api.get(`/orders/${orderId}`)).data as Order;
      await printReceipt(store, order);
      Alert.alert('พิมพ์ใบเสร็จแล้ว', 'ส่งงานพิมพ์ไปยังเครื่องพิมพ์เรียบร้อย');
    } catch (err) {
      const message = err instanceof PrinterError ? err.message : 'พิมพ์ไม่สำเร็จ — ตรวจสอบว่ามือถือต่อ WiFi เดียวกับเครื่องพิมพ์';
      Alert.alert('พิมพ์ไม่สำเร็จ', message);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row items-center justify-between border-b border-border bg-card px-4 py-2.5 dark:border-dark-border dark:bg-dark-card">
        <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">
          ออเดอร์{PERIODS.find((p) => p.key === period)?.label} · {orders.length}
        </Text>
      </View>
      <View className="flex-row gap-[7px] px-4 py-[11px]">
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPeriod(p.key)}
            className={`rounded-full px-3 py-1.5 ${period === p.key ? 'bg-primary' : 'border border-border bg-card dark:border-dark-border dark:bg-dark-card'}`}
          >
            <Text className={`text-[12px] ${period === p.key ? 'font-semibold' : 'font-medium'} ${period === p.key ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-1 flex-row">
      <View className="flex-1">
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C9622E" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 9 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <Receipt size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีออเดอร์ในช่วงนี้</Text>
            </View>
          }
          renderItem={({ item }) => {
            const late = overdueMinutes(item.status, item.createdAt);
            const dead = item.status === 'CANCELLED' || item.status === 'REFUNDED';
            return (
              <Pressable
                onPress={() => (isTablet ? setSelectedId(item.id) : router.push(`/orders/${item.id}` as never))}
                style={activeId === item.id ? { borderWidth: 2, borderColor: '#2B1F17' } : undefined}
                className={`flex-row overflow-hidden rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card ${dead ? 'opacity-70' : ''}`}
              >
                <View className="w-1.5" style={{ backgroundColor: late ? OVERDUE_COLOR : SPINE_COLOR[item.status] }} />
                <View className="flex-1 px-[13px] py-3">
                  <View className="flex-row items-baseline justify-between">
                    <Text className="text-[15px] font-bold text-foreground dark:text-dark-foreground">#{item.orderNumber}</Text>
                    <Text
                      className={`text-[15px] font-bold ${dead ? 'text-muted-foreground line-through dark:text-dark-muted-foreground' : 'text-foreground dark:text-dark-foreground'}`}
                    >
                      {formatCurrency(item.total)}
                    </Text>
                  </View>
                  <View className="mt-1.5 flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-[12px] text-muted-foreground dark:text-dark-muted-foreground" numberOfLines={1}>
                      {item.table ? `โต๊ะ ${item.table.number}` : item.type === 'TAKEAWAY' ? 'กลับบ้าน' : 'เดลิเวอรี่'} · {formatTime(item.createdAt)}
                      {item.items?.length ? ` · ${item.items.length} รายการ` : ''}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      {late ? <Text className="text-[11px] font-bold text-danger">เกิน {late} นาที</Text> : null}
                      <StatusBadge status={item.status} />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      </View>

      {isTablet ? (
        <View className="w-[340px] border-l border-border bg-background dark:border-dark-border dark:bg-dark-background">
          {activeId ? (
            <OrderDetailView key={activeId} id={activeId} onReceipt={onPrint} receiptBusy={printing || !store} />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">เลือกออเดอร์เพื่อดูรายละเอียด</Text>
            </View>
          )}
        </View>
      ) : null}
      </View>
    </SafeAreaView>
  );
}
