import { useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCart } from '@/stores/cart.store';
import { TableActionSheet } from '@/components/TableActionSheet';
import { TABLE_STATUS_LABEL, TABLE_STATUS_COLOR } from '@/constants/tableStatus';
import type { RestaurantTable, TableStatus } from '@/types/pos';

export default function TablesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
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
        old.map((t) => (t.id === updated.id ? updated : t))
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

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FF6B35" />
        </View>
      ) : (
        <FlatList
          data={tables}
          keyExtractor={(t) => t.id}
          numColumns={3}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          columnWrapperStyle={{ gap: 10 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => {
            const c = TABLE_STATUS_COLOR[item.status];
            return (
              <Pressable
                onPress={() => setSelected(item)}
                style={{ backgroundColor: c.bg, borderColor: c.border }}
                className="flex-1 aspect-square rounded-xl border items-center justify-center gap-1"
              >
                <Text style={{ color: c.fg }} className="text-[18px] font-bold">
                  {item.number}
                </Text>
                <Text style={{ color: c.fg }} className="text-[10px] font-medium">
                  {TABLE_STATUS_LABEL[item.status]}
                </Text>
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
