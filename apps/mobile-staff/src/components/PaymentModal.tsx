import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, TextInput, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { X, Banknote, QrCode } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { computeTotals } from '@/lib/pricing';
import { Button } from '@/components/Button';
import { useOfflineQueue } from '@/stores/offlineQueue.store';
import { useStoreConfig } from '@/stores/storeConfig.store';
import type { CartItem } from '@/stores/cart.store';
import type { Order, OrderType } from '@/types/pos';

export type PaymentMode =
  | { kind: 'settle'; orderId: string }
  | { kind: 'new'; type: OrderType; tableId?: string; items: CartItem[] };

interface PaymentModalProps {
  visible: boolean;
  mode: PaymentMode | null;
  onClose: () => void;
  onSuccess: (order: { id: string; orderNumber: string; total: string }) => void;
  /** Payment couldn't reach the server and was queued for later — no order
   * data to show yet, so the caller should skip the receipt/success screen. */
  onQueuedOffline: () => void;
}

type Tab = 'CASH' | 'PROMPTPAY';

const QUICK_AMOUNTS = [100, 500, 1000];

export function PaymentModal({ visible, mode, onClose, onSuccess, onQueuedOffline }: PaymentModalProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('CASH');
  const [received, setReceived] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [intent, setIntent] = useState<{ id: string; qrImageUrl: string; status: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSettle = mode?.kind === 'settle';
  const settleOrderId = mode?.kind === 'settle' ? mode.orderId : undefined;

  const { data: order } = useQuery({
    queryKey: ['orders', settleOrderId],
    queryFn: async () => (await api.get(`/orders/${settleOrderId}`)).data as Order,
    enabled: visible && !!settleOrderId,
  });

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data,
    enabled: visible && !isSettle,
  });

  const cachedStoreConfig = useStoreConfig((s) => s.config);
  useEffect(() => {
    if (store) {
      useStoreConfig.getState().setConfig({
        taxRate: store.taxRate,
        serviceCharge: store.serviceCharge,
        priceIncludesTax: store.priceIncludesTax,
      });
    }
  }, [store]);

  const { data: paymentsConfig } = useQuery({
    queryKey: ['payments-config'],
    queryFn: async () => (await api.get('/payments/config')).data as { stripeEnabled: boolean },
    enabled: visible,
  });

  const amountDue = useMemo(() => {
    if (mode?.kind === 'settle') return order ? Number(order.total) : null;
    if (mode?.kind === 'new') {
      // Fall back to the last-known tax config when offline from launch (no
      // live /stores/me response yet) — see storeConfig.store.
      const taxConfig = store ?? cachedStoreConfig;
      if (!taxConfig) return null;
      const subtotal = mode.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      return computeTotals(subtotal, taxConfig).total;
    }
    return null;
  }, [mode, order, store, cachedStoreConfig]);

  const receivedNum = parseFloat(received) || 0;
  const change = amountDue != null ? Math.max(0, receivedNum - amountDue) : 0;
  const canPayCash = amountDue != null && receivedNum + 0.001 >= amountDue;

  function reset() {
    setTab('CASH');
    setReceived('');
    setIntent(null);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startPromptPay() {
    if (amountDue == null) return;
    try {
      const res = await api.post('/payments/promptpay/intent', {
        amount: amountDue,
        orderRef: mode?.kind === 'new' ? mode.tableId : undefined,
      });
      const data = res.data as { paymentIntentId: string; qrImageUrl: string };
      setIntent({ id: data.paymentIntentId, qrImageUrl: data.qrImageUrl, status: 'pending' });
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.get(`/payments/promptpay/status/${data.paymentIntentId}`);
          if (status.data.paid) {
            if (pollRef.current) clearInterval(pollRef.current);
            await submit([{ method: 'PROMPTPAY', amount: amountDue, reference: data.paymentIntentId }]);
          }
        } catch {
          // transient poll failure — keep trying until the interval is cleared
        }
      }, 3000);
    } catch (err) {
      Alert.alert('สร้าง QR ไม่สำเร็จ', isAxiosError(err) ? err.response?.data?.error ?? 'ลองใหม่อีกครั้ง' : 'ลองใหม่อีกครั้ง');
    }
  }

  async function cancelPromptPay() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (intent) {
      try {
        await api.post(`/payments/promptpay/cancel/${intent.id}`);
      } catch {
        // best-effort cancel
      }
    }
    setIntent(null);
  }

  async function submit(payments: { method: string; amount: number; reference?: string }[]) {
    if (!mode) return;
    setSubmitting(true);
    const payload =
      mode.kind === 'settle'
        ? { payments }
        : {
            type: mode.type,
            tableId: mode.tableId,
            items: mode.items.map((i) => ({ productId: i.productId, quantity: i.quantity, notes: i.notes })),
            payments,
          };

    function queueOffline() {
      if (mode!.kind === 'settle') useOfflineQueue.getState().enqueueSettle(mode!.orderId, payload);
      else useOfflineQueue.getState().enqueueOrder(payload);
      onQueuedOffline();
    }

    try {
      // Skip the request entirely when there's clearly no network — no point
      // waiting out a 15s timeout to learn what we already know.
      const net = await NetInfo.fetch();
      if (net.isConnected === false) {
        queueOffline();
        return;
      }

      let result: { id: string; orderNumber: string; total: string };
      if (mode.kind === 'settle') {
        result = (await api.post(`/orders/${mode.orderId}/settle`, payload)).data;
      } else {
        result = (await api.post('/orders', payload)).data;
      }
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['kds-orders'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      onSuccess(result);
    } catch (err) {
      // The device thought it was online but the request never got a
      // response (server unreachable, dropped connection, etc.) — queue it
      // rather than lose the sale.
      if (isAxiosError(err) && !err.response) {
        queueOffline();
        return;
      }
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'ชำระเงินไม่สำเร็จ' : 'ชำระเงินไม่สำเร็จ';
      Alert.alert('ชำระเงินไม่สำเร็จ', message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-dark-border">
          <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ชำระเงิน</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={22} color="#9CA3AF" />
          </Pressable>
        </View>

        <View className="items-center py-6">
          <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยอดที่ต้องชำระ</Text>
          <Text className="text-metric-lg text-foreground dark:text-dark-foreground">
            {amountDue != null ? formatCurrency(amountDue) : '—'}
          </Text>
        </View>

        <View className="flex-row gap-2 px-4">
          <Pressable
            onPress={() => setTab('CASH')}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${tab === 'CASH' ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'}`}
          >
            <Banknote size={16} color={tab === 'CASH' ? '#FFFFFF' : '#6B7280'} />
            <Text className={`text-[13px] font-semibold ${tab === 'CASH' ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>เงินสด</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setTab('PROMPTPAY');
              if (!intent) startPromptPay();
            }}
            disabled={!paymentsConfig?.stripeEnabled}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${tab === 'PROMPTPAY' ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'} ${!paymentsConfig?.stripeEnabled ? 'opacity-40' : ''}`}
          >
            <QrCode size={16} color={tab === 'PROMPTPAY' ? '#FFFFFF' : '#6B7280'} />
            <Text className={`text-[13px] font-semibold ${tab === 'PROMPTPAY' ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>พร้อมเพย์</Text>
          </Pressable>
        </View>

        <View className="flex-1 px-4 pt-6">
          {tab === 'CASH' ? (
            <View className="gap-4">
              <TextInput
                keyboardType="decimal-pad"
                value={received}
                onChangeText={setReceived}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                className="h-14 rounded-lg border border-border bg-input dark:border-dark-border dark:bg-dark-input px-4 text-[22px] font-bold text-foreground dark:text-dark-foreground"
              />
              <View className="flex-row gap-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <Pressable
                    key={amt}
                    onPress={() => setReceived(String(amt))}
                    className="flex-1 items-center rounded-lg bg-muted dark:bg-dark-muted py-2.5"
                  >
                    <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">฿{amt}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => amountDue != null && setReceived(String(amountDue))}
                  className="flex-1 items-center rounded-lg bg-muted dark:bg-dark-muted py-2.5"
                >
                  <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">พอดี</Text>
                </Pressable>
              </View>
              <View className="flex-row justify-between px-1">
                <Text className="text-[14px] text-muted-foreground dark:text-dark-muted-foreground">เงินทอน</Text>
                <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">{formatCurrency(change)}</Text>
              </View>
            </View>
          ) : (
            <View className="items-center gap-4">
              {!paymentsConfig?.stripeEnabled ? (
                <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground text-center mt-8">
                  พร้อมเพย์ยังไม่ได้ตั้งค่าในระบบร้านนี้
                </Text>
              ) : intent ? (
                <>
                  <Image source={{ uri: intent.qrImageUrl }} style={{ width: 220, height: 220 }} resizeMode="contain" />
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#C9622E" />
                    <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">รอลูกค้าสแกนจ่าย…</Text>
                  </View>
                  <Pressable onPress={cancelPromptPay}>
                    <Text className="text-[13px] text-danger">ยกเลิก</Text>
                  </Pressable>
                </>
              ) : (
                <ActivityIndicator color="#C9622E" />
              )}
            </View>
          )}
        </View>

        {tab === 'CASH' ? (
          <View className="p-4">
            <Button
              label="ยืนยันรับเงิน"
              onPress={() => amountDue != null && submit([{ method: 'CASH', amount: amountDue }])}
              disabled={!canPayCash}
              loading={submitting}
            />
          </View>
        ) : null}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
