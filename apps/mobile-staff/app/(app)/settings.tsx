import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { LogOut } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { SectionCard } from '@/components/SectionCard';
import { TextField } from '@/components/TextField';
import { SwitchRow } from '@/components/SwitchRow';
import { Button } from '@/components/Button';
import type { StoreSettings } from '@/types/backoffice';

export default function SettingsScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const isOwnerAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const { data: store, isLoading } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data as StoreSettings,
  });

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [taxRate, setTaxRate] = useState('7');
  const [serviceCharge, setServiceCharge] = useState('0');
  const [priceIncludesTax, setPriceIncludesTax] = useState(true);
  const [promptpayId, setPromptpayId] = useState('');
  const [receiptFooterText, setReceiptFooterText] = useState('');
  const [receiptShowSignupQr, setReceiptShowSignupQr] = useState(false);
  const [receiptSignupHeadline, setReceiptSignupHeadline] = useState('');
  const [receiptShowPointsQr, setReceiptShowPointsQr] = useState(false);
  const [receiptPointsTerms, setReceiptPointsTerms] = useState('');
  const [dailyTarget, setDailyTarget] = useState('');
  const [monthlyTarget, setMonthlyTarget] = useState('');

  useEffect(() => {
    if (!store) return;
    setName(store.name ?? '');
    setAddress(store.address ?? '');
    setPhone(store.phone ?? '');
    setTaxId(store.taxId ?? '');
    setBranchCode(store.branchCode ?? '');
    setInvoicePrefix(store.invoicePrefix ?? '');
    setTaxRate(String(store.taxRate));
    setServiceCharge(String(store.serviceCharge));
    setPriceIncludesTax(store.priceIncludesTax);
    setPromptpayId(store.promptpayId ?? '');
    setReceiptFooterText(store.receiptFooterText ?? '');
    setReceiptShowSignupQr(store.receiptShowSignupQr);
    setReceiptSignupHeadline(store.receiptSignupHeadline ?? '');
    setReceiptShowPointsQr(store.receiptShowPointsQr);
    setReceiptPointsTerms(store.receiptPointsTerms ?? '');
    setDailyTarget(store.dailyTarget ?? '');
    setMonthlyTarget(store.monthlyTarget ?? '');
  }, [store]);

  const save = useMutation({
    mutationFn: async () =>
      api.patch('/stores/me', {
        name,
        address: address || undefined,
        phone: phone || undefined,
        taxId: taxId || undefined,
        branchCode: branchCode || undefined,
        invoicePrefix: invoicePrefix || undefined,
        taxRate: Number(taxRate) || 0,
        serviceCharge: Number(serviceCharge) || 0,
        priceIncludesTax,
        promptpayId: promptpayId || undefined,
        receiptFooterText: receiptFooterText || undefined,
        receiptShowSignupQr,
        receiptSignupHeadline: receiptSignupHeadline || undefined,
        receiptShowPointsQr,
        receiptPointsTerms: receiptPointsTerms || undefined,
        dailyTarget: dailyTarget ? Number(dailyTarget) : undefined,
        monthlyTarget: monthlyTarget ? Number(monthlyTarget) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-me'] });
      Alert.alert('บันทึกแล้ว', 'อัปเดตการตั้งค่าร้านเรียบร้อย');
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

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="p-4 gap-4">
        <SectionCard title="บัญชีของฉัน">
          <Text className="text-[14px] font-medium text-foreground dark:text-dark-foreground">{user?.name}</Text>
          <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
            {user?.email} · {user?.role}
          </Text>
        </SectionCard>

        {isOwnerAdmin ? (
          <>
            <SectionCard title="ข้อมูลร้าน">
              <TextField label="ชื่อร้าน" value={name} onChangeText={setName} />
              <TextField label="ที่อยู่" value={address} onChangeText={setAddress} multiline numberOfLines={2} />
              <TextField label="เบอร์โทร" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </SectionCard>

            <SectionCard title="ภาษีและค่าบริการ">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField label="อัตราภาษี (%)" value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" />
                </View>
                <View className="flex-1">
                  <TextField label="ค่าบริการ (%)" value={serviceCharge} onChangeText={setServiceCharge} keyboardType="decimal-pad" />
                </View>
              </View>
              <SwitchRow label="ราคารวมภาษีแล้ว" value={priceIncludesTax} onChange={setPriceIncludesTax} />
              <TextField label="เลขผู้เสียภาษี" value={taxId} onChangeText={setTaxId} />
              <TextField label="รหัสสาขา" value={branchCode} onChangeText={setBranchCode} />
              <TextField label="คำนำหน้าเลขที่ใบกำกับ" value={invoicePrefix} onChangeText={setInvoicePrefix} />
            </SectionCard>

            <SectionCard title="การชำระเงิน">
              <TextField label="พร้อมเพย์ (เบอร์/เลขประจำตัว)" value={promptpayId} onChangeText={setPromptpayId} />
            </SectionCard>

            <SectionCard title="ใบเสร็จ">
              <TextField label="ข้อความท้ายใบเสร็จ" value={receiptFooterText} onChangeText={setReceiptFooterText} multiline numberOfLines={2} />
              <SwitchRow label="แสดง QR สมัครสมาชิก" value={receiptShowSignupQr} onChange={setReceiptShowSignupQr} />
              {receiptShowSignupQr ? (
                <TextField label="หัวข้อชวนสมัคร" value={receiptSignupHeadline} onChangeText={setReceiptSignupHeadline} />
              ) : null}
              <SwitchRow label="แสดง QR สะสมแต้ม" value={receiptShowPointsQr} onChange={setReceiptShowPointsQr} />
              {receiptShowPointsQr ? (
                <TextField label="เงื่อนไขสะสมแต้ม" value={receiptPointsTerms} onChangeText={setReceiptPointsTerms} />
              ) : null}
            </SectionCard>

            <SectionCard title="เป้าหมายยอดขาย">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField label="เป้าหมายรายวัน (บาท)" value={dailyTarget} onChangeText={setDailyTarget} keyboardType="decimal-pad" />
                </View>
                <View className="flex-1">
                  <TextField label="เป้าหมายรายเดือน (บาท)" value={monthlyTarget} onChangeText={setMonthlyTarget} keyboardType="decimal-pad" />
                </View>
              </View>
            </SectionCard>

            <Button label="บันทึกการตั้งค่า" onPress={() => save.mutate()} loading={save.isPending} />
          </>
        ) : null}

        <Pressable
          onPress={() => {
            logout();
            router.replace('/login');
          }}
          className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-muted dark:bg-dark-muted"
        >
          <LogOut size={18} color="#EF4444" />
          <Text className="text-[14px] font-medium text-danger">ออกจากระบบ</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
