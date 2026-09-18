import { Stack } from 'expo-router';

export default function OrdersLayout() {
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'Orders' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'Order' }} />
      <Stack.Screen name="[id]/receipt" options={{ title: 'Receipt' }} />
    </Stack>
  );
}
