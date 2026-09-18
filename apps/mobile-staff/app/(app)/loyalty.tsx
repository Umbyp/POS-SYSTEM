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
import type { LoyaltyMode, StoreSettings } from '@/types/backoffice';

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

  useEffect(() => {
    if (!store) return;
    setLoyaltyMode(store.loyaltyMode);
    setPointsEarnBaht(String(store.pointsEarnBaht));
    setPointValue(store.pointValue);
    setMinRedeemPoints(String(store.minRedeemPoints));
    setStampsPerReward(String(store.stampsPerReward));
    setStampRewardValue(store.stampRewardValue);
    setStampRewardName(store.stampRewardName ?? '');
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
        <ActivityIndicator color="#FF6B35" />
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
      </ScrollView>
    </SafeAreaView>
  );
}
