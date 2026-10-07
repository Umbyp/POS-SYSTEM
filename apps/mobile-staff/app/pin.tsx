import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Delete } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuthStore, type Role } from '@/stores/auth.store';
import { DEFAULT_ROUTE } from '@/constants/nav';
import { Button } from '@/components/Button';

interface PinStaff {
  id: string;
  name: string;
  role: Role;
  avatar?: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'เจ้าของร้าน',
  ADMIN: 'ผู้ดูแลระบบ',
  CASHIER: 'แคชเชียร์',
  KITCHEN: 'ครัว',
};
const MAX_LEN = 6;
const MIN_LEN = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'email', '0', 'del'] as const;

function initials(name: string) {
  return name.trim().slice(0, 2);
}

export default function PinScreen() {
  const router = useRouter();
  const deviceToken = useAuthStore((s) => s.deviceToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearDevice = useAuthStore((s) => s.clearDevice);
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const headers = { Authorization: `Bearer ${deviceToken}` };

  useEffect(() => {
    if (!deviceToken) router.replace('/login');
  }, [deviceToken, router]);

  const staff = useQuery({
    queryKey: ['pin-staff', deviceToken],
    queryFn: async () => (await api.get<PinStaff[]>('/auth/pin-staff', { headers })).data,
    enabled: !!deviceToken,
    retry: false,
  });

  useEffect(() => {
    // device token expired/revoked → require a normal login again
    if (staff.isError && isAxiosError(staff.error) && staff.error.response?.status === 401) {
      clearDevice();
      router.replace('/login');
    }
  }, [staff.isError, staff.error, clearDevice, router]);

  function press(k: (typeof KEYS)[number]) {
    if (submitting) return;
    if (k === 'email') return router.replace('/login');
    setError('');
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    setPin((p) => (p.length < MAX_LEN ? p + k : p));
  }

  async function submit() {
    if (!selected || pin.length < MIN_LEN) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/auth/pin-login', { userId: selected, pin }, { headers });
      setAuth(res.data.user, res.data.token); // keeps deviceToken
      router.replace(DEFAULT_ROUTE[res.data.user.role as Role] as never);
    } catch (err) {
      setPin('');
      if (isAxiosError(err) && err.response?.status === 401) {
        clearDevice();
        return router.replace('/login');
      }
      setError(isAxiosError(err) ? err.response?.data?.error ?? err.response?.data?.message ?? 'เข้ากะไม่สำเร็จ' : 'เข้ากะไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-card dark:bg-dark-background">
      <ScrollView contentContainerClassName="px-[26px] pb-6 pt-5 self-center w-full max-w-[420px]">
        <Text className="text-[22px] font-bold text-foreground dark:text-dark-foreground">เข้ากะ</Text>
        <Text className="mt-1.5 text-[12px] text-[#B9A392]">เลือกพนักงานแล้วใส่ PIN — ใช้เมื่อพนักงานสลับกันใช้เครื่องเดียวกัน</Text>

        <View className="mt-5 gap-[9px]">
          {staff.isLoading ? <ActivityIndicator /> : null}
          {staff.data?.length === 0 ? (
            <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีพนักงานที่ตั้ง PIN ไว้</Text>
          ) : null}
          {staff.data?.map((s) => {
            const on = s.id === selected;
            return (
              <Pressable
                key={s.id}
                onPress={() => { setSelected(s.id); setPin(''); setError(''); }}
                className={`flex-row items-center gap-[11px] rounded-xl p-[13px] ${
                  on ? 'border-2 border-[#2B1F17] dark:border-dark-foreground' : 'border border-border dark:border-dark-border'
                }`}
              >
                <View className={`h-[38px] w-[38px] items-center justify-center rounded-full ${on ? 'bg-[#2B1F17]' : 'bg-muted dark:bg-dark-muted'}`}>
                  <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>{initials(s.name)}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-foreground dark:text-dark-foreground">{s.name}</Text>
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{ROLE_LABEL[s.role]}</Text>
                </View>
                {on ? <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">✓</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <View className="mb-1.5 mt-[26px] flex-row justify-center gap-2.5">
          {Array.from({ length: Math.max(MIN_LEN, pin.length) }).map((_, i) => (
            <View key={i} className={`h-[15px] w-[15px] rounded-full ${i < pin.length ? 'bg-[#2B1F17] dark:bg-dark-foreground' : 'bg-border dark:bg-dark-border'}`} />
          ))}
        </View>
        <Text className="mb-3 h-[18px] text-center text-[12px] font-medium text-[#B91C1C]">{error}</Text>

        <View className="flex-row flex-wrap justify-between gap-y-2.5 pb-4">
          {KEYS.map((k) => {
            const plain = k === 'email' || k === 'del';
            return (
              <Pressable
                key={k}
                onPress={() => press(k)}
                disabled={!selected && !plain}
                className={`h-[58px] w-[31.5%] items-center justify-center rounded-xl ${
                  plain ? '' : 'border border-border bg-background active:bg-muted dark:border-dark-border dark:bg-dark-card'
                } ${!selected && !plain ? 'opacity-40' : ''}`}
              >
                {k === 'email' ? (
                  <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">ใช้อีเมล</Text>
                ) : k === 'del' ? (
                  <Delete size={22} color="#7A6A5C" />
                ) : (
                  <Text className="text-[22px] font-semibold text-foreground dark:text-dark-foreground">{k}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <Button label="เริ่มกะ" onPress={submit} loading={submitting} disabled={!selected || pin.length < MIN_LEN} />
      </ScrollView>
    </SafeAreaView>
  );
}
