import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { X, Minus, Plus, ShoppingBag } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/stores/cart.store';
import { TablePickerModal } from '@/components/TablePickerModal';
import type { Order, OrderType, RestaurantTable } from '@/types/pos';
import type { PaymentMode } from '@/components/PaymentModal';

const TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'ทานที่ร้าน',
  TAKEAWAY: 'กลับบ้าน',
  DELIVERY: 'เดลิเวอรี่',
};

interface CartSheetProps {
  visible: boolean;
  onClose: () => void;
  onCheckout: (mode: PaymentMode) => void;
}

export function CartSheet({ visible, onClose, onCheckout }: CartSheetProps) {
  const qc = useQueryClient();
  const cart = useCart();
  const [showTablePicker, setShowTablePicker] = useState(false);
  const isDineIn = cart.type === 'DINE_IN';
  const hasUnsent = cart.items.length > 0;

  const { data: openOrder } = useQuery({
    queryKey: ['orders', 'open-by-table', cart.tableId],
    queryFn: async () => (await api.get(`/orders/open/by-table/${cart.tableId}`)).data as Order | null,
    enabled: visible && cart.type === 'DINE_IN' && !!cart.tableId,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => (await api.get('/tables')).data as RestaurantTable[],
    enabled: visible && isDineIn,
  });
  const selectedTable = tables.find((t) => t.id === cart.tableId);

  useEffect(() => {
    if (openOrder?.id && openOrder.id !== cart.openOrderId) cart.setOpenOrder(openOrder.id);
    if (!openOrder && cart.openOrderId) cart.setOpenOrder(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrder?.id]);

  const send = useMutation({
    mutationFn: async () => {
      const items = cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, notes: i.notes }));
      if (cart.openOrderId) {
        return (await api.post(`/orders/${cart.openOrderId}/items`, { items })).data as Order;
      }
      return (await api.post('/orders/open', { tableId: cart.tableId, type: cart.type, items })).data as Order;
    },
    onSuccess: (order) => {
      cart.setOpenOrder(order.id);
      cart.clearItems();
      qc.invalidateQueries({ queryKey: ['kds-orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'open-by-table', cart.tableId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'ส่งเข้าครัวไม่สำเร็จ' : 'ส่งเข้าครัวไม่สำเร็จ';
      Alert.alert('ส่งเข้าครัวไม่สำเร็จ', message);
    },
  });

  function onSelectType(type: OrderType) {
    if (type !== 'DINE_IN' && cart.type === 'DINE_IN') cart.clear();
    cart.setType(type);
  }

  function onSelectTable(table: RestaurantTable) {
    if (cart.tableId && cart.tableId !== table.id) {
      cart.clearItems();
      cart.setOpenOrder(undefined);
    }
    cart.setTable(table.id);
    setShowTablePicker(false);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* RN's Modal renders into a separate native root, so the app's root
          SafeAreaProvider doesn't reach it — it needs its own. */}
      <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-dark-border">
          <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ตะกร้า</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={22} color="#9CA3AF" />
          </Pressable>
        </View>

        <View className="flex-row gap-2 px-4 py-3">
          {(Object.keys(TYPE_LABEL) as OrderType[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => onSelectType(t)}
              className={`flex-1 items-center rounded-lg py-2 ${cart.type === t ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'}`}
            >
              <Text className={`text-[12px] font-semibold ${cart.type === t ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
                {TYPE_LABEL[t]}
              </Text>
            </Pressable>
          ))}
        </View>

        {isDineIn ? (
          <Pressable
            onPress={() => setShowTablePicker(true)}
            className="mx-4 mb-2 flex-row items-center justify-between rounded-lg border border-border dark:border-dark-border px-3.5 py-2.5"
          >
            <Text className="text-[13px] text-foreground dark:text-dark-foreground">
              {selectedTable ? `โต๊ะ ${selectedTable.number}` : 'เลือกโต๊ะ'}
            </Text>
            <Text className="text-[12px] text-primary font-medium">เปลี่ยน</Text>
          </Pressable>
        ) : null}

        {isDineIn && openOrder ? (
          <View className="mx-4 mb-2 rounded-lg bg-primary-50 dark:bg-dark-muted px-3.5 py-2.5">
            <Text className="text-[12px] text-foreground dark:text-dark-foreground">
              บิลเปิดอยู่ #{openOrder.orderNumber} · ส่งแล้ว {formatCurrency(openOrder.total)}
            </Text>
          </View>
        ) : null}

        <ScrollView className="flex-1 px-4" contentContainerClassName="gap-3 pb-4">
          {cart.items.length === 0 ? (
            <View className="items-center py-16 gap-2">
              <ShoppingBag size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีสินค้าในตะกร้า</Text>
            </View>
          ) : (
            cart.items.map((item) => (
              <View key={item.productId} className="flex-row items-center justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-[13px] text-foreground dark:text-dark-foreground">{item.name}</Text>
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{formatCurrency(item.unitPrice)}</Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <Pressable onPress={() => cart.updateQty(item.productId, item.quantity - 1)} hitSlop={8}>
                    <Minus size={18} color="#6B7280" />
                  </Pressable>
                  <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground w-5 text-center">{item.quantity}</Text>
                  <Pressable onPress={() => cart.updateQty(item.productId, item.quantity + 1)} hitSlop={8}>
                    <Plus size={18} color="#6B7280" />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View className="border-t border-border dark:border-dark-border p-4 gap-3">
          <View className="flex-row justify-between">
            <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">รายการใหม่</Text>
            <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">{formatCurrency(cart.subtotal())}</Text>
          </View>

          {isDineIn ? (
            !cart.tableId ? (
              <View className="h-12 items-center justify-center rounded-lg bg-muted dark:bg-dark-muted">
                <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">กรุณาเลือกโต๊ะก่อน</Text>
              </View>
            ) : hasUnsent ? (
              <Pressable
                onPress={() => send.mutate()}
                disabled={send.isPending}
                className="h-12 items-center justify-center rounded-lg bg-primary"
              >
                <Text className="text-[15px] font-semibold text-white">{send.isPending ? 'กำลังส่ง…' : 'ส่งเข้าครัว'}</Text>
              </Pressable>
            ) : cart.openOrderId ? (
              <Pressable
                onPress={() => onCheckout({ kind: 'settle', orderId: cart.openOrderId! })}
                className="h-12 items-center justify-center rounded-lg bg-primary"
              >
                <Text className="text-[15px] font-semibold text-white">ชำระเงิน</Text>
              </Pressable>
            ) : (
              <View className="h-12 items-center justify-center rounded-lg bg-muted dark:bg-dark-muted">
                <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">เพิ่มสินค้าเพื่อเริ่มบิล</Text>
              </View>
            )
          ) : (
            <Pressable
              onPress={() => onCheckout({ kind: 'new', type: cart.type, items: cart.items })}
              disabled={!hasUnsent}
              className={`h-12 items-center justify-center rounded-lg bg-primary ${!hasUnsent ? 'opacity-50' : ''}`}
            >
              <Text className="text-[15px] font-semibold text-white">ชำระเงิน</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
      </SafeAreaProvider>

      <TablePickerModal visible={showTablePicker} onClose={() => setShowTablePicker(false)} onSelect={onSelectTable} />
    </Modal>
  );
}
