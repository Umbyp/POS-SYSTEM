import { useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, UserCircle } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useIsTablet } from '@/hooks/useIsTablet';
import { centered, GRID_MAX } from '@/lib/layout';
import { useThemeColors } from '@/lib/theme';
import { formatCurrency, formatDate } from '@/lib/format';
import { CustomerFormModal } from '@/components/CustomerFormModal';
import { CustomerDetailModal } from '@/components/CustomerDetailModal';
import type { Customer } from '@/types/backoffice';

export default function CustomersScreen() {
  const t = useThemeColors();
  const isTablet = useIsTablet();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);

  const cols = isTablet ? 2 : 1;

  const { data: customers = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get('/customers', { params: { q: search || undefined } })).data as Customer[],
  });

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View style={centered(isTablet, GRID_MAX)} className="flex-row items-center gap-2 px-4 pt-3 pb-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-lg border border-border dark:border-dark-border bg-input dark:bg-dark-input px-3 h-11">
          <Search size={16} color={t.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาลูกค้า…"
            placeholderTextColor={t.placeholder}
            keyboardAppearance={t.isDark ? 'dark' : 'light'}
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
          <ActivityIndicator color={t.primary} />
        </View>
      ) : (
        <FlatList
          key={cols}
          numColumns={cols}
          data={customers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: cols > 1 ? 12 : 16, gap: cols > 1 ? 0 : 8, ...centered(isTablet, GRID_MAX) }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <UserCircle size={28} color={t.faint} />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่พบลูกค้า</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={cols > 1 ? { flex: 1, maxWidth: '50%', padding: 4 } : undefined}>
            <Pressable
              onPress={() => setSelectedId(item.id)}
              className="flex-row items-center justify-between rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3.5"
            >
              <View className="flex-1">
                <Text numberOfLines={1} className="text-[14px] font-medium text-foreground dark:text-dark-foreground">{item.name}</Text>
                <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                  {item.phone ?? 'ไม่มีเบอร์'} · {item.points} แต้ม
                  {item.lastVisitAt ? ` · ${formatDate(item.lastVisitAt)}` : ''}
                </Text>
              </View>
              <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{formatCurrency(item.totalSpent)}</Text>
            </Pressable>
            </View>
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
