import { useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Package, ImageOff } from 'lucide-react-native';
import { api } from '@/lib/api';
import { resolveImageUrl } from '@/lib/imageUrl';
import { useIsTablet } from '@/hooks/useIsTablet';
import { centered, GRID_MAX } from '@/lib/layout';
import { useThemeColors } from '@/lib/theme';
import { formatCurrency } from '@/lib/format';
import { ProductFormModal } from '@/components/ProductFormModal';
import type { Category, Product } from '@/types/pos';

export default function ProductsScreen() {
  const t = useThemeColors();
  const isTablet = useIsTablet();
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

  const cols = isTablet ? 2 : 1;

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
      <View style={centered(isTablet, GRID_MAX)} className="flex-row items-center gap-2 px-4 pt-3 pb-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-lg border border-border dark:border-dark-border bg-input dark:bg-dark-input px-3 h-11">
          <Search size={16} color={t.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาสินค้า…"
            placeholderTextColor={t.placeholder}
            keyboardAppearance={t.isDark ? 'dark' : 'light'}
            className="flex-1 text-[14px] text-foreground dark:text-dark-foreground"
          />
        </View>
        <Pressable onPress={openCreate} hitSlop={4} className="h-11 w-11 items-center justify-center rounded-lg bg-primary">
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
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: cols > 1 ? 12 : 16, gap: cols > 1 ? 0 : 8, ...centered(isTablet, GRID_MAX) }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <Package size={28} color={t.faint} />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่พบสินค้า</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={cols > 1 ? { flex: 1, maxWidth: '50%', padding: 4 } : undefined}>
            <Pressable
              onPress={() => openEdit(item)}
              className="flex-row items-center gap-3 rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3"
            >
              <View className="h-12 w-12 items-center justify-center rounded-lg bg-muted dark:bg-dark-muted overflow-hidden">
                {item.image ? (
                  <Image source={{ uri: resolveImageUrl(item.image) }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                ) : (
                  <ImageOff size={18} color={t.faint} />
                )}
              </View>
              <View className="flex-1">
                <Text numberOfLines={1} className="text-[14px] font-medium text-foreground dark:text-dark-foreground">{item.name}</Text>
                <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                  {item.category?.name ?? 'ไม่มีหมวดหมู่'} · {item.sku}
                  {item.trackStock && item.inventory ? ` · คงเหลือ ${item.inventory.quantity}` : ''}
                </Text>
              </View>
              <Text className="text-[14px] font-bold text-primary dark:text-primary-400">{formatCurrency(item.sellingPrice)}</Text>
            </Pressable>
            </View>
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
