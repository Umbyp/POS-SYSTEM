import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { SectionCard } from '@/components/SectionCard';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { formatCurrency, formatDate } from '@/lib/format';
import type { LoyaltyMode, MemberTier, RewardRedemption, StoreSettings } from '@/types/backoffice';

const MODE_OPTIONS: { value: LoyaltyMode; label: string }[] = [
  { value: 'OFF', label: 'ปิดใช้งาน' },
  { value: 'POINTS', label: 'แต้มสะสมเท่านั้น' },
  { value: 'STAMPS', label: 'ดวงสะสมเท่านั้น' },
  { value: 'BOTH', label: 'ทั้งแต้มและดวง' },
];

export default function LoyaltyScreen() {
  const qc = useQueryClient();
  const { data: store, isLoading } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data as StoreSettings,
  });

  const [loyaltyMode, setLoyaltyMode] = useState<LoyaltyMode>('BOTH');
  const [pointsEarnBaht, setPointsEarnBaht] = useState('100');
  const [pointValue, setPointValue] = useState('1');
  const [minRedeemPoints, setMinRedeemPoints] = useState('0');
  const [stampsPerReward, setStampsPerReward] = useState('10');
  const [stampRewardValue, setStampRewardValue] = useState('0');
  const [stampRewardName, setStampRewardName] = useState('');
  const [pointsExpiryMonths, setPointsExpiryMonths] = useState('0');

  useEffect(() => {
    if (!store) return;
    setLoyaltyMode(store.loyaltyMode);
    setPointsEarnBaht(String(store.pointsEarnBaht));
    setPointValue(store.pointValue);
    setMinRedeemPoints(String(store.minRedeemPoints));
    setStampsPerReward(String(store.stampsPerReward));
    setStampRewardValue(store.stampRewardValue);
    setStampRewardName(store.stampRewardName ?? '');
    setPointsExpiryMonths(String(store.pointsExpiryMonths ?? 0));
  }, [store]);

  const save = useMutation({
    mutationFn: async () =>
      api.patch('/stores/me', {
        loyaltyMode,
        pointsEarnBaht: Number(pointsEarnBaht) || 0,
        pointValue: Number(pointValue) || 0,
        minRedeemPoints: Number(minRedeemPoints) || 0,
        stampsPerReward: Number(stampsPerReward) || 1,
        stampRewardValue: Number(stampRewardValue) || 0,
        stampRewardName: stampRewardName || undefined,
        pointsExpiryMonths: Number(pointsExpiryMonths) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-me'] });
      Alert.alert('บันทึกแล้ว', 'อัปเดตการตั้งค่าสะสมแต้มเรียบร้อย');
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'บันทึกไม่สำเร็จ' : 'บันทึกไม่สำเร็จ';
      Alert.alert('บันทึกไม่สำเร็จ', message);
    },
  });

  if (isLoading || !store) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color="#C9622E" />
      </View>
    );
  }

  const showPoints = loyaltyMode === 'POINTS' || loyaltyMode === 'BOTH';
  const showStamps = loyaltyMode === 'STAMPS' || loyaltyMode === 'BOTH';

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="p-4 gap-4">
        <SectionCard title="โหมดสะสมแต้ม">
          <SelectField label="รูปแบบ" value={loyaltyMode} options={MODE_OPTIONS} onChange={(v) => setLoyaltyMode(v as LoyaltyMode)} />
        </SectionCard>

        {showPoints ? (
          <SectionCard title="แต้มสะสม">
            <TextField label="ยอดซื้อ (บาท) ต่อ 1 แต้ม" value={pointsEarnBaht} onChangeText={setPointsEarnBaht} keyboardType="number-pad" />
            <TextField label="มูลค่าแต้ม (บาท) เมื่อใช้แลก" value={pointValue} onChangeText={setPointValue} keyboardType="decimal-pad" />
            <TextField label="แต้มขั้นต่ำที่ใช้แลกได้" value={minRedeemPoints} onChangeText={setMinRedeemPoints} keyboardType="number-pad" />
            <TextField label="แต้มหมดอายุหลังกี่เดือน (0 = ไม่หมดอายุ)" value={pointsExpiryMonths} onChangeText={setPointsExpiryMonths} keyboardType="number-pad" />
          </SectionCard>
        ) : null}

        {showStamps ? (
          <SectionCard title="ดวงสะสม">
            <TextField label="จำนวนดวงต่อ 1 รางวัล" value={stampsPerReward} onChangeText={setStampsPerReward} keyboardType="number-pad" />
            <TextField label="มูลค่ารางวัล (บาท)" value={stampRewardValue} onChangeText={setStampRewardValue} keyboardType="decimal-pad" />
            <TextField label="ชื่อรางวัล" value={stampRewardName} onChangeText={setStampRewardName} placeholder="เช่น กาแฟฟรี 1 แก้ว" />
          </SectionCard>
        ) : null}

        <Button label="บันทึก" onPress={() => save.mutate()} loading={save.isPending} />

        <TiersCard />
        <RedeemCodeCard />
      </ScrollView>
    </SafeAreaView>
  );
}

function TiersCard() {
  const { data: tiers = [] } = useQuery({
    queryKey: ['loyalty-tiers'],
    queryFn: async () => (await api.get('/loyalty/tiers')).data as MemberTier[],
  });
  return (
    <SectionCard title="ระดับสมาชิก (ตั้งค่าได้ที่เว็บแบ็กออฟฟิศ)">
      {tiers.map((t) => (
        <View key={t.id} className="flex-row items-center justify-between">
          <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">{t.name}</Text>
          <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
            ใช้จ่ายสะสม {formatCurrency(t.minSpent)} ขึ้นไป
          </Text>
        </View>
      ))}
    </SectionCard>
  );
}

function RedeemCodeCard() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [found, setFound] = useState<RewardRedemption | null>(null);

  const { data: active = [] } = useQuery({
    queryKey: ['loyalty-redemptions', 'ACTIVE'],
    queryFn: async () =>
      (await api.get('/loyalty/redemptions', { params: { status: 'ACTIVE' } })).data as RewardRedemption[],
  });

  const errorOf = (err: unknown, fallback: string) =>
    isAxiosError(err) ? err.response?.data?.error ?? fallback : fallback;

  const lookup = useMutation({
    mutationFn: async () =>
      (await api.get(`/loyalty/redemptions/code/${encodeURIComponent(code.trim())}`)).data as RewardRedemption,
    onSuccess: setFound,
    onError: (err) => {
      setFound(null);
      Alert.alert('ไม่พบโค้ด', errorOf(err, 'ไม่พบโค้ดนี้'));
    },
  });

  const use = useMutation({
    mutationFn: async (id: string) => (await api.post(`/loyalty/redemptions/${id}/use`, {})).data as RewardRedemption,
    onSuccess: (r) => {
      setFound(r);
      qc.invalidateQueries({ queryKey: ['loyalty-redemptions'] });
      Alert.alert('สำเร็จ', 'บันทึกการใช้สิทธิ์แล้ว');
    },
    onError: (err) => Alert.alert('ใช้สิทธิ์ไม่สำเร็จ', errorOf(err, 'ใช้สิทธิ์ไม่สำเร็จ')),
  });

  const Row = ({ r }: { r: RewardRedemption }) => (
    <View className="rounded-lg border border-border dark:border-dark-border p-3 gap-1">
      <Text className="text-[15px] font-bold tracking-widest text-primary">{r.code}</Text>
      <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">{r.reward.name}</Text>
      <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
        {r.customer.name}
        {r.customer.phone ? ` · ${r.customer.phone}` : ''} · {formatDate(r.createdAt)}
      </Text>
      {r.status === 'ACTIVE' ? (
        <Button label="ใช้สิทธิ์ (ทำเครื่องหมายว่าใช้แล้ว)" variant="secondary" onPress={() => use.mutate(r.id)} loading={use.isPending} />
      ) : (
        <Text className="text-[12px] font-semibold text-danger">
          {r.status === 'USED' ? 'ใช้สิทธิ์ไปแล้ว' : 'ถูกยกเลิก'}
        </Text>
      )}
    </View>
  );

  return (
    <SectionCard title="ตรวจโค้ดแลกรางวัล">
      <TextField label="โค้ดที่ลูกค้าแสดง" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="เช่น K7M2QX" />
      <Button label="ค้นหาโค้ด" variant="secondary" onPress={() => code.trim() && lookup.mutate()} loading={lookup.isPending} />
      {found ? <Row r={found} /> : null}
      {active.length > 0 ? (
        <View className="gap-2">
          <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">
            รอใช้สิทธิ์ ({active.length})
          </Text>
          {active.slice(0, 20).map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}
