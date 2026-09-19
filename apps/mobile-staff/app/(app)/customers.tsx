import { useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, UserCircle } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { CustomerFormModal } from '@/components/CustomerFormModal';
import { CustomerDetailModal } from '@/components/CustomerDetailModal';
import type { Customer } from '@/types/backoffice';

export default function CustomersScreen() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: customers = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get('/customers', { params: { q: search || undefined } })).data as Customer[],
  });

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row items-center gap-2 px-4 pt-3 pb-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-lg border border-border dark:border-dark-border bg-input dark:bg-dark-input px-3 h-11">
          <Search size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาลูกค้า…"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-[14px] text-foreground dark:text-dark-foreground"
          />
        </View>
        <Pressable
          onPress={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="h-11 w-11 items-center justify-center rounded-lg bg-primary"
        >
          <Plus size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C9622E" />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <UserCircle size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่พบลูกค้า</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedId(item.id)}
              className="flex-row items-center justify-between rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3.5"
            >
              <View className="flex-1">
                <Text className="text-[14px] font-medium text-foreground dark:text-dark-foreground">{item.name}</Text>
                <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                  {item.phone ?? 'ไม่มีเบอร์'} · {item.points} แต้ม
                  {item.lastVisitAt ? ` · ${formatDate(item.lastVisitAt)}` : ''}
                </Text>
              </View>
              <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{formatCurrency(item.totalSpent)}</Text>
            </Pressable>
          )}
        />
      )}

      <CustomerDetailModal
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={() => {
          const c = customers.find((x) => x.id === selectedId);
          if (c) {
            setEditing(c);
            setShowForm(true);
          }
        }}
      />

      <CustomerFormModal
        visible={showForm}
        customer={editing}
        onClose={() => setShowForm(false)}
        onSaved={() => setShowForm(false)}
      />
    </SafeAreaView>
  );
}
