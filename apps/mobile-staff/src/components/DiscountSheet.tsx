import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, View, Text, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { X, Tag, CheckCircle2 } from 'lucide-react-native';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { useCart } from '@/stores/cart.store';
import { useCartPricing } from '@/hooks/useCartPricing';
import { manualDiscountAmount, type ManualDiscount } from '@/lib/pricing';
import { formatCurrency } from '@/lib/format';
import type { Order } from '@/types/pos';
import { useThemeColors } from '@/lib/theme';

interface DiscountSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Running bill (dine-in tab) so the discount cap includes what was already sent. */
  order?: Order | null;
}

type Tab = 'PROMO' | 'MANUAL';

/** Bottom sheet: pick an active promotion, or key in a manual discount (฿ or %) with a reason. */
export function DiscountSheet({ visible, onClose, order }: DiscountSheetProps) {
  const theme = useThemeColors();
  const manualDiscount = useCart((s) => s.manualDiscount);
  const promotion = useCart((s) => s.promotion);
  const setManualDiscount = useCart((s) => s.setManualDiscount);
  const setPromotion = useCart((s) => s.setPromotion);
  const { baseSubtotal, evaluations } = useCartPricing(order);

  const [tab, setTab] = useState<Tab>('PROMO');
  const [mode, setMode] = useState<ManualDiscount['mode']>('AMOUNT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  // The cart stays mounted, so promotions added/edited on the web would otherwise stay stale until a restart.
  const qc = useQueryClient();
  useEffect(() => {
    if (visible) qc.invalidateQueries({ queryKey: ['promotions'] });
  }, [visible, qc]);

  useEffect(() => {
    if (!visible) return;
    setTab('PROMO');
    setMode(manualDiscount?.mode ?? 'AMOUNT');
    setValue(manualDiscount ? String(manualDiscount.value) : '');
    setReason(manualDiscount?.reason ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const numeric = parseFloat(value) || 0;
  const cap = mode === 'PERCENT' ? 100 : baseSubtotal;
  const overCap = numeric > cap;
  const preview = manualDiscountAmount({ mode, value: numeric, reason }, baseSubtotal);
  const canApply = numeric > 0 && !overCap && reason.trim().length > 0 && baseSubtotal > 0;

  function applyManual() {
    if (!canApply) return;
    setManualDiscount({ mode, value: numeric, reason: reason.trim() });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
          <Pressable className="max-h-[85%] rounded-t-[14px] bg-card dark:bg-dark-card" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between px-5 pb-1 pt-4">
              <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ส่วนลด</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <X size={22} color={theme.faint} />
              </Pressable>
            </View>
            <UnderlineTabs
              tabs={[{ key: 'PROMO', label: 'โปรโมชัน' }, { key: 'MANUAL', label: 'ส่วนลดพิเศษ' }]}
              value={tab}
              onChange={setTab}
            />

            {tab === 'PROMO' ? (
              <ScrollView contentContainerClassName="gap-2 p-4" keyboardShouldPersistTaps="handled">
                {evaluations.length === 0 ? (
                  <Text className="py-8 text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">
                    ไม่มีโปรโมชันที่ใช้งานอยู่
                  </Text>
                ) : null}
                {evaluations.map((ev) => {
                  const p = ev.promotion;
                  const live = ev;
                  const applied = promotion?.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      disabled={!live.eligible && !applied}
                      onPress={() => {
                        if (applied) setPromotion(undefined);
                        else setPromotion({ id: p.id, name: live.label, amount: live.discount });
                        if (!applied) onClose();
                      }}
                      className={`flex-row items-center gap-3 rounded-[10px] border p-3 ${
                        applied ? 'border-primary bg-primary-50 dark:bg-dark-muted' : 'border-border bg-card dark:border-dark-border dark:bg-dark-card'
                      } ${!live.eligible && !applied ? 'opacity-60' : ''}`}
                    >
                      <Tag size={18} color={live.eligible || applied ? '#D25E3B' : '#A3A3A3'} />
                      <View className="flex-1 gap-0.5">
                        <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{live.label}</Text>
                        {live.eligible ? (
                          <Text className="text-[12px] font-semibold text-primary">ลด {formatCurrency(live.discount)}</Text>
                        ) : (
                          <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{live.why}</Text>
                        )}
                      </View>
                      {applied ? <CheckCircle2 size={18} color="#D25E3B" /> : null}
                    </Pressable>
                  );
                })}
                {promotion ? (
                  <Pressable
                    onPress={() => setPromotion(undefined)}
                    className="mt-1 h-11 items-center justify-center rounded-lg border border-danger"
                  >
                    <Text className="text-[13px] font-semibold text-danger dark:text-dark-danger">ยกเลิกโปรโมชันที่ใช้อยู่</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            ) : (
              <ScrollView contentContainerClassName="gap-3 p-4" keyboardShouldPersistTaps="handled">
                <View className="flex-row overflow-hidden rounded-lg border border-border dark:border-dark-border">
                  {(['AMOUNT', 'PERCENT'] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setMode(m)}
                      className={`h-10 flex-1 items-center justify-center ${mode === m ? 'bg-primary' : 'bg-card dark:bg-dark-card'}`}
                    >
                      <Text className={`text-[13px] font-semibold ${mode === m ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
                        {m === 'AMOUNT' ? 'จำนวนเงิน ฿' : 'เปอร์เซ็นต์ %'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View>
                  <TextInput
                    value={value}
                    onChangeText={(t) => setValue(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder={mode === 'PERCENT' ? 'เช่น 10' : 'เช่น 50'}
                    placeholderTextColor={theme.placeholder}
                    className="h-12 rounded-lg border border-border bg-background px-3 text-[18px] font-bold text-foreground dark:border-dark-border dark:bg-dark-input dark:text-dark-foreground"
                  />
                  <Text className={`mt-1 text-[11px] ${overCap ? 'text-danger dark:text-dark-danger' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>
                    {overCap
                      ? mode === 'PERCENT' ? 'ไม่เกิน 100%' : `ไม่เกินยอดรวมย่อย ${formatCurrency(baseSubtotal)}`
                      : mode === 'PERCENT' ? 'สูงสุด 100%' : `สูงสุด ${formatCurrency(baseSubtotal)} (ยอดรวมย่อย)`}
                  </Text>
                </View>
                {mode === 'PERCENT' ? (
                  <View className="flex-row gap-2">
                    {[5, 10, 15, 20].map((n) => (
                      <Pressable key={n} onPress={() => setValue(String(n))} className="h-9 flex-1 items-center justify-center rounded-lg bg-muted dark:bg-dark-muted">
                        <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">{n}%</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="เหตุผล (จำเป็น) เช่น ลูกค้าประจำ, ชดเชยรอนาน"
                  placeholderTextColor={theme.placeholder}
                  className="h-11 rounded-lg border border-border bg-background px-3 text-[14px] text-foreground dark:border-dark-border dark:bg-dark-input dark:text-dark-foreground"
                />
                {preview > 0 ? (
                  <Text className="text-[13px] font-semibold text-primary">ลด {formatCurrency(preview)}</Text>
                ) : null}
                <Pressable
                  onPress={applyManual}
                  disabled={!canApply}
                  className={`h-12 items-center justify-center rounded-lg bg-primary ${!canApply ? 'opacity-50' : ''}`}
                >
                  <Text className="text-[15px] font-semibold text-white">ใช้ส่วนลด</Text>
                </Pressable>
                {manualDiscount ? (
                  <Pressable
                    onPress={() => {
                      setManualDiscount(undefined);
                      onClose();
                    }}
                    className="h-11 items-center justify-center rounded-lg border border-danger"
                  >
                    <Text className="text-[13px] font-semibold text-danger dark:text-dark-danger">ลบส่วนลดพิเศษ</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
