import { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/Button';
import type { Order } from '@/types/pos';

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [printing, setPrinting] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data as Order,
  });

  async function onPrint() {
    setPrinting(true);
    try {
      await api.post(`/orders/${id}/print/escpos`);
      Alert.alert('พิมพ์ใบเสร็จแล้ว', 'ส่งงานพิมพ์ไปยังเครื่องพิมพ์เรียบร้อย');
    } catch (err) {
      const message = isAxiosError(err)
        ? err.response?.data?.error ?? 'พิมพ์ไม่สำเร็จ — ตรวจสอบการตั้งค่าเครื่องพิมพ์ (PRINTER_IP)'
        : 'พิมพ์ไม่สำเร็จ';
      Alert.alert('พิมพ์ไม่สำเร็จ', message);
    } finally {
      setPrinting(false);
    }
  }

  if (isLoading || !order) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color="#FF6B35" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="p-4">
        <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-2">
          <Text className="text-center text-[15px] font-bold text-foreground dark:text-dark-foreground">ใบเสร็จรับเงิน</Text>
          <Text className="text-center text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
            #{order.orderNumber} · {formatDate(order.createdAt)}
          </Text>

          <View className="h-px bg-border dark:bg-dark-border my-2" />

          {order.items.map((item) => (
            <View key={item.id} className="flex-row justify-between">
              <Text className="flex-1 text-[13px] text-foreground dark:text-dark-foreground">
                {item.quantity}x {item.product?.name ?? 'สินค้า'}
              </Text>
              <Text className="text-[13px] text-foreground dark:text-dark-foreground">
                {formatCurrency(Number(item.unitPrice) * item.quantity)}
              </Text>
            </View>
          ))}

          <View className="h-px bg-border dark:bg-dark-border my-2" />

          <View className="flex-row justify-between">
            <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">รวมทั้งสิ้น</Text>
            <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">{formatCurrency(order.total)}</Text>
          </View>
        </View>

        <View className="mt-4">
          <Button label="พิมพ์ใบเสร็จ (เครื่องพิมพ์ครัว/เคาน์เตอร์)" onPress={onPrint} loading={printing} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
