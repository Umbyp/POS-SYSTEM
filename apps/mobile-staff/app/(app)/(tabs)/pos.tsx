import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatElapsedMinutes } from '@/lib/format';
import { useCart } from '@/stores/cart.store';
import { CartSheet } from '@/components/CartSheet';
import { PaymentModal, type PaymentMode } from '@/components/PaymentModal';
import { useIsTablet } from '@/hooks/useIsTablet';
import { TABLE_STATUS_DOT } from '@/constants/tableStatus';
import { printReceipt, PrinterError } from '@/lib/printer';
import type { Category, Product, Order, RestaurantTable } from '@/types/pos';
import type { StoreSettings } from '@/types/backoffice';

export default function PosScreen() {
  const cart = useCart();
  const isTablet = useIsTablet();
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

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data as StoreSettings,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => (await api.get('/tables')).data as RestaurantTable[],
    enabled: cart.type === 'DINE_IN' && !!cart.tableId,
  });
  const selectedTable = tables.find((t) => t.id === cart.tableId);

  const itemCount = cart.itemCount();
  const subtotal = cart.subtotal();

  const pills = useMemo(() => [{ id: null, name: 'ทั้งหมด' }, ...categories], [categories]);

  async function onPrintReceipt(orderId: string) {
    if (!store) return;
    try {
      const order = (await api.get(`/orders/${orderId}`)).data as Order;
      await printReceipt(store, order);
    } catch (err) {
      const message = err instanceof PrinterError ? err.message : 'พิมพ์ไม่สำเร็จ — ตรวจสอบว่ามือถือต่อ WiFi เดียวกับเครื่องพิมพ์';
      Alert.alert('พิมพ์ไม่สำเร็จ', message);
    }
  }

  const typeLabel = cart.type === 'DINE_IN' ? 'ทานที่ร้าน' : cart.type === 'TAKEAWAY' ? 'กลับบ้าน' : 'เดลิเวอรี่';
  const headerTitle = cart.type === 'DINE_IN' ? (selectedTable ? `โต๊ะ ${selectedTable.number}` : 'เลือกโต๊ะ') : typeLabel;
  const metaParts: string[] = headerTitle === typeLabel ? [] : [typeLabel];
  if (cart.type === 'DINE_IN' && selectedTable) {
    metaParts.push(`${selectedTable.capacity} ที่นั่ง`);
    if (selectedTable.occupiedAt) {
      metaParts.push(formatElapsedMinutes(selectedTable.occupiedAt));
    }
  }
  const spineColor = cart.type === 'DINE_IN' && selectedTable ? TABLE_STATUS_DOT[selectedTable.status] : '#2B1F17';
  const summary = cart.items.map((i) => `${i.quantity}× ${i.name}`).join(' · ');
  const qtyById = useMemo(() => Object.fromEntries(cart.items.map((i) => [i.productId, i.quantity])), [cart.items]);
  const columns = isTablet ? 4 : 2;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row items-center justify-between gap-2.5 bg-card dark:bg-dark-card border-b border-border dark:border-dark-border px-3.5 py-2.5">
        <View className="flex-row items-center gap-2 flex-shrink">
          <View style={{ backgroundColor: spineColor, height: 34 }} className="w-1.5 rounded-[3px]" />
          <View className="flex-shrink">
            <Text numberOfLines={1} className="text-[15px] font-bold text-foreground dark:text-dark-foreground">{headerTitle}</Text>
            <Text numberOfLines={1} className="text-[11px] font-medium text-muted-foreground dark:text-dark-muted-foreground">
              {metaParts.join(' · ')}
            </Text>
          </View>
        </View>
        <View
          style={{ maxWidth: isTablet ? 280 : 150 }}
          className="flex-1 flex-row items-center gap-2 rounded-[9px] border border-border dark:border-dark-border bg-background dark:bg-dark-input px-3 h-[38px]"
        >
          <Search size={14} color="#A89684" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาสินค้า…"
            placeholderTextColor="#A89684"
            className="flex-1 text-[13px] text-foreground dark:text-dark-foreground"
          />
        </View>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={pills}
        keyExtractor={(c) => c.id ?? 'all'}
        contentContainerStyle={{ paddingHorizontal: isTablet ? 18 : 14, paddingVertical: 12, gap: 8 }}
        style={{ flexGrow: 0, flexShrink: 0 }}
        renderItem={({ item }) => {
          const active = categoryId === item.id;
          return (
            <Pressable
              onPress={() => setCategoryId(item.id)}
              className={`h-9 items-center justify-center rounded-full px-3.5 border ${active ? 'bg-primary border-primary' : 'bg-card border-border dark:bg-dark-card dark:border-dark-border'}`}
            >
              <Text className={`text-[13px] ${active ? 'font-semibold text-white' : 'font-medium text-foreground dark:text-dark-foreground'}`}>
                {item.name}
              </Text>
            </Pressable>
          );
        }}
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C9622E" />
        </View>
      ) : (
        <FlatList
          key={columns}
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={columns}
          contentContainerStyle={{ paddingHorizontal: isTablet ? 18 : 14, paddingTop: 8, paddingBottom: itemCount > 0 ? 150 : 16, gap: 10 }}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => {
            const qty = qtyById[item.id] ?? 0;
            const selected = qty > 0;
            const soldOut = item.trackStock && !!item.inventory && item.inventory.quantity <= 0;
            return (
              <Pressable
                onPress={() => cart.addItem({ productId: item.id, name: item.name, unitPrice: Number(item.sellingPrice) })}
                style={{ minHeight: isTablet ? 104 : 92, borderWidth: selected ? 2 : 1 }}
                className={`flex-1 rounded-xl p-3 gap-2 ${
                  selected
                    ? 'border-primary bg-card dark:bg-dark-card'
                    : soldOut
                      ? 'border-border bg-background dark:border-dark-border dark:bg-dark-background'
                      : 'border-border bg-card dark:border-dark-border dark:bg-dark-card'
                }`}
              >
                {selected ? (
                  <View className="absolute -top-2 -right-1.5 z-10 min-w-[22px] h-[22px] items-center justify-center rounded-full bg-primary px-1.5">
                    <Text className="text-[12px] font-bold text-white">{qty}</Text>
                  </View>
                ) : null}
                <Text
                  numberOfLines={2}
                  className={`text-[14px] font-semibold ${soldOut ? 'text-muted-foreground dark:text-dark-muted-foreground' : 'text-foreground dark:text-dark-foreground'}`}
                >
                  {item.name}
                </Text>
                <View className="mt-auto flex-row items-center justify-between">
                  <Text className={`text-[15px] font-bold ${soldOut ? 'text-muted-foreground dark:text-dark-muted-foreground' : 'text-foreground dark:text-dark-foreground'}`}>
                    {formatCurrency(item.sellingPrice)}
                  </Text>
                  {soldOut ? (
                    <View className="rounded-full bg-[#FEE2E2] px-2 py-[3px]">
                      <Text className="text-[11px] font-bold text-danger">หมด</Text>
                    </View>
                  ) : (
                    <View className={`h-7 w-7 items-center justify-center rounded-lg ${selected ? 'bg-primary' : 'bg-primary-50'}`}>
                      <Text className={`text-[16px] font-bold ${selected ? 'text-white' : 'text-primary-600'}`}>+</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {itemCount > 0 ? (
        <View className="absolute bottom-0 left-0 right-0 bg-card dark:bg-dark-card border-t border-border dark:border-dark-border px-3.5 pt-2.5 pb-3">
          <View className="flex-row items-center justify-between pb-2 gap-2">
            <Text numberOfLines={1} className="flex-1 text-[12px] font-medium text-muted-foreground dark:text-dark-muted-foreground">
              {summary}
            </Text>
            <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">▲</Text>
          </View>
          <Pressable
            onPress={() => setShowCart(true)}
            className="h-14 flex-row items-center justify-between rounded-xl bg-primary px-[18px]"
          >
            <Text className="text-[15px] font-semibold text-white">
              {itemCount} รายการ{cart.type === 'DINE_IN' ? 'ใหม่ · ส่งเข้าครัว' : ' · ดูตะกร้า'}
            </Text>
            <Text className="text-[19px] font-bold text-white">{formatCurrency(subtotal)}</Text>
          </Pressable>
        </View>
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
