import { View, Text } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useOfflineQueue } from '@/stores/offlineQueue.store';

export function OfflineBanner() {
  const count = useOfflineQueue((s) => s.orders.length + s.settles.length);
  if (count === 0) return null;

  return (
    <View className="flex-row items-center justify-center gap-2 bg-warning py-1.5">
      <WifiOff size={13} color="#FFFFFF" />
      <Text className="text-[12px] font-medium text-white">
        {count} รายการรอซิงค์ — จะส่งอัตโนมัติเมื่อมีสัญญาณ
      </Text>
    </View>
  );
}
