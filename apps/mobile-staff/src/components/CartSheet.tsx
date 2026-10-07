import { Modal, View, Text, Pressable } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { CartPanel } from '@/components/CartPanel';
import type { PaymentMode } from '@/components/PaymentModal';

interface CartSheetProps {
  visible: boolean;
  onClose: () => void;
  onCheckout: (mode: PaymentMode) => void;
}

export function CartSheet({ visible, onClose, onCheckout }: CartSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* RN's Modal renders into a separate native root, so the app's root
          SafeAreaProvider doesn't reach it — it needs its own. */}
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
          <CartPanel
            active={visible}
            onCheckout={onCheckout}
            header={
              <View className="flex-row items-center justify-between px-4 py-3 bg-card dark:bg-dark-card border-b border-border dark:border-dark-border">
                <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ตะกร้า</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <X size={22} color="#9CA3AF" />
                </Pressable>
              </View>
            }
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
