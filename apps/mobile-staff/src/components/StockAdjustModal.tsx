import { useState } from 'react';
import { Modal, View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { X, Minus, Plus } from 'lucide-react-native';
import { api } from '@/lib/api';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import type { Inventory } from '@/types/backoffice';

interface StockAdjustModalProps {
  item: Inventory | null;
  onClose: () => void;
}

export function StockAdjustModal({ item, onClose }: StockAdjustModalProps) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  function reset() {
    setDirection(1);
    setAmount('');
    setReason('');
  }

  const adjust = useMutation({
    mutationFn: async () => {
      const qty = Number(amount) || 0;
      return api.post(`/inventory/${item!.productId}/adjust`, {
        quantity: qty * direction,
        reason: reason || (direction === 1 ? 'รับสินค้าเข้า' : 'ตัดสต็อก/สูญเสีย'),
        type: direction === 1 ? 'PURCHASE' : 'WASTE',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      reset();
      onClose();
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'ปรับสต็อกไม่สำเร็จ' : 'ปรับสต็อกไม่สำเร็จ';
      Alert.alert('ปรับสต็อกไม่สำเร็จ', message);
    },
  });

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaProvider>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
          <Pressable className="rounded-t-2xl bg-card dark:bg-dark-card p-5 gap-4" onPress={(e) => e.stopPropagation()}>
            <SafeAreaView edges={['bottom']}>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ปรับสต็อก</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <X size={22} color="#9CA3AF" />
                </Pressable>
              </View>
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground mb-3">
                {item?.product.name} · คงเหลือ {item?.quantity}
              </Text>

              <View className="flex-row gap-2 mb-3">
                <Pressable
                  onPress={() => setDirection(1)}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${direction === 1 ? 'bg-success' : 'bg-muted dark:bg-dark-muted'}`}
                >
                  <Plus size={16} color={direction === 1 ? '#FFFFFF' : '#6B7280'} />
                  <Text className={`text-[13px] font-semibold ${direction === 1 ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>รับเข้า</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDirection(-1)}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${direction === -1 ? 'bg-danger' : 'bg-muted dark:bg-dark-muted'}`}
                >
                  <Minus size={16} color={direction === -1 ? '#FFFFFF' : '#6B7280'} />
                  <Text className={`text-[13px] font-semibold ${direction === -1 ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>ตัดออก</Text>
                </Pressable>
              </View>

              <View className="gap-3">
                <TextField label="จำนวน" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="0" />
                <TextField label="หมายเหตุ (ไม่บังคับ)" value={reason} onChangeText={setReason} />
                <Button
                  label="บันทึก"
                  onPress={() => adjust.mutate()}
                  disabled={!amount || Number(amount) <= 0}
                  loading={adjust.isPending}
                />
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </SafeAreaProvider>
    </Modal>
  );
}
