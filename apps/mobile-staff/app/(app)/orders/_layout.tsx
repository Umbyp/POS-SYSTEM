import { Stack } from 'expo-router';

export default function OrdersLayout() {
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'ออเดอร์' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'รายละเอียดออเดอร์' }} />
      <Stack.Screen name="[id]/receipt" options={{ title: 'ใบเสร็จ' }} />
    </Stack>
  );
}
