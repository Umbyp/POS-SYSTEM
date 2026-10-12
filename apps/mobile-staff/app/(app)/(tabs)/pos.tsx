import { useMemo, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, TextInput, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Search, ImageIcon } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatElapsedMinutes } from '@/lib/format';
import { useCart } from '@/stores/cart.store';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { OptionPickerModal } from '@/components/OptionPickerModal';
import { hasOptions } from '@/lib/options';
import { resolveImageUrl } from '@/lib/imageUrl';
import { CartSheet } from '@/components/CartSheet';
import { CartPanel } from '@/components/CartPanel';
import { ShiftChip } from '@/components/ShiftChip';
import { PaymentModal, type PaymentMode, type AppliedReward } from '@/components/PaymentModal';
import { useIsTablet } from '@/hooks/useIsTablet';
import { TABLE_STATUS_DOT } from '@/constants/tableStatus';
import { printReceipt, PrinterError } from '@/lib/printer';
import type { Category, Product, OrderType, Order, RestaurantTable } from '@/types/pos';
import type { StoreSettings } from '@/types/backoffice';
import { useThemeColors } from '@/lib/theme';

export default function PosScreen() {
  const theme = useThemeColors();
  const cart = useCart();
  const isTablet = useIsTablet();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState<Product | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [success, setSuccess] = useState<{ id: string; orderNumber: string; total: string; discount?: string; pointsEarned?: number | null; pointsRedeemed?: number | null; stampsEarned?: number | null; stampsRedeemed?: number | null; appliedReward?: AppliedReward | null } | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/products/categories')).data as Category[],
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search, categoryId],
    queryFn: async () =>
      (await api.get('/products', { params: { q: search || undefined, categoryId: categoryId || undefined } })).data as Product[],
  });

  // Unfiltered list, only used for the per-category item counts on the chips.
  const { data: allProducts = [] } = useQuery({
    queryKey: ['products', '', null],
    queryFn: async () => (await api.get('/products')).data as Product[],
  });
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of allProducts) if (p.categoryId) m[p.categoryId] = (m[p.categoryId] ?? 0) + 1;
    return m;
  }, [allProducts]);

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

  function onCheckout(mode: PaymentMode) {
    // Only one RN <Modal> can be reliably visible at a time on iOS —
    // close the cart sheet before presenting the payment modal.
    setShowCart(false);
    setPaymentMode(mode);
  }

  function onSelectType(type: OrderType) {
    if (type !== 'DINE_IN' && cart.type === 'DINE_IN') cart.clear();
    cart.setType(type);
  }

  function onAddProduct(p: Product) {
    if (hasOptions(p)) setPicking(p);
    else cart.addItem({ productId: p.id, name: p.name, unitPrice: Number(p.sellingPrice), image: p.image ?? undefined, categoryId: p.categoryId ?? undefined });
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
  const spineColor = cart.type === 'DINE_IN' && selectedTable ? TABLE_STATUS_DOT[selectedTable.status] : '#1F1F1F';
    const qtyById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of cart.items) m[i.productId] = (m[i.productId] ?? 0) + i.quantity;
    return m;
  }, [cart.items]);
  // Sidebar (~196) + cart panel (340) take a fixed share of a tablet's width — size the grid to what's left.
  const { width: windowWidth } = useWindowDimensions();
  const columns = isTablet ? Math.max(2, Math.min(5, Math.floor((windowWidth - 196 - 340) / 150))) : 2;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['top', 'bottom', 'left', 'right']}>
      <View className="flex-1 flex-row">
      <View className="flex-1">
      <View className="bg-card dark:bg-dark-card px-3.5 pt-3">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-shrink">
            <Text numberOfLines={1} className="text-[18px] font-bold text-foreground dark:text-dark-foreground">รับออเดอร์</Text>
            <Text numberOfLines={1} className="text-[11px] font-medium text-muted-foreground dark:text-dark-muted-foreground">
              {[headerTitle, ...metaParts].join(' · ')}
            </Text>
            <View className="mt-1.5 flex-row"><ShiftChip /></View>
          </View>
          {isTablet ? null : (
            <View style={{ width: 170 }} className="overflow-hidden rounded-lg border border-border dark:border-dark-border">
              <UnderlineTabs
                tabs={[{ key: 'DINE_IN', label: 'ทานที่ร้าน' }, { key: 'TAKEAWAY', label: 'กลับบ้าน' }]}
                value={cart.type === 'DELIVERY' ? 'TAKEAWAY' : cart.type}
                onChange={(k) => onSelectType(k as OrderType)}
                className="border-b-0"
              />
            </View>
          )}
        </View>
        <View className="mt-3 mb-1 h-10 flex-row items-center gap-2 rounded-lg border border-border dark:border-dark-border bg-background dark:bg-dark-input px-3">
          <Search size={14} color={theme.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาเมนู"
            placeholderTextColor={theme.placeholder}
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
              className={`h-9 items-center justify-center rounded-full px-3.5 border ${active ? 'bg-primary-50 border-primary dark:bg-dark-muted' : 'bg-card border-border dark:bg-dark-card dark:border-dark-border'}`}
            >
              <Text className={`text-[13px] ${active ? 'font-semibold text-primary' : 'font-medium text-foreground dark:text-dark-foreground'}`}>
                {item.name}
                <Text className="text-[11px] font-normal text-muted-foreground">
                  {' '}{item.id === null ? allProducts.length : counts[item.id] ?? 0}
                </Text>
              </Text>
            </Pressable>
          );
        }}
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#D25E3B" />
        </View>
      ) : (
        <FlatList
          key={columns}
          // Pad the last row so an odd product count doesn't stretch the final card across the row.
          data={[...products, ...Array.from({ length: (columns - (products.length % columns)) % columns }, (_, i) => ({ id: `pad-${i}`, pad: true } as unknown as Product))]}
          keyExtractor={(p) => p.id}
          numColumns={columns}
          contentContainerStyle={{ paddingHorizontal: isTablet ? 18 : 14, paddingTop: 8, paddingBottom: itemCount > 0 && !isTablet ? 90 : 16, gap: 10 }}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => {
            if ((item as unknown as { pad?: boolean }).pad) return <View className="flex-1" />;
            const qty = qtyById[item.id] ?? 0;
            const selected = qty > 0;
            const soldOut = !!item.trackStock && !!item.inventory && item.inventory.quantity <= 0;
            return (
              <Pressable
                onPress={() => !soldOut && onAddProduct(item)}
                style={{ borderWidth: selected ? 1.5 : 1 }}
                className={`flex-1 overflow-hidden rounded-[10px] ${
                  selected ? 'border-primary' : 'border-border dark:border-dark-border'
                } ${soldOut ? 'bg-background dark:bg-dark-background' : 'bg-card dark:bg-dark-card'}`}
              >
                <View className="h-[88px] items-center justify-center bg-muted dark:bg-dark-muted">
                  {item.image ? (
                    <Image source={{ uri: resolveImageUrl(item.image) }} className="h-full w-full" resizeMode="cover" />
                  ) : (
                    <ImageIcon size={22} color={theme.faint} />
                  )}
                  {selected ? (
                    <View className="absolute right-1.5 top-1.5 min-w-[20px] h-5 items-center justify-center rounded-full bg-primary px-1.5">
                      <Text className="text-[11px] font-bold text-white">{qty}</Text>
                    </View>
                  ) : null}
                  {soldOut ? (
                    <View className="absolute left-1.5 top-1.5 rounded bg-danger px-1.5 py-0.5">
                      <Text className="text-[10px] font-bold text-white">หมด</Text>
                    </View>
                  ) : null}
                </View>
                <View className="gap-2 p-2.5">
                  <Text
                    numberOfLines={2}
                    className={`min-h-[34px] text-[13px] font-semibold ${soldOut ? 'text-muted-foreground dark:text-dark-muted-foreground' : 'text-foreground dark:text-dark-foreground'}`}
                  >
                    {item.name}
                  </Text>
                  <View className={isTablet ? 'gap-1.5' : 'flex-row items-center justify-between'}>
                    <Text className={`text-[14px] font-bold ${soldOut ? 'text-muted-foreground dark:text-dark-muted-foreground' : 'text-foreground dark:text-dark-foreground'}`}>
                      {formatCurrency(item.sellingPrice)}
                    </Text>
                    {soldOut ? null : (
                      <View className={`h-7 flex-row items-center justify-center rounded-md border border-primary px-2.5 ${isTablet ? 'w-full' : ''}`}>
                        <Text className="text-[12px] font-semibold text-primary">+ เพิ่ม</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      </View>

      {isTablet ? (
        <View className="w-[340px] border-l border-border bg-card dark:border-dark-border dark:bg-dark-card">
          <CartPanel
            active
            onCheckout={onCheckout}
            header={
              <View className="flex-row items-baseline justify-between border-b border-border px-4 pb-2.5 pt-3.5 dark:border-dark-border">
                <Text className="text-[15px] font-bold text-foreground dark:text-dark-foreground">ตะกร้า · {headerTitle}</Text>
                <Text className="text-[11px] font-medium text-muted-foreground dark:text-dark-muted-foreground">
                  รายการใหม่ {itemCount} ชิ้น
                </Text>
              </View>
            }
          />
        </View>
      ) : null}
      </View>

      {itemCount > 0 && !isTablet ? (
        <View className="absolute bottom-0 left-0 right-0 px-3.5 pb-3 pt-2">
          <Pressable
            onPress={() => setShowCart(true)}
            className="h-14 flex-row items-center justify-between rounded-[10px] bg-primary px-4"
          >
            <View className="flex-row items-center gap-2.5">
              <View className="h-[26px] min-w-[26px] items-center justify-center rounded-full bg-white px-1.5">
                <Text className="text-[13px] font-bold text-primary">{itemCount}</Text>
              </View>
              <Text className="text-[15px] font-semibold text-white">ดูออเดอร์</Text>
            </View>
            <Text className="text-[17px] font-bold text-white">{formatCurrency(subtotal)}</Text>
          </Pressable>
        </View>
      ) : null}

      <OptionPickerModal
        product={picking}
        onClose={() => setPicking(null)}
        onConfirm={({ quantity, variants, notes }) => {
          if (!picking) return;
          cart.addItem({
            productId: picking.id,
            name: picking.name,
            unitPrice: Number(picking.sellingPrice) + variants.reduce((a, v) => a + v.priceDelta, 0),
            image: picking.image ?? undefined,
            categoryId: picking.categoryId ?? undefined,
            notes,
            variants: variants.length > 0 ? variants : undefined,
            quantity,
          });
        }}
      />

      {isTablet ? null : (
        <CartSheet visible={showCart} onClose={() => setShowCart(false)} onCheckout={onCheckout} />
      )}

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
            {Number(success.discount) > 0 ? (
              <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                ส่วนลดรวม −{formatCurrency(success.discount ?? 0)}
              </Text>
            ) : null}
            {(success.pointsRedeemed ?? 0) > 0 ? (
              <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                ใช้แต้ม {success.pointsRedeemed!.toLocaleString()}
              </Text>
            ) : null}
            {success.appliedReward ? (
              <Text className="text-center text-[12px] font-semibold text-primary dark:text-primary-400">
                {success.appliedReward.kind === 'FREE_ITEM'
                  ? `มอบของรางวัล: ${success.appliedReward.name}`
                  : `รางวัล ${success.appliedReward.name} −${formatCurrency(success.appliedReward.discountApplied)}`}
              </Text>
            ) : null}
            {(success.stampsRedeemed ?? 0) > 0 ? (
              <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                ใช้ดวงแลกรางวัล {success.stampsRedeemed} ดวง
              </Text>
            ) : null}
            {(success.stampsEarned ?? 0) > 0 ? (
              <View className="rounded-full bg-primary-50 px-3 py-1 dark:bg-dark-muted">
                <Text className="text-[13px] font-bold text-primary dark:text-primary-400">
                  ได้รับ {success.stampsEarned} ดวง
                </Text>
              </View>
            ) : null}
            {(success.pointsEarned ?? 0) > 0 ? (
              <View className="rounded-full bg-primary-50 px-3 py-1 dark:bg-dark-muted">
                <Text className="text-[13px] font-bold text-primary dark:text-primary-400">
                  ได้รับ {success.pointsEarned!.toLocaleString()} แต้ม
                </Text>
              </View>
            ) : null}
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
