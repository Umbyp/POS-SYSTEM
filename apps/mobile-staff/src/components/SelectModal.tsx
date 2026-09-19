import { Modal, View, Text, Pressable, FlatList } from 'react-native';
import { X, Check } from 'lucide-react-native';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectModalProps {
  visible: boolean;
  title: string;
  options: SelectOption[];
  value?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function SelectModal({ visible, title, options, value, onSelect, onClose }: SelectModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable className="rounded-t-2xl bg-card dark:bg-dark-card p-5 gap-3 max-h-[70%]" onPress={(e) => e.stopPropagation()}>
          <View className="flex-row items-center justify-between">
            <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color="#9CA3AF" />
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item.value)}
                className="flex-row items-center justify-between py-3 border-b border-border dark:border-dark-border"
              >
                <Text className="text-[14px] text-foreground dark:text-dark-foreground">{item.label}</Text>
                {item.value === value ? <Check size={18} color="#C9622E" /> : null}
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
