import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Boxes } from 'lucide-react-native';
import { api } from '@/lib/api';
import { StockAdjustModal } from '@/components/StockAdjustModal';
import type { Inventory } from '@/types/backoffice';

const TABS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'low', label: 'ใกล้หมด' },
] as const;

export default function InventoryScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [selected, setSelected] = useState<Inventory | null>(null);

  const { data: items = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => (await api.get('/inventory')).data as Inventory[],
  });

  const filtered = useMemo(() => {
    const list = tab === 'low' ? items.filter((i) => i.quantity <= i.lowStockAt) : items;
    return [...list].sort((a, b) => a.quantity - b.lowStockAt - (b.quantity - a.lowStockAt));
  }, [items, tab]);

  const lowCount = items.filter((i) => i.quantity <= i.lowStockAt).length;

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
              {t.label}
              {t.key === 'low' && lowCount > 0 ? ` (${lowCount})` : ''}
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
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <Boxes size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีรายการ</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isOut = item.quantity === 0;
            const isLow = item.quantity <= item.lowStockAt;
            return (
              <Pressable
                onPress={() => setSelected(item)}
                className={`flex-row items-center justify-between rounded-xl border p-3.5 ${
                  isOut
                    ? 'border-danger bg-danger/5'
                    : isLow
                    ? 'border-warning bg-warning/5'
                    : 'border-border bg-card dark:border-dark-border dark:bg-dark-card'
                }`}
              >
                <View className="flex-1">
                  <Text className="text-[14px] font-medium text-foreground dark:text-dark-foreground">{item.product.name}</Text>
                  <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                    {item.product.category?.name ?? ''} · {item.product.sku}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className={`text-[16px] font-bold ${isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-foreground dark:text-dark-foreground'}`}>
                    {item.quantity}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">ขั้นต่ำ {item.lowStockAt}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <StockAdjustModal item={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
