import { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { X } from 'lucide-react-native';
import { api } from '@/lib/api';
import { TextField } from '@/components/TextField';
import { SelectField } from '@/components/SelectField';
import { Button } from '@/components/Button';
import type { Role } from '@/stores/auth.store';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'ผู้ดูแลระบบ (Admin)' },
  { value: 'CASHIER', label: 'แคชเชียร์' },
  { value: 'KITCHEN', label: 'ครัว' },
];

interface EmployeeFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EmployeeFormModal({ visible, onClose, onSaved }: EmployeeFormModalProps) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('CASHIER');

  function reset() {
    setName('');
    setEmail('');
    setPassword('');
    setRole('CASHIER');
  }

  const save = useMutation({
    mutationFn: async () => api.post('/employees', { name, email, password, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      reset();
      onSaved();
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'เพิ่มพนักงานไม่สำเร็จ' : 'เพิ่มพนักงานไม่สำเร็จ';
      Alert.alert('เพิ่มพนักงานไม่สำเร็จ', message);
    },
  });

  const canSave = !!name && !!email && password.length >= 6;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-dark-border">
            <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">เพิ่มพนักงาน</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color="#9CA3AF" />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="p-4 gap-4">
            <TextField label="ชื่อ *" value={name} onChangeText={setName} />
            <TextField label="อีเมล *" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextField
              label="รหัสผ่าน * (อย่างน้อย 6 ตัว)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              keyboardType="ascii-capable"
            />
            <SelectField label="ตำแหน่ง *" value={role} options={ROLE_OPTIONS} onChange={(v) => setRole(v as Role)} />
          </ScrollView>

          <View className="p-4 border-t border-border dark:border-dark-border">
            <Button label="บันทึก" onPress={() => save.mutate()} disabled={!canSave} loading={save.isPending} />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
