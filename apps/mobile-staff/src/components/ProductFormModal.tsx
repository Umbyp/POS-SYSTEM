import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { X, Camera } from 'lucide-react-native';
import { api } from '@/lib/api';
import { TextField } from '@/components/TextField';
import { SelectField } from '@/components/SelectField';
import { SwitchRow } from '@/components/SwitchRow';
import { Button } from '@/components/Button';
import type { Category, Product } from '@/types/pos';

interface ProductFormModalProps {
  visible: boolean;
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

export function ProductFormModal({ visible, product, categories, onClose, onSaved }: ProductFormModalProps) {
  const qc = useQueryClient();
  const isEdit = !!product;

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [description, setDescription] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [initialStock, setInitialStock] = useState('');
  const [lowStockAt, setLowStockAt] = useState('10');
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(product?.name ?? '');
    setSku(product?.sku ?? '');
    setBarcode(product?.barcode ?? '');
    setCategoryId(product?.categoryId ?? undefined);
    setCostPrice(product?.costPrice ?? '');
    setSellingPrice(product?.sellingPrice ?? '');
    setDescription(product?.description ?? '');
    setTrackStock(product?.trackStock ?? true);
    setInitialStock('');
    setLowStockAt(String(product?.inventory?.lowStockAt ?? 10));
    setImage(product?.image ?? null);
  }, [visible, product]);

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('ต้องอนุญาตเข้าถึงรูปภาพ', 'กรุณาอนุญาตการเข้าถึงคลังภาพในตั้งค่าเครื่อง');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', {
        uri: asset.uri,
        name: asset.fileName ?? 'product.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      const res = await api.post('/uploads/product-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImage(res.data.url);
    } catch (err) {
      Alert.alert('อัปโหลดรูปไม่สำเร็จ', isAxiosError(err) ? err.response?.data?.error ?? 'ลองใหม่อีกครั้ง' : 'ลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name,
        sku,
        barcode: barcode || undefined,
        categoryId,
        costPrice: Number(costPrice) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        description: description || undefined,
        image: image || undefined,
        trackStock,
      };
      if (isEdit) {
        return (await api.put(`/products/${product!.id}`, body)).data;
      }
      return (
        await api.post('/products', {
          ...body,
          initialStock: initialStock ? Number(initialStock) : undefined,
          lowStockAt: lowStockAt ? Number(lowStockAt) : undefined,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      onSaved();
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'บันทึกไม่สำเร็จ' : 'บันทึกไม่สำเร็จ';
      Alert.alert('บันทึกไม่สำเร็จ', message);
    },
  });

  const remove = useMutation({
    mutationFn: async () => api.delete(`/products/${product!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      onSaved();
    },
    onError: (err) => {
      const message = isAxiosError(err) ? err.response?.data?.error ?? 'ลบไม่สำเร็จ' : 'ลบไม่สำเร็จ';
      Alert.alert('ลบไม่สำเร็จ', message);
    },
  });

  function confirmDelete() {
    Alert.alert('ลบสินค้า', `ต้องการปิดการขาย "${product?.name}" ใช่หรือไม่?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  }

  const canSave = !!name && !!sku && !!categoryId && !!sellingPrice;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-dark-border">
            <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">
              {isEdit ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color="#9CA3AF" />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="p-4 gap-4">
            <Pressable onPress={pickImage} className="self-center">
              <View className="h-24 w-24 items-center justify-center rounded-xl bg-muted dark:bg-dark-muted overflow-hidden">
                {uploading ? (
                  <ActivityIndicator color="#C9622E" />
                ) : image ? (
                  <Image source={{ uri: image }} style={{ width: 96, height: 96 }} resizeMode="cover" />
                ) : (
                  <Camera size={26} color="#9CA3AF" />
                )}
              </View>
            </Pressable>

            <TextField label="ชื่อสินค้า *" value={name} onChangeText={setName} />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField label="SKU *" value={sku} onChangeText={setSku} autoCapitalize="characters" />
              </View>
              <View className="flex-1">
                <TextField label="บาร์โค้ด" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" />
              </View>
            </View>

            <SelectField
              label="หมวดหมู่ *"
              value={categoryId}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCategoryId}
            />

            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField label="ราคาทุน" value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" />
              </View>
              <View className="flex-1">
                <TextField label="ราคาขาย *" value={sellingPrice} onChangeText={setSellingPrice} keyboardType="decimal-pad" />
              </View>
            </View>

            <TextField label="รายละเอียด" value={description} onChangeText={setDescription} multiline numberOfLines={3} />

            <SwitchRow label="นับสต็อก" note="เปิดหากต้องการติดตามจำนวนคงเหลือ" value={trackStock} onChange={setTrackStock} />

            {!isEdit && trackStock ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField label="สต็อกเริ่มต้น" value={initialStock} onChangeText={setInitialStock} keyboardType="number-pad" />
                </View>
                <View className="flex-1">
                  <TextField label="แจ้งเตือนเมื่อต่ำกว่า" value={lowStockAt} onChangeText={setLowStockAt} keyboardType="number-pad" />
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View className="p-4 gap-2.5 border-t border-border dark:border-dark-border">
            <Button label="บันทึก" onPress={() => save.mutate()} disabled={!canSave} loading={save.isPending} />
            {isEdit ? (
              <Pressable onPress={confirmDelete} disabled={remove.isPending} className="h-11 items-center justify-center">
                <Text className="text-[14px] font-medium text-danger">ปิดการขายสินค้านี้</Text>
              </Pressable>
            ) : null}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
