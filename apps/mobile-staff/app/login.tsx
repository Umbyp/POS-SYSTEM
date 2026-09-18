import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
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
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function afterLogin(data: { token: string; user: { id: string; name: string; email: string; role: keyof typeof DEFAULT_ROUTE; storeId: string } }) {
    setAuth(data.user, data.token);
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

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-1 justify-center px-6" keyboardShouldPersistTaps="handled">
          <View className="items-center gap-2 mb-10">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-sm">
              <Store size={26} color="#FFFFFF" />
            </View>
            <Text className="text-[20px] font-extrabold text-foreground dark:text-dark-foreground">RestroPOS</Text>
            <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">เข้าสู่ระบบสำหรับพนักงาน</Text>
          </View>

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

            <View className="flex-row items-center gap-3 my-1">
              <View className="h-px flex-1 bg-border dark:bg-dark-border" />
              <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">หรือ</Text>
              <View className="h-px flex-1 bg-border dark:bg-dark-border" />
            </View>

            <GoogleSignInButton onIdToken={onGoogleIdToken} disabled={loading} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
