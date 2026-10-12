import { Stack } from 'expo-router';
import { useThemeColors } from '@/lib/theme';

export default function OrdersLayout() {
  // Same chrome as the parent (app) stack — this nested navigator draws its own header, so it must be themed too.
  const t = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: t.card },
        contentStyle: { backgroundColor: t.background },
        headerTitleStyle: { fontSize: 16, fontWeight: '700', color: t.foreground },
        headerTintColor: t.primary,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'ออเดอร์' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'รายละเอียดออเดอร์' }} />
      <Stack.Screen name="[id]/receipt" options={{ title: 'ใบเสร็จ' }} />
    </Stack>
  );
}
