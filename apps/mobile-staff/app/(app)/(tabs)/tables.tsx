import { useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatElapsedMinutes } from '@/lib/format';
import { useCart } from '@/stores/cart.store';
import { TableActionSheet } from '@/components/TableActionSheet';
import { useIsTablet } from '@/hooks/useIsTablet';
import { TABLE_STATUS_LABEL, tableStatusDot, tableTile } from '@/constants/tableStatus';
import { useThemeColors } from '@/lib/theme';
import type { RestaurantTable, TableStatus } from '@/types/pos';

export default function TablesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const isTablet = useIsTablet();
  const t = useThemeColors();
  const [selected, setSelected] = useState<RestaurantTable | null>(null);
  const { setType, setTable, clearItems } = useCart();

  const { data: tables = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => (await api.get('/tables')).data as RestaurantTable[],
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TableStatus }) =>
      (await api.patch(`/tables/${id}/status`, { status })).data,
    onSuccess: (updated: RestaurantTable) => {
      qc.setQueryData<RestaurantTable[]>(['tables'], (old = []) =>
        old.map((tb) => (tb.id === updated.id ? updated : tb))
      );
      setSelected((s) => (s && s.id === updated.id ? updated : s));
    },
  });

  function onOpenBill() {
    if (!selected) return;
    const current = useCart.getState();
    if (current.tableId !== selected.id) clearItems();
    setType('DINE_IN');
    setTable(selected.id);
    setSelected(null);
    router.push('/pos');
  }

  const legend = (['AVAILABLE', 'OCCUPIED', 'RESERVED', 'BILLING'] as TableStatus[]).map((st) => ({
    status: st,
    count: tables.filter((tb) => tb.status === st).length,
  }));
  // Wider (landscape) iPads get more tiles per row instead of oversized ones; the sidebar takes 196.
  const { width: winW } = useWindowDimensions();
  const columns = isTablet ? Math.max(5, Math.min(8, Math.floor((winW - 196 - 28) / 150))) : 3;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row flex-wrap gap-x-2 gap-y-1.5 bg-card dark:bg-dark-card border-b border-border dark:border-dark-border px-3.5 py-2.5">
        {legend.map(({ status, count }) => (
          <View key={status} className="flex-row items-center gap-1.5 rounded-full border border-border dark:border-dark-border bg-background dark:bg-dark-background px-2.5 py-1">
            <View style={{ backgroundColor: tableStatusDot(status, t.isDark) }} className="h-2 w-2 rounded-full" />
            <Text className="text-[11px] font-semibold text-foreground dark:text-dark-foreground">
              {TABLE_STATUS_LABEL[status]} {count}
            </Text>
          </View>
        ))}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={t.primary} />
        </View>
      ) : (
        <FlatList
          key={columns}
          data={tables}
          keyExtractor={(tb) => tb.id}
          numColumns={columns}
          contentContainerStyle={{ padding: 14, gap: 14 }}
          columnWrapperStyle={{ gap: 14 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListHeaderComponent={
            <View className="h-[22px] mb-1 items-center justify-center rounded-md bg-muted dark:bg-dark-muted">
              <Text className="text-[9px] font-semibold tracking-widest text-muted-foreground dark:text-dark-muted-foreground">
                เคาน์เตอร์ / ครัว
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const c = tableTile(item.status, t.isDark);
            const round = item.size === 'SMALL';
            const cap = Math.max(1, Math.min(item.capacity || 2, 12));
            const topN = Math.ceil(cap / 2);
            const bottomN = cap - topN;
            let sub = TABLE_STATUS_LABEL[item.status];
            if (item.status === 'AVAILABLE') sub = `ว่าง · ${item.capacity} ที่`;
            if (item.occupiedAt && (item.status === 'OCCUPIED' || item.status === 'BILLING')) {
              sub = formatElapsedMinutes(item.occupiedAt);
            }
            const Chairs = ({ n }: { n: number }) => (
              <View className="flex-row justify-center gap-1" style={{ minHeight: 7 }}>
                {Array.from({ length: n }).map((_, i) => (
                  <View key={i} style={{ backgroundColor: c.chair, width: 16, height: 7 }} className="rounded-[2px]" />
                ))}
              </View>
            );
            return (
              <Pressable onPress={() => setSelected(item)} className="flex-1 gap-[3px]">
                <Chairs n={topN} />
                <View
                  style={{
                    backgroundColor: c.bg,
                    borderColor: c.border,
                    borderWidth: 1,
                    borderRadius: round ? 999 : 10,
                    aspectRatio: round ? 1 : undefined,
                    paddingVertical: round ? 0 : 9,
                  }}
                  className="items-center justify-center"
                >
                  <Text style={{ color: c.fg }} className="text-[19px] font-bold">
                    {item.number}
                  </Text>
                  <Text style={{ color: c.fg, opacity: c.solid ? 0.8 : 1 }} className="text-[9px] font-semibold">
                    {sub}
                  </Text>
                </View>
                <Chairs n={bottomN} />
              </Pressable>
            );
          }}
        />
      )}

      <TableActionSheet
        table={selected}
        onClose={() => setSelected(null)}
        onChangeStatus={(status) => selected && changeStatus.mutate({ id: selected.id, status })}
        onOpenBill={onOpenBill}
        updating={changeStatus.isPending}
      />
    </SafeAreaView>
  );
}
