import { useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ActivityLogEntry } from '@/types/backoffice';

const ACTIONS = [
  { key: undefined, label: 'ทั้งหมด' },
  { key: 'LOGIN', label: 'เข้าสู่ระบบ' },
  { key: 'CREATE_ORDER', label: 'สร้างออเดอร์' },
  { key: 'REFUND', label: 'คืนเงิน' },
  { key: 'CREATE_PRODUCT', label: 'เพิ่มสินค้า' },
  { key: 'UPDATE_PRODUCT', label: 'แก้ไขสินค้า' },
  { key: 'DELETE_PRODUCT', label: 'ลบสินค้า' },
] as const;

const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'เข้าสู่ระบบ',
  CREATE_ORDER: 'สร้างออเดอร์',
  REFUND: 'คืนเงิน',
  CREATE_PRODUCT: 'เพิ่มสินค้า',
  UPDATE_PRODUCT: 'แก้ไขสินค้า',
  DELETE_PRODUCT: 'ลบสินค้า',
  STOCK_ADJUST: 'ปรับสต็อก',
  PARTIAL_REFUND: 'คืนเงินบางส่วน',
  OPEN_TAB: 'เปิดบิล',
  SETTLE_TAB: 'ปิดบิล',
  VOID_ITEM: 'ยกเลิกรายการ',
};

export default function ActivityScreen() {
  const [action, setAction] = useState<string | undefined>(undefined);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['activity-logs', action],
    queryFn: async () => (await api.get('/activity-logs', { params: { action, limit: 100 } })).data as { data: ActivityLogEntry[] },
  });

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={ACTIONS}
        keyExtractor={(a) => a.key ?? 'all'}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        style={{ flexGrow: 0, marginVertical: 10 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setAction(item.key)}
            className={`rounded-full px-3.5 py-1.5 ${action === item.key ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'}`}
          >
            <Text className={`text-[13px] font-medium ${action === item.key ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
              {item.label}
            </Text>
          </Pressable>
        )}
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FF6B35" />
        </View>
      ) : (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <History size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีประวัติ</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3.5 gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">
                  {ACTION_LABEL[item.action] ?? item.action}
                </Text>
                <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{formatDate(item.createdAt)}</Text>
              </View>
              <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{item.user?.name ?? 'ระบบ'}</Text>
              {item.metadata ? (
                <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground" numberOfLines={2}>
                  {Object.entries(item.metadata)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join('  ')}
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
