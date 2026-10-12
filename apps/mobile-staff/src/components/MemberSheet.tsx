import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput, Switch, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { X, Search, UserRound, Gift, Sparkles, Stamp } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useCart } from '@/stores/cart.store';
import { useCartPricing } from '@/hooks/useCartPricing';
import { formatCurrency } from '@/lib/format';
import type { Order, PosCustomer, RewardRedemption } from '@/types/pos';
import { useThemeColors } from '@/lib/theme';

interface MemberSheetProps {
  visible: boolean;
  onClose: () => void;
  order?: Order | null;
}

const errMsg = (err: unknown, fallback: string) =>
  isAxiosError(err) ? (err.response?.data?.error as string | undefined) ?? fallback : fallback;

/** Bottom sheet: attach a member (phone/name search), burn points, and enter a reward code. */
export function MemberSheet({ visible, onClose, order }: MemberSheetProps) {
  const theme = useThemeColors();
  const customer = useCart((s) => s.customer);
  const pointsToRedeem = useCart((s) => s.pointsToRedeem);
  const redemption = useCart((s) => s.redemption);
  const setCustomer = useCart((s) => s.setCustomer);
  const setPointsToRedeem = useCart((s) => s.setPointsToRedeem);
  const setRedemption = useCart((s) => s.setRedemption);
  const setUseStampReward = useCart((s) => s.setUseStampReward);
  const { pointsEnabled, pointValue, minRedeemPoints, maxPoints, discounts, stampsEnabled, stampsPerReward, stampRewardValue, stampRewardName, stampRewardAvailable, stampRewardActive } = useCartPricing(order);

  const [q, setQ] = useState('');
  const [pointsText, setPointsText] = useState('');
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<RewardRedemption | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setCode('');
    setFound(null);
    setCodeError(null);
    setPointsText(pointsToRedeem > 0 ? String(pointsToRedeem) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const term = q.trim();
  const { data: results = [], isFetching } = useQuery({
    queryKey: ['customers', 'pos-search', term],
    queryFn: async () => (await api.get('/customers', { params: { q: term, limit: 20 } })).data as PosCustomer[],
    enabled: visible && term.length >= 2,
  });

  function attach(c: PosCustomer) {
    setCustomer({ id: c.id, name: c.name, phone: c.phone, points: c.points, stamps: c.stamps, tier: c.tier ?? null });
    setQ('');
  }

  function onPointsChange(t: string) {
    const n = Math.min(maxPoints, parseInt(t.replace(/\D/g, ''), 10) || 0);
    setPointsText(n > 0 ? String(n) : '');
    setPointsToRedeem(n);
  }

  async function lookup() {
    const c = code.trim().toUpperCase();
    if (c.length < 6) return;
    setLooking(true);
    setCodeError(null);
    setFound(null);
    try {
      setFound((await api.get(`/loyalty/redemptions/code/${encodeURIComponent(c)}`)).data as RewardRedemption);
    } catch (err) {
      setCodeError(errMsg(err, 'ตรวจสอบโค้ดไม่สำเร็จ'));
    } finally {
      setLooking(false);
    }
  }

  function useCode() {
    if (!found || found.status !== 'ACTIVE') return;
    setRedemption({
      id: found.id,
      code: found.code,
      rewardName: found.reward.name,
      kind: found.reward.kind,
      discountAmount: found.reward.discountAmount,
      customerId: found.customerId,
    });
    setFound(null);
    setCode('');
  }

  const pillColor = customer?.tier?.color ?? '#94A3B8';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
          <Pressable className="max-h-[88%] rounded-t-[14px] bg-card dark:bg-dark-card" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
              <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">สมาชิก & รางวัล</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <X size={22} color={theme.faint} />
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-1" keyboardShouldPersistTaps="handled">
              {customer ? (
                <View className="gap-2 rounded-[10px] border border-primary bg-primary-50 p-3 dark:bg-dark-muted">
                  <View className="flex-row items-center gap-2.5">
                    <UserRound size={20} color="#D25E3B" />
                    <View className="flex-1">
                      <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">{customer.name}</Text>
                      {customer.phone ? <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{customer.phone}</Text> : null}
                    </View>
                    {customer.tier ? (
                      <View style={{ backgroundColor: pillColor }} className="rounded-full px-2.5 py-0.5">
                        <Text className="text-[11px] font-bold text-white">{customer.tier.name}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-[12px] text-foreground dark:text-dark-foreground">
                    {customer.points.toLocaleString()} แต้ม · {customer.stamps} ดวง
                  </Text>
                  <Pressable
                    onPress={() => {
                      setCustomer(undefined);
                      setPointsText('');
                    }}
                    className="h-9 items-center justify-center rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card"
                  >
                    <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">ถอดสมาชิก</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="gap-2">
                  <View className="h-11 flex-row items-center gap-2 rounded-lg border border-border bg-background px-3 dark:border-dark-border dark:bg-dark-input">
                    <Search size={15} color={theme.faint} />
                    <TextInput
                      value={q}
                      onChangeText={setQ}
                      placeholder="ค้นหาสมาชิก (เบอร์โทร / ชื่อ)"
                      placeholderTextColor={theme.placeholder}
                      className="flex-1 text-[14px] text-foreground dark:text-dark-foreground"
                    />
                    {isFetching ? <ActivityIndicator size="small" color="#D25E3B" /> : null}
                  </View>
                  {term.length >= 2 && !isFetching && results.length === 0 ? (
                    <Text className="py-2 text-center text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ไม่พบสมาชิก</Text>
                  ) : null}
                  {results.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => attach(c)}
                      className="flex-row items-center gap-3 rounded-[10px] border border-border bg-card p-3 dark:border-dark-border dark:bg-dark-card"
                    >
                      <View className="flex-1">
                        <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{c.name}</Text>
                        <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                          {c.phone ?? '—'}{c.tier ? ` · ${c.tier.name}` : ''}
                        </Text>
                      </View>
                      <Text className="text-[12px] font-semibold text-primary">{c.points.toLocaleString()} แต้ม</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {customer && pointsEnabled ? (
                <View className="gap-2 rounded-[10px] border border-border p-3 dark:border-dark-border">
                  <View className="flex-row items-center gap-1.5">
                    <Sparkles size={14} color="#D25E3B" />
                    <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">ใช้แต้มเป็นส่วนลด</Text>
                  </View>
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                    1 แต้ม = {formatCurrency(pointValue)}
                    {minRedeemPoints > 0 ? ` · ขั้นต่ำ ${minRedeemPoints} แต้ม` : ''} · ใช้ได้สูงสุด {maxPoints.toLocaleString()} แต้ม
                  </Text>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={pointsText}
                      onChangeText={onPointsChange}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={theme.placeholder}
                      className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-right text-[15px] font-bold text-foreground dark:border-dark-border dark:bg-dark-input dark:text-dark-foreground"
                    />
                    <Pressable
                      onPress={() => onPointsChange(String(maxPoints))}
                      disabled={maxPoints <= 0}
                      className={`h-11 items-center justify-center rounded-lg border border-primary px-4 ${maxPoints <= 0 ? 'opacity-40' : ''}`}
                    >
                      <Text className="text-[13px] font-semibold text-primary">ใช้สูงสุด</Text>
                    </Pressable>
                  </View>
                  {pointsToRedeem > 0 && pointsToRedeem < minRedeemPoints ? (
                    <Text className="text-[11px] text-danger dark:text-dark-danger">ต้องใช้อย่างน้อย {minRedeemPoints} แต้ม</Text>
                  ) : null}
                  {discounts.points > 0 ? (
                    <Text className="text-[12px] font-semibold text-primary">
                      ลด {formatCurrency(discounts.pointsAmount)} · เหลือ {(customer.points - discounts.points).toLocaleString()} แต้ม
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {customer && stampsEnabled && stampsPerReward > 0 ? (
                <View className="gap-2 rounded-[10px] border border-border p-3 dark:border-dark-border">
                  <View className="flex-row items-center gap-1.5">
                    <Stamp size={14} color="#D25E3B" />
                    <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">บัตรสะสมดวง</Text>
                  </View>
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                    สะสม {customer.stamps}/{stampsPerReward} ดวง
                  </Text>
                  {stampRewardAvailable ? (
                    <Pressable
                      onPress={() => setUseStampReward(!stampRewardActive)}
                      className={`flex-row items-center gap-3 rounded-lg border p-3 ${stampRewardActive ? 'border-primary bg-primary-50 dark:bg-dark-muted' : 'border-border dark:border-dark-border'}`}
                    >
                      <View className="flex-1">
                        <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">ใช้รางวัลดวง</Text>
                        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                          {stampRewardName} · ลด {formatCurrency(stampRewardValue)} · ใช้ {stampsPerReward} ดวง
                        </Text>
                        {stampRewardActive ? (
                          <Text className="mt-0.5 text-[12px] font-semibold text-primary">
                            ลดจริง {formatCurrency(discounts.stamp)} · เหลือ {customer.stamps - stampsPerReward} ดวง
                          </Text>
                        ) : null}
                      </View>
                      <Switch
                        value={stampRewardActive}
                        onValueChange={setUseStampReward}
                        trackColor={{ true: '#D25E3B' }}
                      />
                    </Pressable>
                  ) : (
                    <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                      ต้องสะสมอีก {Math.max(0, stampsPerReward - customer.stamps)} ดวงจึงจะแลกรางวัลได้
                    </Text>
                  )}
                </View>
              ) : null}

              <View className="gap-2 rounded-[10px] border border-border p-3 dark:border-dark-border">
                <View className="flex-row items-center gap-1.5">
                  <Gift size={14} color="#D25E3B" />
                  <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">ใช้โค้ดรางวัล</Text>
                </View>
                {redemption ? (
                  <View className="gap-1 rounded-lg bg-primary-50 p-3 dark:bg-dark-muted">
                    <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">{redemption.rewardName}</Text>
                    <Text className="text-[12px] text-foreground dark:text-dark-foreground">
                      {redemption.kind === 'DISCOUNT'
                        ? `ส่วนลด ${formatCurrency(redemption.discountAmount)}`
                        : 'ของแถม — มอบของรางวัลให้ลูกค้า'} · โค้ด {redemption.code}
                    </Text>
                    <Pressable onPress={() => setRedemption(undefined)} className="mt-1 h-9 items-center justify-center rounded-lg border border-danger">
                      <Text className="text-[13px] font-semibold text-danger dark:text-dark-danger">ยกเลิกโค้ด</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View className="flex-row gap-2">
                      <TextInput
                        value={code}
                        onChangeText={(t) => {
                          setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                          setFound(null);
                          setCodeError(null);
                        }}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={6}
                        placeholder="โค้ด 6 ตัว"
                        placeholderTextColor={theme.placeholder}
                        className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-[15px] font-bold tracking-widest text-foreground dark:border-dark-border dark:bg-dark-input dark:text-dark-foreground"
                      />
                      <Pressable
                        onPress={lookup}
                        disabled={code.length < 6 || looking}
                        className={`h-11 items-center justify-center rounded-lg border border-primary px-4 ${code.length < 6 || looking ? 'opacity-40' : ''}`}
                      >
                        {looking ? <ActivityIndicator size="small" color="#D25E3B" /> : <Text className="text-[13px] font-semibold text-primary">ตรวจสอบ</Text>}
                      </Pressable>
                    </View>
                    {codeError ? <Text className="text-[12px] text-danger dark:text-dark-danger">{codeError}</Text> : null}
                    {found ? (
                      <View className="gap-1 rounded-lg border border-border p-3 dark:border-dark-border">
                        <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">{found.reward.name}</Text>
                        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                          {found.reward.kind === 'DISCOUNT' ? `ส่วนลด ${formatCurrency(found.reward.discountAmount)}` : 'ของแถม'}
                          {found.customer ? ` · ${found.customer.name}` : ''}
                        </Text>
                        {found.status !== 'ACTIVE' ? (
                          <Text className="text-[12px] font-semibold text-danger dark:text-dark-danger">
                            {found.status === 'USED' ? 'โค้ดนี้ถูกใช้ไปแล้ว' : 'โค้ดนี้ถูกยกเลิกแล้ว'}
                          </Text>
                        ) : (
                          <Pressable onPress={useCode} className="mt-1 h-10 items-center justify-center rounded-lg bg-primary">
                            <Text className="text-[14px] font-semibold text-white">ใช้โค้ดนี้</Text>
                          </Pressable>
                        )}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
