import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OrderDetailView } from '@/components/OrderDetailView';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <OrderDetailView id={id} onReceipt={(orderId) => router.push(`/orders/${orderId}/receipt` as never)} />
    </SafeAreaView>
  );
}
