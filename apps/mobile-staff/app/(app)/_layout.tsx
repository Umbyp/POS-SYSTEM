import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useOrderRealtime } from '@/hooks/useOrderRealtime';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { OfflineBanner } from '@/components/OfflineBanner';

export default function AppLayout() {
  const { user, isLoading } = useRequireAuth();
  useOrderRealtime();
  useOfflineSync();

  if (isLoading || !user) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color="#FF6B35" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <OfflineBanner />
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
    </View>
  );
}
