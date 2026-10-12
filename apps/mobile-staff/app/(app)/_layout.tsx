import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useOrderRealtime } from '@/hooks/useOrderRealtime';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePrintQueue } from '@/hooks/usePrintQueue';
import { useIsTablet } from '@/hooks/useIsTablet';
import { useThemeColors } from '@/lib/theme';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StockAlertBanner } from '@/components/StockAlertBanner';
import { SidebarNav } from '@/components/SidebarNav';

export default function AppLayout() {
  const { user, isLoading } = useRequireAuth();
  const isTablet = useIsTablet();
  const t = useThemeColors();
  useOrderRealtime();
  useOfflineSync();
  usePrintQueue();

  if (isLoading || !user) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  const stack = (
    <Stack screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: t.card },
        contentStyle: { backgroundColor: t.background },
        headerTitleStyle: { fontSize: 16, fontWeight: '700', color: t.foreground },
        headerTintColor: t.primary,
        // The tabs group has no title, so iOS would label the back button "(tabs)".
        headerBackTitle: 'ย้อนกลับ',
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="orders" options={{ headerShown: false }} />
      <Stack.Screen name="shift" options={{ title: 'กะทำงาน' }} />
      <Stack.Screen name="zreport" options={{ title: 'ปิดยอดวัน' }} />
      <Stack.Screen name="products" options={{ title: 'สินค้า' }} />
      <Stack.Screen name="inventory" options={{ title: 'สต๊อก' }} />
      <Stack.Screen name="customers" options={{ title: 'ลูกค้า · สมาชิก' }} />
      <Stack.Screen name="loyalty" options={{ title: 'สะสมแต้ม' }} />
      <Stack.Screen name="employees" options={{ title: 'พนักงาน' }} />
      <Stack.Screen name="reports" options={{ title: 'รายงาน' }} />
      <Stack.Screen name="activity" options={{ title: 'ประวัติ' }} />
      <Stack.Screen name="settings" options={{ title: 'ตั้งค่า' }} />
    </Stack>
  );

  return (
    <View className="flex-1">
      <OfflineBanner />
      <StockAlertBanner />
      {isTablet ? (
        <View className="flex-1 flex-row">
          <SidebarNav />
          <View className="flex-1">{stack}</View>
        </View>
      ) : (
        stack
      )}
    </View>
  );
}
