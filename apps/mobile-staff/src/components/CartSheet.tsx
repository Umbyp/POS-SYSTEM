import { Modal, View, Text, Pressable } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
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
              <View className="flex-row items-center gap-3 px-4 py-3 bg-card dark:bg-dark-card">
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-lg border border-border dark:border-dark-border"
                >
                  <ChevronLeft size={18} color="#707070" />
                </Pressable>
                <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ออเดอร์</Text>
              </View>
            }
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
