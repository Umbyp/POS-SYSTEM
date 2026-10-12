import { useEffect, useState, type ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Image, TextInput } from 'react-native';
import { ImageIcon, Minus, Plus, ShoppingBag, ChevronDown, UserRound, Tag, WifiOff } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useCart, itemKey, toOrderItem } from '@/stores/cart.store';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { resolveImageUrl } from '@/lib/imageUrl';
import { useCartPricing } from '@/hooks/useCartPricing';
import { DiscountSheet } from '@/components/DiscountSheet';
import { MemberSheet } from '@/components/MemberSheet';
import { useOfflineQueue } from '@/stores/offlineQueue.store';
import { uuid } from '@/lib/uuid';
import type { StoreSettings } from '@/types/backoffice';
import { TablePickerModal } from '@/components/TablePickerModal';
import type { Order, OrderType, RestaurantTable } from '@/types/pos';
import type { PaymentMode } from '@/components/PaymentModal';
import { useThemeColors } from '@/lib/theme';

const TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'ทานที่ร้าน',
  TAKEAWAY: 'กลับบ้าน',
  DELIVERY: 'เดลิเวอรี่',
};

interface CartPanelProps {
  /** Gates the open-order/table queries (false while the phone sheet is closed). */
  active: boolean;
  /** Rendered above the cart body (the sheet's title bar / the tablet panel title). */
  header?: ReactNode;
  onCheckout: (mode: PaymentMode) => void;
}

/** Cart body shared by the phone modal (CartSheet) and the tablet side panel. */
export function CartPanel({ active, header, onCheckout }: CartPanelProps) {
  const theme = useThemeColors();
  const qc = useQueryClient();
  const cart = useCart();
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [openPayInFlight, setOpenPayInFlight] = useState(false);
  const isDineIn = cart.type === 'DINE_IN';
  const hasUnsent = cart.items.length > 0;

  const { data: openOrder } = useQuery({
    queryKey: ['orders', 'open-by-table', cart.tableId],
    queryFn: async () => (await api.get(`/orders/open/by-table/${cart.tableId}`)).data as Order | null,
    enabled: active && cart.type === 'DINE_IN' && !!cart.tableId,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => (await api.get('/tables')).data as RestaurantTable[],
    enabled: active && isDineIn,
  });
  const selectedTable = tables.find((t) => t.id === cart.tableId);

  useEffect(() => {
    if (openOrder?.id && openOrder.id !== cart.openOrderId) cart.setOpenOrder(openOrder.id);
    if (!openOrder && cart.openOrderId) cart.setOpenOrder(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrder?.id]);

  const pricing = useCartPricing(openOrder);
  const { store, totals, discounts, baseSubtotal, appliedPromo, stampRewardName } = pricing;
  const pendingOpenOpId = cart.pendingOpenOpId;
  const openOpStillQueued = useOfflineQueue((s) => !!pendingOpenOpId && s.tabOps.some((o) => o.id === pendingOpenOpId));

  /** Sends the unsent items to the kitchen. Resolves with the bill, or `null` when the request was
   * queued for later (no connection / no response) — see useOfflineSync for the replay. */
  const send = useMutation({
    mutationFn: async (): Promise<Order | null> => {
      const items = cart.items.map(toOrderItem);
      const requestId = uuid();
      const headers = { 'Idempotency-Key': requestId };
      const tableLabel = selectedTable ? ` โต๊ะ ${selectedTable.number}` : '';
      const openOrderId = cart.openOrderId;

      const queue = () => {
        const q = useOfflineQueue.getState();
        if (openOrderId) {
          q.enqueueTabOp({ id: requestId, kind: 'round', orderId: openOrderId, tableId: cart.tableId, payload: { items }, label: `ส่งเข้าครัว${tableLabel}` });
        } else if (cart.pendingOpenOpId && q.tabOps.some((o) => o.id === cart.pendingOpenOpId)) {
          // The bill itself is still queued — this round waits for it.
          q.enqueueTabOp({ id: requestId, kind: 'round', dependsOn: cart.pendingOpenOpId, tableId: cart.tableId, payload: { items }, label: `ส่งเข้าครัว${tableLabel}` });
        } else {
          q.enqueueTabOp({
            id: requestId,
            kind: 'open',
            tableId: cart.tableId,
            payload: openPayload(items),
            label: `เปิดบิล${tableLabel}`,
          });
          cart.setPendingOpenOp(requestId);
        }
        return null;
      };

      // No point waiting out a 15s timeout to learn what we already know.
      const net = await NetInfo.fetch();
      if (net.isConnected === false) return queue();

      try {
        if (openOrderId) {
          return (await api.post(`/orders/${openOrderId}/items`, { items }, { headers })).data as Order;
        }
        // The open bill is still queued locally, so a live request would create a second bill.
        if (cart.pendingOpenOpId && useOfflineQueue.getState().tabOps.some((o) => o.id === cart.pendingOpenOpId)) return queue();
        return (await api.post('/orders/open', openPayload(items), { headers })).data as Order;
      } catch (err) {
        if (isAxiosError(err) && !err.response) return queue();
        throw err;
      }
    },
    onSuccess: (order) => {
      cart.clearItems();
      if (order) cart.setOpenOrder(order.id);
      else if (!openPayInFlight) {
        Alert.alert('บันทึกออฟไลน์แล้ว', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ — รายการจะถูกส่งเข้าครัวอัตโนมัติเมื่อมีสัญญาณอินเทอร์เน็ต');
      }
      qc.invalidateQueries({ queryKey: ['kds-orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'open-by-table', cart.tableId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'ส่งเข้าครัวไม่สำเร็จ' : 'ส่งเข้าครัวไม่สำเร็จ';
      Alert.alert('ส่งเข้าครัวไม่สำเร็จ', message);
    },
  });
  function openPayload(items: ReturnType<typeof toOrderItem>[]) {
    return {
      tableId: cart.tableId,
      type: cart.type,
      items,
      ...(cart.guestCount ? { guestCount: cart.guestCount } : {}),
      ...(cart.customer ? { customerId: cart.customer.id } : {}),
    };
  }

  /** "ส่ง + ชำระ": send to the kitchen, then take payment on the bill. */
  async function onSendAndPay() {
    // Offline with no bill yet: pay-now order goes through the payment queue instead.
    const net = await NetInfo.fetch();
    if (net.isConnected === false && !cart.openOrderId && !openOpStillQueued) {
      onCheckout({ kind: 'new', type: cart.type, tableId: cart.tableId, guestCount: cart.guestCount, items: cart.items });
      return;
    }
    setOpenPayInFlight(true);
    try {
      const order = await send.mutateAsync();
      if (order) {
        onCheckout({ kind: 'settle', orderId: order.id });
      } else {
        Alert.alert('ออฟไลน์', 'ส่งเข้าครัวแบบรอซิงค์แล้ว — ชำระเงินได้เมื่อกลับมาออนไลน์');
      }
    } catch {
      // onError already alerted — stay on the cart
    } finally {
      setOpenPayInFlight(false);
    }
  }

  function onSelectType(type: OrderType) {
    if (type !== 'DINE_IN' && cart.type === 'DINE_IN') cart.clear();
    cart.setType(type);
  }

  function onSelectTable(table: RestaurantTable) {
    if (cart.tableId && cart.tableId !== table.id) {
      cart.clearItems();
      cart.clearAdjustments();
      cart.setOpenOrder(undefined);
      cart.setPendingOpenOp(undefined);
    }
    cart.setTable(table.id);
    setShowTablePicker(false);
  }

  return (
    <>
      {header}
      <UnderlineTabs
        tabs={(Object.keys(TYPE_LABEL) as OrderType[]).map((t) => ({ key: t, label: TYPE_LABEL[t] }))}
        value={cart.type}
        onChange={onSelectType}
        className="bg-card dark:bg-dark-card"
      />

      {isDineIn ? (
        <View className="flex-row gap-2 px-4 pt-3">
          <Pressable
            onPress={() => setShowTablePicker(true)}
            className="h-11 flex-1 flex-row items-center justify-between rounded-lg border border-border dark:border-dark-border bg-card dark:bg-dark-card px-3"
          >
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">โต๊ะ:</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">
                {selectedTable ? `โต๊ะ ${selectedTable.number}` : 'เลือกโต๊ะ'}
              </Text>
              <ChevronDown size={14} color="#707070" />
            </View>
          </Pressable>
          <View className="h-11 flex-row items-center gap-2 rounded-lg border border-border dark:border-dark-border bg-card dark:bg-dark-card px-3">
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ลูกค้า</Text>
            <Pressable onPress={() => cart.setGuestCount((cart.guestCount ?? 1) - 1)} hitSlop={8}>
              <Minus size={14} color="#707070" />
            </Pressable>
            <TextInput
              value={cart.guestCount ? String(cart.guestCount) : ''}
              onChangeText={(t) => cart.setGuestCount(parseInt(t.replace(/\D/g, ''), 10) || undefined)}
              keyboardType="number-pad"
              placeholder="-"
              placeholderTextColor="#A3A3A3"
              maxLength={2}
              className="w-7 p-0 text-center text-[13px] font-bold text-foreground dark:text-dark-foreground"
            />
            <Pressable onPress={() => cart.setGuestCount((cart.guestCount ?? 0) + 1)} hitSlop={8}>
              <Plus size={14} color="#707070" />
            </Pressable>
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">คน</Text>
          </View>
        </View>
      ) : null}

      {isDineIn && openOrder ? (
        <View className="mx-4 mt-2 rounded-lg bg-primary-50 dark:bg-dark-muted px-3.5 py-2.5">
          <Text className="text-[12px] text-foreground dark:text-dark-foreground">
            บิลเปิดอยู่ #{openOrder.orderNumber} · ส่งแล้ว {formatCurrency(openOrder.total)}
          </Text>
        </View>
      ) : null}

      <Text className="px-4 pb-1 pt-4 text-[11px] font-semibold tracking-wider text-muted-foreground dark:text-dark-muted-foreground">
        ORDER DETAILS
      </Text>
      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-4">
        {cart.items.length === 0 ? (
          <View className="items-center py-16 gap-2">
            <ShoppingBag size={28} color="#9CA3AF" />
            <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีสินค้าในตะกร้า</Text>
          </View>
        ) : (
          cart.items.map((item, idx) => {
            const key = itemKey(item);
            const img = resolveImageUrl(item.image);
            return (
              <View key={key} className="flex-row items-start gap-2.5 border-b border-border dark:border-dark-border py-3">
                <View className="mt-3 h-5 w-5 items-center justify-center rounded-full border border-border dark:border-dark-border">
                  <Text className="text-[10px] text-muted-foreground dark:text-dark-muted-foreground">{idx + 1}</Text>
                </View>
                <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-muted dark:bg-dark-muted">
                  {img ? (
                    <Image source={{ uri: img }} className="h-full w-full" resizeMode="cover" />
                  ) : (
                    <ImageIcon size={16} color={theme.faint} />
                  )}
                </View>
                <View className="flex-1 gap-1.5">
                  <View className="flex-row items-start justify-between gap-2">
                    <Text className="flex-1 text-[13px] font-semibold text-foreground dark:text-dark-foreground">
                      {item.quantity}x {item.name}
                    </Text>
                    <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </Text>
                  </View>
                  {item.variants && item.variants.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1">
                      {item.variants.map((v) => (
                        <View key={v.name} className="rounded-full bg-muted dark:bg-dark-muted px-2 py-0.5">
                          <Text className="text-[10.5px] text-muted-foreground dark:text-dark-muted-foreground">
                            {v.name.includes(': ') ? v.name.split(': ').slice(1).join(': ') : v.name}
                            {v.priceDelta ? ` ${v.priceDelta > 0 ? '+' : '-'}฿${Math.abs(v.priceDelta)}` : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {item.notes ? (
                    <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{item.notes}</Text>
                  ) : null}
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => cart.updateQty(key, item.quantity - 1)}
                      hitSlop={6}
                      className="h-8 w-8 items-center justify-center rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card"
                    >
                      <Minus size={16} color="#707070" />
                    </Pressable>
                    <Pressable
                      onPress={() => cart.updateQty(key, item.quantity + 1)}
                      hitSlop={6}
                      className="h-8 w-8 items-center justify-center rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card"
                    >
                      <Plus size={16} color="#707070" />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View className="border-t border-border dark:border-dark-border bg-muted/40 dark:bg-dark-card p-4 gap-3">
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setShowMember(true)}
            className={`h-10 flex-1 flex-row items-center gap-1.5 rounded-lg border px-2.5 ${cart.customer ? 'border-primary bg-primary-50 dark:bg-dark-muted' : 'border-border bg-card dark:border-dark-border dark:bg-dark-card'}`}
          >
            <UserRound size={14} color={cart.customer ? '#D25E3B' : '#707070'} />
            <Text numberOfLines={1} className={`flex-1 text-[12px] ${cart.customer ? 'font-semibold text-foreground dark:text-dark-foreground' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>
              {cart.customer ? `${cart.customer.name} · ${cart.customer.points.toLocaleString()} แต้ม` : 'สมาชิก'}
            </Text>
            <ChevronDown size={14} color="#707070" />
          </Pressable>
          <Pressable
            onPress={() => setShowDiscount(true)}
            className={`h-10 flex-1 flex-row items-center gap-1.5 rounded-lg border px-2.5 ${discounts.manual + discounts.promo > 0 ? 'border-primary bg-primary-50 dark:bg-dark-muted' : 'border-border bg-card dark:border-dark-border dark:bg-dark-card'}`}
          >
            <Tag size={14} color={discounts.manual + discounts.promo > 0 ? '#D25E3B' : '#707070'} />
            <Text numberOfLines={1} className={`flex-1 text-[12px] ${discounts.manual + discounts.promo > 0 ? 'font-semibold text-foreground dark:text-dark-foreground' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>
              {discounts.manual + discounts.promo > 0 ? `ส่วนลด −${formatCurrency(discounts.manual + discounts.promo)}` : 'ส่วนลด'}
            </Text>
            <ChevronDown size={14} color="#707070" />
          </Pressable>
        </View>

        <View className="gap-1">
          <View className="flex-row justify-between">
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
              ยอดรวมย่อย{openOrder ? ' (รวมที่ส่งแล้ว)' : ''}
            </Text>
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{formatCurrency(baseSubtotal)}</Text>
          </View>
          {discounts.manual > 0 ? (
            <SummaryRow label={`ส่วนลด${cart.manualDiscount?.mode === 'PERCENT' ? ` ${cart.manualDiscount.value}%` : ''}`} value={`−${formatCurrency(discounts.manual)}`} accent />
          ) : null}
          {discounts.promo > 0 && appliedPromo ? <SummaryRow label={appliedPromo.name} value={`−${formatCurrency(discounts.promo)}`} accent /> : null}
          {cart.redemption ? (
            <SummaryRow
              label={`รางวัล: ${cart.redemption.rewardName}`}
              value={cart.redemption.kind === 'DISCOUNT' ? `−${formatCurrency(discounts.reward)}` : 'ของแถม'}
              accent
            />
          ) : null}
          {discounts.stamp > 0 ? <SummaryRow label={`รางวัลดวง: ${stampRewardName}`} value={`−${formatCurrency(discounts.stamp)}`} accent /> : null}
          {discounts.points > 0 ? <SummaryRow label={`ใช้แต้ม ${discounts.points.toLocaleString()}`} value={`−${formatCurrency(discounts.pointsAmount)}`} accent /> : null}
          {store && totals && totals.serviceCharge > 0 ? (
            <SummaryRow label={`ค่าบริการ ${store.serviceCharge}%`} value={formatCurrency(totals.serviceCharge)} />
          ) : null}
          {store && totals ? (
            <SummaryRow label={`VAT ${store.taxRate}%${store.priceIncludesTax ? ' (รวมแล้ว)' : ''}`} value={formatCurrency(totals.tax)} />
          ) : null}
          <View className="flex-row items-baseline justify-between pt-1.5">
            <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">ยอดสุทธิ</Text>
            <Text className="text-[22px] font-bold text-foreground dark:text-dark-foreground">
              {formatCurrency(totals ? totals.total : Math.max(0, baseSubtotal - discounts.total))}
            </Text>
          </View>
        </View>

        {isDineIn ? (
          !cart.tableId ? (
            <View className="h-12 items-center justify-center rounded-lg bg-muted dark:bg-dark-muted">
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">กรุณาเลือกโต๊ะก่อน</Text>
            </View>
          ) : hasUnsent ? (
            // Two ways forward: fire the order to the kitchen and keep the bill open (restaurant flow),
            // or send + pay straight away (café / pay-at-counter flow).
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => send.mutate()}
                disabled={send.isPending}
                className="h-12 flex-1 items-center justify-center rounded-lg border border-primary bg-card dark:bg-dark-card"
              >
                <Text className="text-[15px] font-semibold text-primary">{send.isPending ? 'กำลังส่ง…' : 'ส่งเข้าครัว'}</Text>
              </Pressable>
              <Pressable
                onPress={onSendAndPay}
                disabled={send.isPending}
                className="h-12 flex-1 items-center justify-center rounded-lg bg-primary"
              >
                <Text className="text-[15px] font-semibold text-white">ชำระเงิน</Text>
              </Pressable>
            </View>
          ) : openOpStillQueued && !cart.openOrderId ? (
            <View className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-muted dark:bg-dark-muted">
              <WifiOff size={14} color="#707070" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">บิลรอซิงค์ — ชำระได้เมื่อออนไลน์</Text>
            </View>
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

      <TablePickerModal visible={showTablePicker} onClose={() => setShowTablePicker(false)} onSelect={onSelectTable} />
      <DiscountSheet visible={showDiscount} onClose={() => setShowDiscount(false)} order={openOrder} />
      <MemberSheet visible={showMember} onClose={() => setShowMember(false)} order={openOrder} />
    </>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View className="flex-row justify-between gap-2">
      <Text numberOfLines={1} className={`flex-1 text-[12px] ${accent ? 'text-primary dark:text-primary-400' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>
        {label}
      </Text>
      <Text className={`text-[12px] ${accent ? 'font-semibold text-primary dark:text-primary-400' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>{value}</Text>
    </View>
  );
}
