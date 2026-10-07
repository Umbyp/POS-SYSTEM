import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { usePrintStation } from '@/stores/printStation.store';
import { SectionCard } from '@/components/SectionCard';
import { TextField } from '@/components/TextField';
import { SwitchRow } from '@/components/SwitchRow';

type Role = 'KITCHEN' | 'RECEIPT';

interface PrinterRow {
  id: string;
  name: string;
  ip: string;
  port: number;
  role: Role;
  autoPrint: boolean;
  copies: number;
  categoryIds: string[];
  isActive: boolean;
  status: 'ok' | 'error';
  stuckJobs: number;
  lastError: string | null;
}

interface JobRow {
  id: string;
  kind: Role;
  status: 'PENDING' | 'PRINTED' | 'FAILED';
  attempts: number;
  orderNumber: string | null;
  printer: { name: string };
}

const emptyForm = { name: '', ip: '', port: '9100', role: 'KITCHEN' as Role, copies: '1', autoPrint: true, categoryIds: [] as string[] };

const errText = (e: unknown, fallback: string) => (isAxiosError(e) ? e.response?.data?.error ?? fallback : fallback);

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3 py-1.5 ${on ? 'border-primary bg-primary' : 'border-border dark:border-dark-border'}`}
    >
      <Text className={`text-[12px] font-medium ${on ? 'text-white' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 ${primary ? 'bg-primary' : 'border border-border dark:border-dark-border'} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-[12px] font-semibold ${primary ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>{label}</Text>
    </Pressable>
  );
}

/** Print stations (settings → เครื่องพิมพ์). Everyone sees status + test print;
 * owner/admin can add/edit/delete. Printing itself happens in usePrintQueue. */
export function PrintersSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const stationEnabled = usePrintStation((s) => s.enabled);
  const setStationEnabled = usePrintStation((s) => s.setEnabled);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: printers = [] } = useQuery({
    queryKey: ['printers'],
    queryFn: async () => (await api.get('/printers')).data as PrinterRow[],
    refetchInterval: 15_000,
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ['print-jobs'],
    queryFn: async () => (await api.get('/print-jobs', { params: { limit: 15 } })).data as JobRow[],
    refetchInterval: 15_000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/products/categories')).data as { id: string; name: string }[],
    enabled: canEdit,
  });
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '?';

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['printers'] });
    qc.invalidateQueries({ queryKey: ['print-jobs'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(), ip: form.ip.trim(), port: Number(form.port) || 9100, role: form.role,
        copies: Math.min(5, Math.max(1, Number(form.copies) || 1)), autoPrint: form.autoPrint,
        categoryIds: form.role === 'KITCHEN' ? form.categoryIds : [],
      };
      return editingId === 'new' ? api.post('/printers', body) : api.patch(`/printers/${editingId}`, body);
    },
    onSuccess: () => { setEditingId(null); refresh(); },
    onError: (e) => Alert.alert('บันทึกไม่สำเร็จ', errText(e, 'บันทึกไม่สำเร็จ')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/printers/${id}`),
    onSuccess: refresh,
    onError: (e) => Alert.alert('ลบไม่สำเร็จ', errText(e, 'ลบไม่สำเร็จ')),
  });

  const test = useMutation({
    mutationFn: async (id: string) => api.post(`/printers/${id}/test`),
    onSuccess: () => { Alert.alert('ส่งงานพิมพ์ทดสอบแล้ว', 'เครื่องนี้จะพิมพ์ให้ภายในไม่กี่วินาที'); refresh(); },
    onError: (e) => Alert.alert('ส่งไม่สำเร็จ', errText(e, 'ส่งไม่สำเร็จ')),
  });

  const retry = useMutation({
    mutationFn: async (id: string) => api.post(`/print-jobs/${id}/reprint`, {}),
    onSuccess: refresh,
    onError: (e) => Alert.alert('ส่งไม่สำเร็จ', errText(e, 'ส่งไม่สำเร็จ')),
  });

  const startEdit = (p: PrinterRow) => {
    setEditingId(p.id);
    setForm({ name: p.name, ip: p.ip, port: String(p.port), role: p.role, copies: String(p.copies), autoPrint: p.autoPrint, categoryIds: p.categoryIds });
  };
  const toggleCat = (id: string) =>
    setForm((f) => ({ ...f, categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((c) => c !== id) : [...f.categoryIds, id] }));

  const stuck = jobs.filter((j) => j.status !== 'PRINTED' && j.attempts > 0);

  const formView = (
    <View className="gap-3 rounded-xl border border-border dark:border-dark-border p-3">
      <TextField label="ชื่อสถานี" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="เช่น ครัวหลัง, บาร์น้ำ" />
      <View className="flex-row gap-2">
        <Chip label="ใบสั่งครัว" on={form.role === 'KITCHEN'} onPress={() => setForm({ ...form, role: 'KITCHEN' })} />
        <Chip label="ใบเสร็จ" on={form.role === 'RECEIPT'} onPress={() => setForm({ ...form, role: 'RECEIPT' })} />
      </View>
      <TextField label="IP เครื่องพิมพ์" value={form.ip} onChangeText={(v) => setForm({ ...form, ip: v })} placeholder="192.168.1.40" keyboardType="decimal-pad" />
      <View className="flex-row gap-3">
        <View className="flex-1"><TextField label="พอร์ต" value={form.port} onChangeText={(v) => setForm({ ...form, port: v })} keyboardType="number-pad" /></View>
        <View className="flex-1"><TextField label="จำนวนใบ" value={form.copies} onChangeText={(v) => setForm({ ...form, copies: v })} keyboardType="number-pad" /></View>
      </View>
      <SwitchRow label="พิมพ์อัตโนมัติ" value={form.autoPrint} onChange={(v) => setForm({ ...form, autoPrint: v })} />
      {form.role === 'KITCHEN' ? (
        <View className="gap-2">
          <Text className="text-[13px] font-medium text-muted-foreground dark:text-dark-muted-foreground">หมวดที่พิมพ์ (ไม่เลือก = ทุกหมวด)</Text>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} on={form.categoryIds.includes(c.id)} onPress={() => toggleCat(c.id)} />
            ))}
          </View>
        </View>
      ) : null}
      <View className="flex-row justify-end gap-2">
        <SmallButton label="ยกเลิก" onPress={() => setEditingId(null)} />
        <SmallButton label="บันทึก" primary onPress={() => save.mutate()} disabled={save.isPending || !form.name.trim() || !form.ip.trim()} />
      </View>
    </View>
  );

  return (
    <>
      <SectionCard title="สถานีพิมพ์">
        <SwitchRow
          label="เครื่องนี้รับงานพิมพ์"
          note="เปิดไว้บนเครื่องที่ต่อ WiFi ร้านเดียวกับเครื่องพิมพ์ — ระบบจะพิมพ์ใบครัว/ใบเสร็จให้อัตโนมัติ"
          value={stationEnabled}
          onChange={setStationEnabled}
        />

        {printers.length === 0 && editingId !== 'new' ? (
          <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
            ยังไม่มีสถานีพิมพ์ — ถ้าไม่เพิ่ม จะใช้ IP เครื่องพิมพ์เดิมด้านล่าง
          </Text>
        ) : null}

        {printers.map((p) =>
          editingId === p.id ? (
            <View key={p.id}>{formView}</View>
          ) : (
            <View key={p.id} className="flex-row items-center gap-3 rounded-xl border border-border dark:border-dark-border p-3">
              <View className={`h-2.5 w-2.5 rounded-full ${!p.isActive ? 'bg-[#C4B2A1]' : p.status === 'ok' ? 'bg-[#047857]' : 'bg-[#B91C1C]'}`} />
              <View className="flex-1">
                <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">
                  {p.name}{p.role === 'RECEIPT' ? ' (ใบเสร็จ)' : ''}{!p.isActive ? ' · ปิดใช้งาน' : ''}
                </Text>
                <Text className={`text-[11px] ${p.status === 'error' ? 'text-[#B91C1C]' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>
                  {p.ip}:{p.port}
                  {p.status === 'error'
                    ? ` · ค้าง ${p.stuckJobs} งาน`
                    : p.role === 'KITCHEN'
                      ? ` · ${p.categoryIds.length ? p.categoryIds.map(catName).join(', ') : 'ทุกหมวด'}`
                      : ''}
                  {!p.autoPrint ? ' · ไม่พิมพ์อัตโนมัติ' : ''}
                </Text>
              </View>
              <SmallButton label="ทดสอบ" onPress={() => test.mutate(p.id)} disabled={!p.isActive || test.isPending} />
              {canEdit ? (
                <>
                  <SmallButton label="แก้ไข" onPress={() => startEdit(p)} />
                  <SmallButton
                    label="ลบ"
                    onPress={() =>
                      Alert.alert('ลบสถานีพิมพ์', `ลบ "${p.name}"?`, [
                        { text: 'ยกเลิก', style: 'cancel' },
                        { text: 'ลบ', style: 'destructive', onPress: () => remove.mutate(p.id) },
                      ])
                    }
                  />
                </>
              ) : null}
            </View>
          )
        )}

        {canEdit ? (
          editingId === 'new' ? (
            formView
          ) : (
            <Pressable
              onPress={() => { setEditingId('new'); setForm(emptyForm); }}
              className="items-center rounded-xl border border-dashed border-border dark:border-dark-border py-3"
            >
              <Text className="text-[13px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">+ เพิ่มสถานีพิมพ์</Text>
            </Pressable>
          )
        ) : null}
      </SectionCard>

      {stuck.length > 0 ? (
        <SectionCard title={`คิวงานพิมพ์ — ค้าง ${stuck.length} งาน`}>
          {stuck.map((j) => (
            <View key={j.id} className="flex-row items-center gap-3">
              <View className="h-8 w-1 rounded bg-[#B91C1C]" />
              <View className="flex-1">
                <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">
                  {j.kind === 'RECEIPT' ? 'ใบเสร็จ' : 'ใบครัว'} #{j.orderNumber?.split('-').pop() ?? '—'} → {j.printer.name}
                </Text>
                <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">ลองแล้ว {j.attempts} ครั้ง</Text>
              </View>
              <SmallButton label="ลองใหม่" onPress={() => retry.mutate(j.id)} />
            </View>
          ))}
        </SectionCard>
      ) : null}
    </>
  );
}
