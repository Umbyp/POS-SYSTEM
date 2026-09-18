import { useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Package, ImageOff } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { ProductFormModal } from '@/components/ProductFormModal';
import type { Category, Product } from '@/types/pos';

export default function ProductsScreen() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/products/categories')).data as Category[],
  });

  const { data: products = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => (await api.get('/products', { params: { q: search || undefined } })).data as Product[],
  });

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setShowForm(true);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row items-center gap-2 px-4 pt-3 pb-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-lg border border-border dark:border-dark-border bg-input dark:bg-dark-input px-3 h-11">
          <Search size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาสินค้า…"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-[14px] text-foreground dark:text-dark-foreground"
          />
        </View>
        <Pressable onPress={openCreate} className="h-11 w-11 items-center justify-center rounded-lg bg-primary">
          <Plus size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FF6B35" />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <Package size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่พบสินค้า</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item)}
              className="flex-row items-center gap-3 rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3"
            >
              <View className="h-12 w-12 items-center justify-center rounded-lg bg-muted dark:bg-dark-muted overflow-hidden">
                {item.image ? (
                  <Image source={{ uri: item.image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                ) : (
                  <ImageOff size={18} color="#9CA3AF" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-medium text-foreground dark:text-dark-foreground">{item.name}</Text>
                <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                  {item.category?.name ?? 'ไม่มีหมวดหมู่'} · {item.sku}
                  {item.trackStock && item.inventory ? ` · คงเหลือ ${item.inventory.quantity}` : ''}
                </Text>
              </View>
              <Text className="text-[14px] font-bold text-primary">{formatCurrency(item.sellingPrice)}</Text>
            </Pressable>
          )}
        />
      )}

      <ProductFormModal
        visible={showForm}
        product={editing}
        categories={categories}
        onClose={() => setShowForm(false)}
        onSaved={() => setShowForm(false)}
      />
    </SafeAreaView>
  );
}
