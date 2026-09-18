import { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { X, Pencil, Plus, Minus } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import type { CustomerDetail } from '@/types/backoffice';

interface CustomerDetailModalProps {
  customerId: string | null;
  onClose: () => void;
  onEdit: () => void;
}

export function CustomerDetailModal({ customerId, onClose, onEdit }: CustomerDetailModalProps) {
  const qc = useQueryClient();
  const [adjustKind, setAdjustKind] = useState<'points' | 'stamps' | null>(null);

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customers', customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}`)).data as CustomerDetail,
    enabled: !!customerId,
  });

  const adjust = useMutation({
    mutationFn: async ({ kind, delta }: { kind: 'points' | 'stamps'; delta: number }) =>
      api.post(`/customers/${customerId}/adjust`, { kind, delta }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'ปรับแต้มไม่สำเร็จ' : 'ปรับแต้มไม่สำเร็จ';
      Alert.alert('ปรับไม่สำเร็จ', message);
    },
  });

  function promptAdjust(kind: 'points' | 'stamps', sign: 1 | -1) {
    Alert.prompt?.(
      sign === 1 ? 'เพิ่มจำนวน' : 'ลดจำนวน',
      undefined,
      (text) => {
        const n = parseInt(text ?? '', 10);
        if (n > 0) adjust.mutate({ kind, delta: n * sign });
      },
      'plain-text',
      '',
      'number-pad'
    );
  }

  return (
    <Modal visible={!!customerId} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-dark-border">
            <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ข้อมูลลูกค้า</Text>
            <View className="flex-row items-center gap-4">
              <Pressable onPress={onEdit} hitSlop={12}>
                <Pencil size={19} color="#6B7280" />
              </Pressable>
              <Pressable onPress={onClose} hitSlop={12}>
                <X size={22} color="#9CA3AF" />
              </Pressable>
            </View>
          </View>

          {isLoading || !customer ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#FF6B35" />
            </View>
          ) : (
            <ScrollView contentContainerClassName="p-4 gap-4">
              <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-1.5">
                <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">{customer.name}</Text>
                {customer.phone ? (
                  <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">{customer.phone}</Text>
                ) : null}
                {customer.email ? (
                  <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">{customer.email}</Text>
                ) : null}
                <View className="flex-row justify-between mt-2">
                  <Stat label="ยอดใช้จ่าย" value={formatCurrency(customer.totalSpent)} />
                  <Stat label="จำนวนครั้ง" value={String(customer.visitCount)} />
                  <Stat label="เยี่ยมล่าสุด" value={customer.lastVisitAt ? formatDate(customer.lastVisitAt) : '-'} small />
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1 rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3.5 gap-2">
                  <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">แต้มสะสม</Text>
                  <Text className="text-[20px] font-bold text-foreground dark:text-dark-foreground">{customer.points}</Text>
                  <View className="flex-row gap-2">
                    <IconBtn icon={Plus} onPress={() => promptAdjust('points', 1)} />
                    <IconBtn icon={Minus} onPress={() => promptAdjust('points', -1)} />
                  </View>
                </View>
                <View className="flex-1 rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3.5 gap-2">
                  <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ดวงสะสม</Text>
                  <Text className="text-[20px] font-bold text-foreground dark:text-dark-foreground">{customer.stamps}</Text>
                  <View className="flex-row gap-2">
                    <IconBtn icon={Plus} onPress={() => promptAdjust('stamps', 1)} />
                    <IconBtn icon={Minus} onPress={() => promptAdjust('stamps', -1)} />
                  </View>
                </View>
              </View>

              <View className="gap-2">
                <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">ประวัติการสั่งซื้อ</Text>
                {customer.orders.length === 0 ? (
                  <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีประวัติ</Text>
                ) : (
                  customer.orders.map((o) => (
                    <View
                      key={o.id}
                      className="flex-row items-center justify-between rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card px-3.5 py-2.5"
                    >
                      <View className="flex-1">
                        <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">#{o.orderNumber}</Text>
                        <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{formatDate(o.createdAt)}</Text>
                      </View>
                      <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{formatCurrency(o.total)}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View>
      <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
      <Text className={`${small ? 'text-[12px]' : 'text-[14px]'} font-semibold text-foreground dark:text-dark-foreground`}>{value}</Text>
    </View>
  );
}

function IconBtn({ icon: Icon, onPress }: { icon: typeof Plus; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center justify-center h-8 rounded-md bg-muted dark:bg-dark-muted">
      <Icon size={15} color="#6B7280" />
    </Pressable>
  );
}
