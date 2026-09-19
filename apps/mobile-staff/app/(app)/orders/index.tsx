import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import type { Order } from '@/types/pos';

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

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row gap-2 px-4 py-3">
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPeriod(p.key)}
            className={`rounded-full px-3.5 py-1.5 ${period === p.key ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'}`}
          >
            <Text className={`text-[13px] font-medium ${period === p.key ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C9622E" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <Receipt size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีออเดอร์ในช่วงนี้</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/orders/${item.id}` as never)}
              className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3.5 gap-1.5"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">#{item.orderNumber}</Text>
                <StatusBadge status={item.status} />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                  {item.table ? `โต๊ะ ${item.table.number}` : item.type === 'TAKEAWAY' ? 'กลับบ้าน' : 'เดลิเวอรี่'} · {formatTime(item.createdAt)}
                </Text>
                <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">{formatCurrency(item.total)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
