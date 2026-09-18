import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { ChefHat, Printer } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import type { Order, OrderStatus } from '@/types/pos';

const TABS: { key: OrderStatus; label: string }[] = [
  { key: 'PENDING', label: 'รอทำ' },
  { key: 'PREPARING', label: 'กำลังทำ' },
  { key: 'READY', label: 'พร้อมเสิร์ฟ' },
];

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  PENDING: { label: 'เริ่มทำ', next: 'PREPARING' },
  PREPARING: { label: 'เสร็จแล้ว', next: 'READY' },
};

export default function KdsScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<OrderStatus>('PENDING');
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['kds-orders'],
    queryFn: async () => {
      const res = await api.get('/orders', { params: { status: 'PENDING,PREPARING,READY', limit: 150 } });
      return res.data as { data: Order[] };
    },
    refetchInterval: 10000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) =>
      (await api.patch(`/orders/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-orders'] }),
  });

  const orders = data?.data ?? [];
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, orders.filter((o) => o.status === t.key).length])),
    [orders]
  );
  const filtered = useMemo(
    () => orders.filter((o) => o.status === tab).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [orders, tab]
  );

  async function onReprint(orderId: string) {
    setPrintingId(orderId);
    try {
      await api.post(`/orders/${orderId}/print/escpos`);
    } catch (err) {
      const message = isAxiosError(err)
        ? err.response?.data?.error ?? 'พิมพ์ไม่สำเร็จ — ตรวจสอบเครื่องพิมพ์'
        : 'พิมพ์ไม่สำเร็จ';
      Alert.alert('พิมพ์ไม่สำเร็จ', message);
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row gap-2 px-4 py-3">
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            className={`flex-1 items-center rounded-lg py-2 ${tab === t.key ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'}`}
          >
            <Text className={`text-[13px] font-semibold ${tab === t.key ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
              {t.label} ({counts[t.key] ?? 0})
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FF6B35" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <ChefHat size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีออเดอร์ในคิวนี้</Text>
            </View>
          }
          renderItem={({ item }) => {
            const action = NEXT_ACTION[item.status];
            const isDineIn = !!item.table;
            return (
              <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3.5 gap-2.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">#{item.orderNumber}</Text>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{formatTime(item.createdAt)}</Text>
                    <Pressable onPress={() => onReprint(item.id)} disabled={printingId === item.id} hitSlop={8}>
                      <Printer size={18} color="#6B7280" />
                    </Pressable>
                  </View>
                </View>
                <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                  {isDineIn ? `โต๊ะ ${item.table!.number}` : item.type === 'TAKEAWAY' ? 'กลับบ้าน' : 'เดลิเวอรี่'}
                </Text>

                <View className="gap-1">
                  {item.items.map((li) => (
                    <View key={li.id}>
                      <Text className="text-[13px] text-foreground dark:text-dark-foreground">
                        {li.quantity}x {li.product?.name ?? 'สินค้า'}
                      </Text>
                      {li.notes ? (
                        <Text className="text-[11px] text-primary-600">{li.notes}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>

                {action ? (
                  <Pressable
                    onPress={() => updateStatus.mutate({ id: item.id, status: action.next })}
                    disabled={updateStatus.isPending}
                    className="h-11 items-center justify-center rounded-lg bg-primary mt-1"
                  >
                    <Text className="text-[14px] font-semibold text-white">{action.label}</Text>
                  </Pressable>
                ) : item.status === 'READY' && !isDineIn ? (
                  <Pressable
                    onPress={() => updateStatus.mutate({ id: item.id, status: 'COMPLETED' })}
                    disabled={updateStatus.isPending}
                    className="h-11 items-center justify-center rounded-lg bg-primary mt-1"
                  >
                    <Text className="text-[14px] font-semibold text-white">ลูกค้ารับแล้ว</Text>
                  </Pressable>
                ) : item.status === 'READY' ? (
                  <View className="h-11 items-center justify-center rounded-lg bg-muted dark:bg-dark-muted mt-1">
                    <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">รอลูกค้าเช็คบิล</Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
