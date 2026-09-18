import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Search, ShoppingCart } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/stores/cart.store';
import { CartSheet } from '@/components/CartSheet';
import { PaymentModal, type PaymentMode } from '@/components/PaymentModal';
import type { Category, Product } from '@/types/pos';

export default function PosScreen() {
  const cart = useCart();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [success, setSuccess] = useState<{ id: string; orderNumber: string; total: string } | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/products/categories')).data as Category[],
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search, categoryId],
    queryFn: async () =>
      (await api.get('/products', { params: { q: search || undefined, categoryId: categoryId || undefined } })).data as Product[],
  });

  const itemCount = cart.itemCount();
  const subtotal = cart.subtotal();

  const pills = useMemo(() => [{ id: null, name: 'ทั้งหมด' }, ...categories], [categories]);

  async function onPrintReceipt(orderId: string) {
    try {
      await api.post(`/orders/${orderId}/print/escpos`);
    } catch (err) {
      const message = isAxiosError(err)
        ? err.response?.data?.error ?? 'พิมพ์ไม่สำเร็จ — ตรวจสอบเครื่องพิมพ์'
        : 'พิมพ์ไม่สำเร็จ';
      Alert.alert('พิมพ์ไม่สำเร็จ', message);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2 rounded-lg border border-border dark:border-dark-border bg-input dark:bg-dark-input px-3 h-11">
          <Search size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาสินค้า…"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-[14px] text-foreground dark:text-dark-foreground"
          />
        </View>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={pills}
        keyExtractor={(c) => c.id ?? 'all'}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        style={{ flexGrow: 0, marginBottom: 8 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setCategoryId(item.id)}
            className={`rounded-full px-3.5 py-1.5 ${categoryId === item.id ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'}`}
          >
            <Text className={`text-[13px] font-medium ${categoryId === item.id ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
              {item.name}
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
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={{ padding: 16, paddingBottom: itemCount > 0 ? 96 : 16, gap: 10 }}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => cart.addItem({ productId: item.id, name: item.name, unitPrice: Number(item.sellingPrice) })}
              className="flex-1 rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3 gap-1.5"
            >
              <Text numberOfLines={2} className="text-[13px] font-medium text-foreground dark:text-dark-foreground">
                {item.name}
              </Text>
              <Text className="text-[13px] font-bold text-primary">{formatCurrency(item.sellingPrice)}</Text>
            </Pressable>
          )}
        />
      )}

      {itemCount > 0 ? (
        <Pressable
          onPress={() => setShowCart(true)}
          className="absolute bottom-4 left-4 right-4 h-14 flex-row items-center justify-between rounded-xl bg-primary px-5 shadow-pop"
        >
          <View className="flex-row items-center gap-2">
            <ShoppingCart size={18} color="#FFFFFF" />
            <Text className="text-[14px] font-semibold text-white">{itemCount} รายการ</Text>
          </View>
          <Text className="text-[15px] font-bold text-white">{formatCurrency(subtotal)}</Text>
        </Pressable>
      ) : null}

      <CartSheet
        visible={showCart}
        onClose={() => setShowCart(false)}
        onCheckout={(mode) => {
          // Only one RN <Modal> can be reliably visible at a time on iOS —
          // close the cart sheet before presenting the payment modal.
          setShowCart(false);
          setPaymentMode(mode);
        }}
      />

      <PaymentModal
        visible={!!paymentMode}
        mode={paymentMode}
        onClose={() => setPaymentMode(null)}
        onSuccess={(order) => {
          setPaymentMode(null);
          setShowCart(false);
          cart.clear();
          setSuccess(order);
        }}
        onQueuedOffline={() => {
          setPaymentMode(null);
          setShowCart(false);
          cart.clear();
          Alert.alert(
            'บันทึกออฟไลน์แล้ว',
            'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ — รายการนี้จะถูกส่งอัตโนมัติเมื่อมีสัญญาณอินเทอร์เน็ต'
          );
        }}
      />

      {success ? (
        <View className="absolute inset-0 items-center justify-center bg-black/40 px-8">
          <View className="w-full rounded-2xl bg-card dark:bg-dark-card p-6 gap-3 items-center">
            <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">ชำระเงินสำเร็จ</Text>
            <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">
              #{success.orderNumber} · {formatCurrency(success.total)}
            </Text>
            <Pressable
              onPress={() => onPrintReceipt(success.id)}
              className="h-11 w-full items-center justify-center rounded-lg bg-primary mt-2"
            >
              <Text className="text-[14px] font-semibold text-white">พิมพ์ใบเสร็จ</Text>
            </Pressable>
            <Pressable onPress={() => setSuccess(null)} className="h-11 w-full items-center justify-center rounded-lg bg-muted dark:bg-dark-muted">
              <Text className="text-[14px] font-medium text-foreground dark:text-dark-foreground">เสร็จสิ้น</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
