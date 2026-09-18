import { Modal, View, Text, Pressable } from 'react-native';
import { X, ArrowRight } from 'lucide-react-native';
import { TABLE_STATUS_LABEL, TABLE_STATUS_ORDER, TABLE_STATUS_COLOR } from '@/constants/tableStatus';
import type { RestaurantTable, TableStatus } from '@/types/pos';

interface TableActionSheetProps {
  table: RestaurantTable | null;
  onClose: () => void;
  onChangeStatus: (status: TableStatus) => void;
  onOpenBill: () => void;
  updating: boolean;
}

export function TableActionSheet({ table, onClose, onChangeStatus, onOpenBill, updating }: TableActionSheetProps) {
  return (
    <Modal visible={!!table} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable className="rounded-t-2xl bg-card dark:bg-dark-card p-5 gap-4" onPress={(e) => e.stopPropagation()}>
          {table ? (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">โต๊ะ {table.number}</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <X size={22} color="#9CA3AF" />
                </Pressable>
              </View>

              <Pressable
                onPress={onOpenBill}
                className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-primary"
              >
                <Text className="text-[15px] font-semibold text-white">ไปที่บิล / POS</Text>
                <ArrowRight size={18} color="#FFFFFF" />
              </Pressable>

              <View className="gap-2">
                <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">เปลี่ยนสถานะ</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TABLE_STATUS_ORDER.map((status) => {
                    const active = table.status === status;
                    const c = TABLE_STATUS_COLOR[status];
                    return (
                      <Pressable
                        key={status}
                        disabled={updating || active}
                        onPress={() => onChangeStatus(status)}
                        style={{ backgroundColor: active ? c.fg : c.bg, borderColor: c.border }}
                        className="rounded-full border px-3.5 py-2"
                      >
                        <Text style={{ color: active ? '#FFFFFF' : c.fg }} className="text-[12px] font-semibold">
                          {TABLE_STATUS_LABEL[status]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
