import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { X } from 'lucide-react-native';
import { api } from '@/lib/api';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import type { Customer } from '@/types/backoffice';

interface CustomerFormModalProps {
  visible: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CustomerFormModal({ visible, customer, onClose, onSaved }: CustomerFormModalProps) {
  const qc = useQueryClient();
  const isEdit = !!customer;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(customer?.name ?? '');
    setPhone(customer?.phone ?? '');
    setEmail(customer?.email ?? '');
    setAddress(customer?.address ?? '');
    setNotes(customer?.notes ?? '');
  }, [visible, customer]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, phone: phone || undefined, email: email || undefined, address: address || undefined, notes: notes || undefined };
      if (isEdit) return (await api.patch(`/customers/${customer!.id}`, body)).data;
      return (await api.post('/customers', body)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onSaved();
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'บันทึกไม่สำเร็จ' : 'บันทึกไม่สำเร็จ';
      Alert.alert('บันทึกไม่สำเร็จ', message);
    },
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-dark-border">
            <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">
              {isEdit ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color="#9CA3AF" />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="p-4 gap-4">
            <TextField label="ชื่อ *" value={name} onChangeText={setName} />
            <TextField label="เบอร์โทร" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <TextField label="อีเมล" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextField label="ที่อยู่" value={address} onChangeText={setAddress} multiline numberOfLines={2} />
            <TextField label="หมายเหตุ" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
          </ScrollView>

          <View className="p-4 border-t border-border dark:border-dark-border">
            <Button label="บันทึก" onPress={() => save.mutate()} disabled={!name} loading={save.isPending} />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
