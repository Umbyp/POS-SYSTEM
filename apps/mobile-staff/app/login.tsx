import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { isAxiosError } from 'axios';
import { Store } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { DEFAULT_ROUTE } from '@/constants/nav';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const setAuth = useAuthStore((s) => s.setAuth);
  const deviceToken = useAuthStore((s) => s.deviceToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function afterLogin(data: { token: string; user: { id: string; name: string; email: string; role: keyof typeof DEFAULT_ROUTE; storeId: string } }) {
    setAuth(data.user, data.token, { device: true });
    router.replace(DEFAULT_ROUTE[data.user.role] as never);
  }

  async function onSubmit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      await afterLogin(res.data);
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.message ?? 'เข้าสู่ระบบไม่สำเร็จ' : 'เข้าสู่ระบบไม่สำเร็จ';
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', message);
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleIdToken(idToken: string) {
    setLoading(true);
    try {
      const res = await api.post('/auth/google', { idToken });
      await afterLogin(res.data);
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.message ?? 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ' : 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ';
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', message);
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <View className="gap-4">
      <TextField
        label="อีเมล"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label="รหัสผ่าน"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        keyboardType="ascii-capable"
        value={password}
        onChangeText={setPassword}
      />
      <Button label="เข้าสู่ระบบ" onPress={onSubmit} loading={loading} disabled={!email || !password} />

      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border dark:bg-dark-border" />
        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">หรือ</Text>
        <View className="h-px flex-1 bg-border dark:bg-dark-border" />
      </View>

      <GoogleSignInButton onIdToken={onGoogleIdToken} disabled={loading} />

      {deviceToken ? (
        <Button label="สลับพนักงาน / เข้ากะด้วย PIN" variant="secondary" onPress={() => router.push('/pin' as never)} disabled={loading} />
      ) : null}
    </View>
  );

  if (wide) {
    return (
      <View className="flex-1 flex-row bg-background dark:bg-dark-background">
        <SafeAreaView edges={['top', 'bottom', 'left']} className="w-[420px] bg-[#2B1F17]">
          <View className="flex-1 px-10 py-11">
            <View className="flex-row items-center gap-[11px]">
              <View className="h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-primary">
                <Text className="text-[18px] font-bold text-white">R</Text>
              </View>
              <Text className="text-[17px] font-bold text-white">RestroPOS</Text>
            </View>
            <View className="mt-auto gap-3.5">
              <Text className="text-[26px] font-bold leading-[35px] text-white">เข้าสู่ระบบสำหรับพนักงาน</Text>
              <Text className="text-[13px] leading-[21px] text-[#B9A392]">
                ใช้บัญชีพนักงานของร้านเพื่อเริ่มกะและเข้าใช้งานระบบ POS
              </Text>
            </View>
          </View>
        </SafeAreaView>
        <SafeAreaView edges={['top', 'bottom', 'right']} className="flex-1">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
            <ScrollView contentContainerClassName="flex-1 items-center justify-center px-14" keyboardShouldPersistTaps="handled">
              <View className="w-full max-w-[380px] gap-[18px] rounded-2xl border border-border bg-card p-8 dark:border-dark-border dark:bg-dark-card">
                <View>
                  <Text className="text-[20px] font-bold text-foreground dark:text-dark-foreground">เข้าสู่ระบบ</Text>
                  <Text className="mt-[3px] text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ใช้บัญชีพนักงานของร้าน</Text>
                </View>
                {form}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-card dark:bg-dark-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-1 justify-center px-[26px]" keyboardShouldPersistTaps="handled">
          <View className="items-center gap-1.5 mb-10">
            <View className="mb-2.5 h-14 w-14 items-center justify-center rounded-2xl bg-primary">
              <Store size={26} color="#FFFFFF" />
            </View>
            <Text className="text-[22px] font-bold text-foreground dark:text-dark-foreground">RestroPOS</Text>
            <Text className="text-[13px] font-medium text-muted-foreground dark:text-dark-muted-foreground">เข้าสู่ระบบสำหรับพนักงาน</Text>
          </View>
          {form}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

