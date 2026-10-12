import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, TextInput, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { X, Banknote, QrCode, ScanLine, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useCartPricing } from '@/hooks/useCartPricing';
import { useCart } from '@/stores/cart.store';
import { uuid } from '@/lib/uuid';
import QRCode from 'react-native-qrcode-svg';
import { Button } from '@/components/Button';
import { generatePromptPayPayload } from '@/lib/promptpay';
import { useOfflineQueue } from '@/stores/offlineQueue.store';
import { useStoreConfig } from '@/stores/storeConfig.store';
import { QrSlipScanner } from '@/components/QrSlipScanner';
import { toOrderItem, type CartItem } from '@/stores/cart.store';
import type { Order, OrderType } from '@/types/pos';

interface SlipVerifyResult {
  ok: boolean;
  reason?: string;
  transRef?: string;
  amount?: number;
  senderName?: string;
  raw?: string;
}

/** Server's echo of a redeemed reward code (see api checkout-discounts.ts appliedRewardView). */
export interface AppliedReward {
  code: string;
  name: string;
  kind: 'DISCOUNT' | 'FREE_ITEM';
  discountApplied: number;
}

export type PaymentMode =
  | { kind: 'settle'; orderId: string }
  | { kind: 'new'; type: OrderType; tableId?: string; guestCount?: number; items: CartItem[] };

interface PaymentModalProps {
  visible: boolean;
  mode: PaymentMode | null;
  onClose: () => void;
  onSuccess: (order: { id: string; orderNumber: string; total: string; discount?: string; pointsEarned?: number | null; pointsRedeemed?: number | null; stampsEarned?: number | null; stampsRedeemed?: number | null; appliedReward?: AppliedReward | null }) => void;
  /** Payment couldn't reach the server and was queued for later — no order
   * data to show yet, so the caller should skip the receipt/success screen. */
  onQueuedOffline: () => void;
}

type Tab = 'CASH' | 'PROMPTPAY' | 'TRANSFER';

const QUICK_AMOUNTS = [100, 500, 1000];

export function PaymentModal({ visible, mode, onClose, onSuccess, onQueuedOffline }: PaymentModalProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('CASH');
  const [received, setReceived] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [intent, setIntent] = useState<{ id: string; qrImageUrl: string; status: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [slipVerifying, setSlipVerifying] = useState(false);
  const [slipResult, setSlipResult] = useState<SlipVerifyResult | null>(null);

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

  const { data: slip2goConfig } = useQuery({
    queryKey: ['slip2go-config'],
    queryFn: async () => (await api.get('/payments/slip2go-config')).data as { slip2goEnabled: boolean },
    enabled: visible,
  });

  // One shared pricing path with the cart panel (discount / promotion / points / reward code), so the
  // amount quoted here equals what the server computes and enforces ("เงินไม่พอ" otherwise).
  const pricing = useCartPricing(isSettle ? order : null);
  const { discounts, adjustmentFields } = pricing;
  const redemption = useCart((s) => s.redemption);
  const manualDiscount = useCart((s) => s.manualDiscount);
  const amountDue = useMemo(() => {
    if (mode?.kind === 'settle' && !order) return null;
    if (!mode) return null;
    return pricing.totals ? pricing.totals.total : null;
  }, [mode, order, pricing.totals]);

  // PromptPay has two modes (same split as the web POS): Stripe-generated QR that confirms itself,
  // or — when the store has no Stripe but has a PromptPay ID — a direct-to-account QR that the
  // cashier confirms by eye (optionally backed by a scanned bank slip).
  const stripeEnabled = !!paymentsConfig?.stripeEnabled;
  const directPromptPayId = !stripeEnabled ? (store?.promptpayId ?? '').trim() : '';
  const promptPayAvailable = stripeEnabled || !!directPromptPayId;
  const directQr = useMemo(() => {
    if (!directPromptPayId || amountDue == null || amountDue <= 0) return { payload: null as string | null, error: null as string | null };
    try {
      return { payload: generatePromptPayPayload(directPromptPayId, amountDue), error: null };
    } catch (e) {
      return { payload: null, error: e instanceof Error ? e.message : 'สร้าง QR ไม่สำเร็จ' };
    }
  }, [directPromptPayId, amountDue]);

  const receivedNum = parseFloat(received) || 0;
  const change = amountDue != null ? Math.max(0, receivedNum - amountDue) : 0;
  const canPayCash = amountDue != null && receivedNum + 0.001 >= amountDue;

  function reset() {
    setTab('CASH');
    setReceived('');
    setIntent(null);
    setSlipResult(null);
    setSlipVerifying(false);
    setScannerVisible(false);
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

  async function onSlipScanned(qrData: string) {
    setScannerVisible(false);
    setSlipVerifying(true);
    setSlipResult(null);
    try {
      const { data } = await api.post('/payments/verify-slip-qr', {
        qrCode: qrData,
        expectedAmount: amountDue ?? undefined,
      });
      setSlipResult(data);
    } catch (err) {
      setSlipResult({
        ok: false,
        reason: isAxiosError(err) ? err.response?.data?.error ?? 'ตรวจสอบสลิปไม่สำเร็จ' : 'ตรวจสอบสลิปไม่สำเร็จ',
      });
    } finally {
      setSlipVerifying(false);
    }
  }

  async function submit(
    payments: {
      method: string;
      amount: number;
      reference?: string;
      slipVerified?: boolean;
      slipTransRef?: string;
      slipPayload?: string;
    }[]
  ) {
    if (!mode) return;
    setSubmitting(true);
    const idempotencyKey = uuid();
    const payload =
      mode.kind === 'settle'
        ? { payments, ...adjustmentFields, ...(manualDiscount?.reason ? { notes: `ส่วนลด: ${manualDiscount.reason}` } : {}) }
        : {
            type: mode.type,
            tableId: mode.tableId,
            ...(mode.guestCount ? { guestCount: mode.guestCount } : {}),
            items: mode.items.map(toOrderItem),
            payments,
            ...adjustmentFields,
            ...(manualDiscount?.reason ? { notes: `ส่วนลด: ${manualDiscount.reason}` } : {}),
          };

    function queueOffline() {
      if (mode!.kind === 'settle') useOfflineQueue.getState().enqueueSettle(mode!.orderId, payload);
      else useOfflineQueue.getState().enqueueOrder(payload, idempotencyKey);
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

      let result: { id: string; orderNumber: string; total: string; discount?: string; pointsEarned?: number | null; pointsRedeemed?: number | null; stampsEarned?: number | null; stampsRedeemed?: number | null; appliedReward?: AppliedReward | null };
      if (mode.kind === 'settle') {
        result = (await api.post(`/orders/${mode.orderId}/settle`, payload, { headers: { 'Idempotency-Key': idempotencyKey } })).data;
      } else {
        result = (await api.post('/orders', payload, { headers: { 'Idempotency-Key': idempotencyKey } })).data;
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
          {discounts.total > 0 ? (
            <Text className="mt-1 text-[12px] font-medium text-primary dark:text-primary-400">
              รวมส่วนลด −{formatCurrency(discounts.total)}
              {discounts.stamp > 0 ? ` (รางวัลดวง −${formatCurrency(discounts.stamp)})` : ''}
              {discounts.points > 0 ? ` (ใช้ ${discounts.points.toLocaleString()} แต้ม)` : ''}
            </Text>
          ) : null}
          {redemption?.kind === 'FREE_ITEM' ? (
            <Text className="mt-1 text-[12px] font-medium text-primary dark:text-primary-400">มอบของรางวัล: {redemption.rewardName}</Text>
          ) : null}
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
              if (stripeEnabled && !intent) startPromptPay();
            }}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${tab === 'PROMPTPAY' ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'} ${!promptPayAvailable ? 'opacity-40' : ''}`}
          >
            <QrCode size={16} color={tab === 'PROMPTPAY' ? '#FFFFFF' : '#6B7280'} />
            <Text className={`text-[13px] font-semibold ${tab === 'PROMPTPAY' ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>พร้อมเพย์</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('TRANSFER')}
            disabled={!slip2goConfig?.slip2goEnabled}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${tab === 'TRANSFER' ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'} ${!slip2goConfig?.slip2goEnabled ? 'opacity-40' : ''}`}
          >
            <ScanLine size={16} color={tab === 'TRANSFER' ? '#FFFFFF' : '#6B7280'} />
            <Text className={`text-[13px] font-semibold ${tab === 'TRANSFER' ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>โอนเงิน</Text>
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
          ) : tab === 'PROMPTPAY' ? (
            <View className="items-center gap-4">
              {!stripeEnabled && !directPromptPayId ? (
                <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground text-center mt-8">
                  ยังไม่ได้ตั้งค่าพร้อมเพย์ — ไปที่ ตั้งค่า › การชำระเงิน แล้วใส่เลขพร้อมเพย์ของร้าน
                </Text>
              ) : !stripeEnabled ? (
                directQr.error ? (
                  <View className="w-full flex-row items-start gap-1.5 rounded-lg bg-danger/10 p-3">
                    <AlertTriangle size={16} color="#B91C1C" />
                    <Text className="flex-1 text-[13px] text-danger">{directQr.error}</Text>
                  </View>
                ) : directQr.payload ? (
                  <>
                    <View className="rounded-xl border border-border bg-white p-3 dark:border-dark-border">
                      <QRCode value={directQr.payload} size={220} />
                    </View>
                    <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground text-center">
                      ให้ลูกค้าสแกนจ่ายตามยอด แล้วกด "ยืนยันรับเงิน" เมื่อเงินเข้าแล้ว
                    </Text>
                    {slip2goConfig?.slip2goEnabled ? (
                      <Pressable onPress={() => setScannerVisible(true)} className="flex-row items-center gap-1.5 rounded-lg border border-primary px-4 py-2.5">
                        <ScanLine size={16} color="#D25E3B" />
                        <Text className="text-[13px] font-semibold text-primary">สแกนสลิปเพื่อตรวจสอบ (ไม่บังคับ)</Text>
                      </Pressable>
                    ) : null}
                    {slipVerifying ? (
                      <View className="flex-row items-center gap-1.5">
                        <ActivityIndicator size="small" color="#D25E3B" />
                        <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">กำลังตรวจสอบสลิป…</Text>
                      </View>
                    ) : null}
                    {slipResult && !slipVerifying ? (
                      <View className={`w-full flex-row items-start gap-1.5 rounded-lg p-3 ${slipResult.ok ? 'bg-success/10' : 'bg-warning/10'}`}>
                        {slipResult.ok ? <CheckCircle2 size={16} color="#16A34A" /> : <AlertTriangle size={16} color="#CA8A04" />}
                        <Text className={`flex-1 text-[13px] ${slipResult.ok ? 'text-success' : 'text-warning'}`}>
                          {slipResult.ok
                            ? `ตรวจสอบสลิปผ่าน${slipResult.amount != null ? ` · ${formatCurrency(slipResult.amount)}` : ''}${slipResult.senderName ? ` · ${slipResult.senderName}` : ''}`
                            : slipResult.reason || 'ตรวจสอบสลิปไม่ผ่าน'}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <ActivityIndicator color="#D25E3B" />
                )
              ) : intent ? (
                <>
                  <Image source={{ uri: intent.qrImageUrl }} style={{ width: 220, height: 220 }} resizeMode="contain" />
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#D25E3B" />
                    <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">รอลูกค้าสแกนจ่าย…</Text>
                  </View>
                  <Pressable onPress={cancelPromptPay}>
                    <Text className="text-[13px] text-danger">ยกเลิก</Text>
                  </Pressable>
                </>
              ) : (
                <ActivityIndicator color="#D25E3B" />
              )}
            </View>
          ) : (
            <View className="items-center gap-4 pt-4">
              <Pressable
                onPress={() => setScannerVisible(true)}
                className="h-12 w-full flex-row items-center justify-center gap-2 rounded-lg bg-primary"
              >
                <ScanLine size={18} color="#FFFFFF" />
                <Text className="text-[14px] font-semibold text-white">สแกน QR บนสลิปโอนเงิน</Text>
              </Pressable>

              {slipVerifying ? (
                <View className="flex-row items-center gap-1.5">
                  <ActivityIndicator size="small" color="#D25E3B" />
                  <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">กำลังตรวจสอบสลิป…</Text>
                </View>
              ) : null}

              {slipResult && !slipVerifying ? (
                <View
                  className={`w-full flex-row items-start gap-1.5 rounded-lg p-3 ${
                    slipResult.ok ? 'bg-success/10' : 'bg-warning/10'
                  }`}
                >
                  {slipResult.ok ? (
                    <CheckCircle2 size={16} color="#16A34A" />
                  ) : (
                    <AlertTriangle size={16} color="#CA8A04" />
                  )}
                  <Text className={`flex-1 text-[13px] ${slipResult.ok ? 'text-success' : 'text-warning'}`}>
                    {slipResult.ok
                      ? `ตรวจสอบสลิปผ่าน${slipResult.amount != null ? ` · ${formatCurrency(slipResult.amount)}` : ''}${slipResult.senderName ? ` · ${slipResult.senderName}` : ''}`
                      : slipResult.reason || 'ตรวจสอบสลิปไม่ผ่าน'}
                  </Text>
                </View>
              ) : null}
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
        ) : tab === 'PROMPTPAY' && !stripeEnabled && directPromptPayId ? (
          <View className="p-4">
            <Button
              label="ยืนยันรับเงิน"
              onPress={() =>
                amountDue != null &&
                submit([
                  {
                    method: 'PROMPTPAY',
                    amount: amountDue,
                    reference: slipResult?.transRef,
                    slipVerified: slipResult?.ok,
                    slipTransRef: slipResult?.transRef,
                    slipPayload: slipResult?.raw,
                  },
                ])
              }
              disabled={amountDue == null || !directQr.payload}
              loading={submitting}
            />
          </View>
        ) : tab === 'TRANSFER' ? (
          <View className="p-4">
            <Button
              label="ยืนยันรับเงิน"
              onPress={() =>
                amountDue != null &&
                submit([
                  {
                    method: 'BANK_TRANSFER',
                    amount: amountDue,
                    reference: slipResult?.transRef,
                    slipVerified: slipResult?.ok,
                    slipTransRef: slipResult?.transRef,
                    slipPayload: slipResult?.raw,
                  },
                ])
              }
              disabled={amountDue == null}
              loading={submitting}
            />
          </View>
        ) : null}

        <QrSlipScanner visible={scannerVisible} onClose={() => setScannerVisible(false)} onScanned={onSlipScanned} />
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
