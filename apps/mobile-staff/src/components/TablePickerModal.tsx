import { Modal, View, Text, Pressable, FlatList } from 'react-native';
import { X } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TABLE_STATUS_COLOR, TABLE_STATUS_LABEL } from '@/constants/tableStatus';
import type { RestaurantTable } from '@/types/pos';

interface TablePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (table: RestaurantTable) => void;
}

export function TablePickerModal({ visible, onClose, onSelect }: TablePickerModalProps) {
  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => (await api.get('/tables')).data as RestaurantTable[],
    enabled: visible,
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable className="rounded-t-2xl bg-card dark:bg-dark-card p-5 gap-4 max-h-[70%]" onPress={(e) => e.stopPropagation()}>
          <View className="flex-row items-center justify-between">
            <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">เลือกโต๊ะ</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color="#9CA3AF" />
            </Pressable>
          </View>
          <FlatList
            data={tables}
            keyExtractor={(t) => t.id}
            numColumns={4}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const c = TABLE_STATUS_COLOR[item.status];
              return (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={{ backgroundColor: c.bg, borderColor: c.border }}
                  className="flex-1 aspect-square rounded-lg border items-center justify-center"
                >
                  <Text style={{ color: c.fg }} className="text-[15px] font-bold">
                    {item.number}
                  </Text>
                  <Text style={{ color: c.fg }} className="text-[9px]">
                    {TABLE_STATUS_LABEL[item.status]}
                  </Text>
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
