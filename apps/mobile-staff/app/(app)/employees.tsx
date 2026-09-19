import { useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Plus, Users } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { EmployeeFormModal } from '@/components/EmployeeFormModal';
import type { Employee } from '@/types/backoffice';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'เจ้าของร้าน',
  ADMIN: 'ผู้ดูแลระบบ',
  CASHIER: 'แคชเชียร์',
  KITCHEN: 'ครัว',
};

export default function EmployeesScreen() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [showForm, setShowForm] = useState(false);

  const { data: employees = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => (await api.get('/employees')).data as Employee[],
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/employees/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'อัปเดตไม่สำเร็จ' : 'อัปเดตไม่สำเร็จ';
      Alert.alert('อัปเดตไม่สำเร็จ', message);
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">{employees.length} คน</Text>
        <Pressable onPress={() => setShowForm(true)} className="h-10 flex-row items-center gap-1.5 rounded-lg bg-primary px-3.5">
          <Plus size={16} color="#FFFFFF" />
          <Text className="text-[13px] font-semibold text-white">เพิ่มพนักงาน</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C9622E" />
        </View>
      ) : (
        <FlatList
          data={employees}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <Users size={28} color="#9CA3AF" />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีพนักงาน</Text>
            </View>
          }
          renderItem={({ item }) => {
            const canToggle = item.id !== me?.id && item.role !== 'OWNER';
            return (
              <View className="flex-row items-center justify-between rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-3.5">
                <View className="flex-1">
                  <Text className="text-[14px] font-medium text-foreground dark:text-dark-foreground">{item.name}</Text>
                  <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
                    {item.email} · {ROLE_LABEL[item.role] ?? item.role}
                  </Text>
                </View>
                {canToggle ? (
                  <Switch
                    value={item.isActive}
                    onValueChange={(v) => toggleActive.mutate({ id: item.id, isActive: v })}
                    trackColor={{ true: '#C9622E' }}
                  />
                ) : (
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                    {item.isActive ? 'ทำงานอยู่' : 'ปิดใช้งาน'}
                  </Text>
                )}
              </View>
            );
          }}
        />
      )}

      <EmployeeFormModal visible={showForm} onClose={() => setShowForm(false)} onSaved={() => setShowForm(false)} />
    </SafeAreaView>
  );
}
