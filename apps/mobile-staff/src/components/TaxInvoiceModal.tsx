import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { FileText, Send, X } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useThemeColors } from '@/lib/theme';
import type { Order } from '@/types/pos';

interface TaxInvoice {
  number: string;
  issuedAt: string;
  orderNumber: string;
  seller: { name: string; address: string; taxId: string; branch: string };
  buyer: { name: string; address: string; taxId: string; branch: string };
  totals: { subtotalExVat: number; discount: number; baseExVat: number; serviceCharge: number; vatRate: number; vat: number; total: number };
  text: string;
}

interface Props {
  order: Order;
  visible: boolean;
  onClose: () => void;
}

const apiError = (error: unknown) =>
  isAxiosError(error) ? (error.response?.data?.error as string | undefined) ?? 'ออกใบกำกับภาษีไม่สำเร็จ' : 'ออกใบกำกับภาษีไม่สำเร็จ';

/** Issue, review, and share a Thai full tax invoice without leaving the order. */
export function TaxInvoiceModal({ order, visible, onClose }: Props) {
  const t = useThemeColors();
  const qc = useQueryClient();
  const [invoice, setInvoice] = useState<TaxInvoice | null>(null);
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [branch, setBranch] = useState('สำนักงานใหญ่');

  const existing = !!order.taxInvoiceNo;
  const existingQuery = useQuery({
    queryKey: ['tax-invoice', order.id],
    queryFn: async () => (await api.get(`/orders/${order.id}/tax-invoice`)).data as TaxInvoice,
    enabled: visible && existing,
  });

  useEffect(() => {
    if (!visible) return;
    setInvoice(existingQuery.data ?? null);
    setName(order.customerName ?? order.customer?.name ?? '');
    setTaxId(order.customerTaxId ?? '');
    setAddress(order.customerAddress ?? '');
    setBranch(order.customerBranch ?? 'สำนักงานใหญ่');
  }, [visible, order, existingQuery.data]);

  const issue = useMutation({
    mutationFn: async () => (await api.post(`/orders/${order.id}/tax-invoice`, {
      customerName: name.trim(), customerTaxId: taxId.trim(), customerAddress: address.trim(), customerBranch: branch.trim() || undefined,
    })).data as TaxInvoice,
    onSuccess: (data) => {
      setInvoice(data);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['tax-invoice', order.id] });
    },
    onError: (error) => Alert.alert('ออกใบกำกับภาษีไม่สำเร็จ', apiError(error)),
  });

  const shown = invoice ?? existingQuery.data;
  const share = async () => {
    if (!shown) return;
    try {
      await Share.share({ message: shown.text });
    } catch {
      Alert.alert('แชร์ไม่สำเร็จ', 'ลองอีกครั้ง');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
          <Pressable className="max-h-[92%] rounded-t-[16px] bg-card dark:bg-dark-card" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3.5 dark:border-dark-border">
              <View className="flex-row items-center gap-2">
                <FileText size={19} color={t.primary} />
                <View>
                  <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ใบกำกับภาษีเต็มรูป</Text>
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">อ้างอิงบิล #{order.orderNumber}</Text>
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={12} className="h-11 w-11 items-center justify-center" accessibilityLabel="ปิด">
                <X size={21} color={t.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView contentContainerClassName="gap-4 p-4 pb-7" keyboardShouldPersistTaps="handled">
              {shown ? (
                <>
                  <View className="gap-1 rounded-[10px] border border-primary bg-primary-50 p-3 dark:bg-dark-muted">
                    <Text className="text-[11px] font-semibold text-primary">ออกเอกสารแล้ว</Text>
                    <Text selectable className="text-[17px] font-bold text-foreground dark:text-dark-foreground">{shown.number}</Text>
                    <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ผู้ซื้อ: {shown.buyer.name} · {shown.buyer.branch}</Text>
                  </View>
                  <View className="gap-2 rounded-[10px] border border-border bg-background p-3 dark:border-dark-border dark:bg-dark-background">
                    <InvoiceRow label="ก่อน VAT" value={formatCurrency(shown.totals.baseExVat)} />
                    <InvoiceRow label={`VAT ${shown.totals.vatRate}%`} value={formatCurrency(shown.totals.vat)} />
                    {shown.totals.serviceCharge > 0 ? <InvoiceRow label="ค่าบริการ" value={formatCurrency(shown.totals.serviceCharge)} /> : null}
                    <View className="h-px bg-border dark:bg-dark-border" />
                    <InvoiceRow label="รวมทั้งสิ้น" value={formatCurrency(shown.totals.total)} bold />
                  </View>
                  <Pressable onPress={share} className="h-12 flex-row items-center justify-center gap-2 rounded-[10px] bg-primary active:opacity-80">
                    <Send size={17} color="#FFFFFF" />
                    <Text className="text-[14px] font-bold text-white">แชร์ใบกำกับภาษี</Text>
                  </Pressable>
                  <Text selectable className="rounded-[10px] bg-muted p-3 font-mono text-[11px] leading-5 text-foreground dark:bg-dark-muted dark:text-dark-foreground">{shown.text}</Text>
                </>
              ) : (
                <>
                  <Text className="text-[13px] leading-5 text-muted-foreground dark:text-dark-muted-foreground">กรอกข้อมูลผู้ซื้อให้ครบก่อนออกเอกสาร ข้อมูลจะถูกล็อกหลังออกใบกำกับภาษี</Text>
                  <Field label="ชื่อผู้ซื้อ / บริษัท" value={name} onChangeText={setName} placeholder="เช่น บริษัท ตัวอย่าง จำกัด" />
                  <Field label="เลขประจำตัวผู้เสียภาษี 13 หลัก" value={taxId} onChangeText={setTaxId} placeholder="0-0000-00000-00-0" keyboardType="number-pad" maxLength={13} />
                  <Field label="ที่อยู่" value={address} onChangeText={setAddress} placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" multiline />
                  <Field label="สาขา" value={branch} onChangeText={setBranch} placeholder="สำนักงานใหญ่ หรือ 00001" />
                  <Pressable
                    onPress={() => issue.mutate()}
                    disabled={issue.isPending || !name.trim() || !taxId.trim() || !address.trim()}
                    className={`h-12 items-center justify-center rounded-[10px] bg-primary ${issue.isPending || !name.trim() || !taxId.trim() || !address.trim() ? 'opacity-50' : ''}`}
                  >
                    <Text className="text-[14px] font-bold text-white">{issue.isPending ? 'กำลังออกเอกสาร…' : 'ออกใบกำกับภาษี'}</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, multiline, ...props }: { label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  const t = useThemeColors();
  return (
    <View className="gap-1.5">
      <Text className="text-[12px] font-semibold text-foreground dark:text-dark-foreground">{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={t.placeholder}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`rounded-[10px] border border-border bg-background px-3 text-[14px] text-foreground dark:border-dark-border dark:bg-dark-background dark:text-dark-foreground ${multiline ? 'min-h-[88px] py-3' : 'h-12'}`}
      />
    </View>
  );
}

function InvoiceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <View className="flex-row justify-between"><Text className={`text-[13px] ${bold ? 'font-bold text-foreground dark:text-dark-foreground' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>{label}</Text><Text className={`text-[13px] ${bold ? 'font-bold' : 'font-medium'} text-foreground dark:text-dark-foreground`}>{value}</Text></View>;
}
