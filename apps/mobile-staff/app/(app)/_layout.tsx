import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useOrderRealtime } from '@/hooks/useOrderRealtime';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useIsTablet } from '@/hooks/useIsTablet';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SidebarNav } from '@/components/SidebarNav';

export default function AppLayout() {
  const { user, isLoading } = useRequireAuth();
  const isTablet = useIsTablet();
  useOrderRealtime();
  useOfflineSync();

  if (isLoading || !user) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color="#C9622E" />
      </View>
    );
  }

  const stack = (
    <Stack screenOptions={{ headerShown: true, headerShadowVisible: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="orders" options={{ headerShown: false }} />
      <Stack.Screen name="products" options={{ title: 'Products' }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Stack.Screen name="customers" options={{ title: 'Customers' }} />
      <Stack.Screen name="loyalty" options={{ title: 'Loyalty' }} />
      <Stack.Screen name="employees" options={{ title: 'Staff' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
      <Stack.Screen name="activity" options={{ title: 'Activity Log' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );

  return (
    <View className="flex-1">
      <OfflineBanner />
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
