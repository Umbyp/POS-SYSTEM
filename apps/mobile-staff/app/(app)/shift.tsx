import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Modal, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { Play, Square, WifiOff, CheckCircle2 } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatTime, formatElapsedMinutes } from '@/lib/format';
import { useIsTablet } from '@/hooks/useIsTablet';
import { ACTIVE_SHIFT_KEY, useActiveShift, useMinuteTick } from '@/hooks/useShift';
import { centered, sheetClasses } from '@/lib/layout';
import { useThemeColors } from '@/lib/theme';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/Button';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import type { Shift, ShiftSummary } from '@/types/shift';

const QUICK_OPENING = [500, 1000];

const num = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

function errorMessage(err: unknown, fallback: string) {
  if (isAxiosError(err)) {
    if (!err.response) return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    return (err.response.data as { error?: string } | undefined)?.error ?? fallback;
  }
  return fallback;
}

async function requireOnline(action: string) {
  const net = await NetInfo.fetch();
  if (net.isConnected === false) {
    Alert.alert('ไม่มีอินเทอร์เน็ต', `${action}ต้องเชื่อมต่ออินเทอร์เน็ต — กรุณาเชื่อมต่อแล้วลองอีกครั้ง`);
    return false;
  }
  return true;
}

/** Reads GET /employees/shifts/:id/summary (apps/api shift-summary.ts → ShiftSummary; flat per-method fields). */
function normalizeServerSummary(raw: any, shift: Shift): ShiftSummary | null {
  if (!raw || typeof raw !== 'object' || raw.expectedCash == null) return null;
  const sales = {
    CASH: num(raw.cashSales),
    PROMPTPAY: num(raw.promptpaySales),
    TRANSFER: num(raw.transferSales),
    CARD: num(raw.cardSales),
  };
  return {
    openingCash: raw.openingCash != null ? num(raw.openingCash) : num(shift.openingCash),
    expectedCash: num(raw.expectedCash),
    orderCount: num(raw.orderCount),
    sales,
    totalSales: num(raw.totalSales),
    refundsTotal: num(raw.refundsTotal),
    discountTotal: num(raw.discountTotal),
    source: 'server',
  };
}

/** Fallback when the summary endpoint isn't available: derive from the cashier's orders since the shift started. */
async function computeSummary(shift: Shift): Promise<ShiftSummary> {
  const res = await api.get('/orders', { params: { limit: 200 } });
  const rows: any[] = res.data?.data ?? res.data ?? [];
  const start = new Date(shift.startTime).getTime();
  const mine = rows.filter((o) => o.cashierId === shift.userId && new Date(o.createdAt).getTime() >= start);
  const valid = mine.filter((o) => !['CANCELLED', 'REFUNDED', 'DRAFT'].includes(o.status));
  const sales = { CASH: 0, PROMPTPAY: 0, TRANSFER: 0, CARD: 0 };
  let discountTotal = 0;
  for (const o of valid) {
    const payments: any[] = o.payments ?? [];
    const paid = payments.reduce((a, p) => a + num(p.amount), 0);
    const change = Math.max(0, paid - num(o.total));
    for (const p of payments) {
      const key = p.method === 'CASH' ? 'CASH' : p.method === 'PROMPTPAY' ? 'PROMPTPAY' : p.method === 'CREDIT_CARD' ? 'CARD' : 'TRANSFER';
      sales[key] += num(p.amount);
    }
    sales.CASH -= p_change(payments, change);
    discountTotal += num(o.discount) + num(o.promotionDiscount);
  }
  const refundsTotal = mine.filter((o) => o.status === 'REFUNDED').reduce((a, o) => a + num(o.total), 0);
  const openingCash = num(shift.openingCash);
  return {
    openingCash,
    expectedCash: openingCash + sales.CASH,
    orderCount: valid.length,
    sales,
    totalSales: valid.reduce((a, o) => a + num(o.total), 0),
    refundsTotal,
    discountTotal,
    source: 'computed',
  };
}
// Change is always handed back in cash, so it only ever reduces the cash line.
const p_change = (payments: any[], change: number) => (payments.some((p) => p.method === 'CASH') ? change : 0);

function diffTone(diff: number) {
  if (Math.abs(diff) < 0.01) return { key: 'ok' as const, label: 'เงินสดตรงกับยอดที่ควรมี' };
  return diff > 0
    ? { key: 'over' as const, label: `เงินเกิน ${formatCurrency(diff)}` }
    : { key: 'short' as const, label: `เงินขาด ${formatCurrency(-diff)}` };
}

export default function ShiftScreen() {
  const t = useThemeColors();
  const isTablet = useIsTablet();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'current' | 'history'>('current');
  const [closed, setClosed] = useState<{ shift: Shift; expected: number; counted: number; summary: ShiftSummary | null } | null>(null);
  const qc = useQueryClient();
  const active = useActiveShift();
  useMinuteTick();

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="bg-card dark:bg-dark-card">
        <View style={centered(isTablet)}>
          <UnderlineTabs
            tabs={[{ key: 'current', label: 'กะปัจจุบัน' }, { key: 'history', label: 'ประวัติกะ' }]}
            value={tab}
            onChange={setTab}
          />
        </View>
      </View>

      {tab === 'current' ? (
        <ScrollView
          contentContainerStyle={{ padding: 14, gap: 12, ...centered(isTablet) }}
          refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => active.refetch()} tintColor={t.primary} />}
        >
          {closed ? (
            <ClosedCard
              data={closed}
              onDone={() => {
                setClosed(null);
                qc.invalidateQueries({ queryKey: ['shift-history'] });
              }}
            />
          ) : active.isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={t.primary} />
            </View>
          ) : active.isError ? (
            <View className="items-center gap-3 rounded-[10px] border border-border bg-card p-6 dark:border-dark-border dark:bg-dark-card">
              <WifiOff size={26} color={t.faint} />
              <Text className="text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">
                โหลดข้อมูลกะไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่
              </Text>
              <Button label="ลองใหม่" variant="secondary" className="w-full" onPress={() => active.refetch()} />
            </View>
          ) : active.data ? (
            <OpenShiftCard
              shift={active.data}
              onClosed={(res) => {
                setClosed(res);
                qc.invalidateQueries({ queryKey: ACTIVE_SHIFT_KEY });
              }}
            />
          ) : (
            <StartShiftCard
              onOpened={() => {
                qc.invalidateQueries({ queryKey: ACTIVE_SHIFT_KEY });
                qc.invalidateQueries({ queryKey: ['shift-history'] });
              }}
            />
          )}
        </ScrollView>
      ) : (
        <HistoryList canSeeAll={user?.role === 'OWNER' || user?.role === 'ADMIN'} selfId={user?.id} />
      )}
    </SafeAreaView>
  );
}

/* ---------------------------------- open ---------------------------------- */

function CashInput({ value, onChange, placeholder = '0.00', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const t = useThemeColors();
  return (
    <TextInput
      keyboardType="decimal-pad"
      value={value}
      onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ''))}
      placeholder={placeholder}
      placeholderTextColor={t.placeholder}
      autoFocus={autoFocus}
      className="h-14 rounded-lg border border-border bg-input px-4 text-[22px] font-bold text-foreground dark:border-dark-border dark:bg-dark-input dark:text-dark-foreground"
    />
  );
}

function StartShiftCard({ onOpened }: { onOpened: () => void }) {
  const t = useThemeColors();
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);

  async function open() {
    if (!(await requireOnline('การเปิดกะ'))) return;
    setBusy(true);
    try {
      await api.post('/employees/shifts/open', { openingCash: num(cash) });
      onOpened();
    } catch (err) {
      // "มีกะที่ยังไม่ปิดอยู่แล้ว" means another device already opened it — just refresh.
      if (isAxiosError(err) && err.response?.status === 400) onOpened();
      Alert.alert('เปิดกะไม่สำเร็จ', errorMessage(err, 'ลองใหม่อีกครั้ง'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-4 rounded-[10px] border border-border bg-card p-4 dark:border-dark-border dark:bg-dark-card">
      <View className="items-center gap-2 py-2">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-50 dark:bg-dark-muted">
          <Play size={26} color={t.primary} />
        </View>
        <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">ยังไม่ได้เปิดกะ</Text>
        <Text className="text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">
          นับเงินสดในลิ้นชักแล้วใส่เป็นเงินสดตั้งต้น เพื่อใช้กระทบยอดตอนปิดกะ
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">เงินสดตั้งต้นในลิ้นชัก</Text>
        <CashInput value={cash} onChange={setCash} />
        <View className="flex-row gap-2">
          {QUICK_OPENING.map((a) => (
            <Pressable key={a} onPress={() => setCash(String(a))} className="flex-1 items-center rounded-lg border border-border bg-card py-2.5 dark:border-dark-border dark:bg-dark-card">
              <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">฿{a.toLocaleString()}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setCash('0')} className="flex-1 items-center rounded-lg border border-border bg-card py-2.5 dark:border-dark-border dark:bg-dark-card">
            <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">฿0</Text>
          </Pressable>
        </View>
      </View>

      <Button label="เปิดกะ" onPress={open} loading={busy} />
    </View>
  );
}

/* --------------------------------- current -------------------------------- */

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className={`text-[13px] ${strong ? 'font-semibold text-foreground dark:text-dark-foreground' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>{label}</Text>
      <Text style={tone ? { color: tone } : undefined} className={`text-[14px] ${strong ? 'font-bold' : 'font-semibold'} text-foreground dark:text-dark-foreground`}>
        {value}
      </Text>
    </View>
  );
}

function OpenShiftCard({ shift, onClosed }: { shift: Shift; onClosed: (r: { shift: Shift; expected: number; counted: number; summary: ShiftSummary | null }) => void }) {
  const t = useThemeColors();
  const [closing, setClosing] = useState(false);

  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: ['shift-summary', shift.id],
    queryFn: async (): Promise<ShiftSummary> => {
      try {
        const res = await api.get(`/employees/shifts/${shift.id}/summary`);
        const s = normalizeServerSummary(res.data, shift);
        if (s) return s;
      } catch (err) {
        // 404 = older server without the endpoint → compute locally. Any other failure surfaces as an error.
        if (!(isAxiosError(err) && err.response?.status === 404)) throw err;
      }
      return computeSummary(shift);
    },
    refetchInterval: 60_000,
  });

  return (
    <>
      <View className="rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
        <View className="flex-row items-center gap-3 border-b border-border p-4 dark:border-dark-border">
          <View className="h-3 w-3 rounded-full bg-success dark:bg-dark-success" />
          <View className="flex-1">
            <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">กะเปิดอยู่</Text>
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
              เปิดเมื่อ {formatTime(shift.startTime)} · ผ่านไป {formatElapsedMinutes(shift.startTime)}
            </Text>
          </View>
        </View>
        <View className="px-4 py-2">
          <Row label="เงินสดตั้งต้น" value={formatCurrency(num(shift.openingCash))} />
        </View>
      </View>

      <View className="rounded-[10px] border border-border bg-card px-4 py-3 dark:border-dark-border dark:bg-dark-card">
        <Text className="pb-1 text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">สรุปยอดระหว่างกะ</Text>
        {isLoading ? (
          <View className="items-center py-6"><ActivityIndicator color={t.primary} /></View>
        ) : isError || !summary ? (
          <View className="items-center gap-2 py-4">
            <Text className="text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">โหลดสรุปยอดไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต</Text>
            <Pressable onPress={() => refetch()}><Text className="text-[13px] font-semibold text-primary dark:text-primary-400">ลองใหม่</Text></Pressable>
          </View>
        ) : (
          <>
            <Row label={`ออเดอร์ที่ขาย`} value={`${summary.orderCount} รายการ`} />
            <Row label="เงินสด" value={formatCurrency(summary.sales.CASH)} />
            <Row label="พร้อมเพย์" value={formatCurrency(summary.sales.PROMPTPAY)} />
            <Row label="โอนเงิน" value={formatCurrency(summary.sales.TRANSFER)} />
            <Row label="บัตร" value={formatCurrency(summary.sales.CARD)} />
            <View className="my-1 h-px bg-border dark:bg-dark-border" />
            <Row label="ยอดขายรวม" value={formatCurrency(summary.totalSales)} strong />
            {summary.discountTotal > 0 ? <Row label="ส่วนลดรวม" value={`−${formatCurrency(summary.discountTotal)}`} /> : null}
            {summary.refundsTotal > 0 ? <Row label="คืนเงิน" value={`−${formatCurrency(summary.refundsTotal)}`} /> : null}
            <View className="mt-2 flex-row items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 dark:bg-dark-muted">
              <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">เงินสดที่ควรมีในลิ้นชัก</Text>
              <Text className="text-[16px] font-bold text-primary dark:text-primary-400">{formatCurrency(summary.expectedCash)}</Text>
            </View>
          </>
        )}
      </View>

      <Button label="ปิดกะ" variant="secondary" onPress={() => setClosing(true)} />

      <CloseSheet
        visible={closing}
        shift={shift}
        summary={summary ?? null}
        onClose={() => setClosing(false)}
        onDone={(r) => {
          setClosing(false);
          onClosed(r);
        }}
      />
    </>
  );
}

function CloseSheet({ visible, shift, summary, onClose, onDone }: {
  visible: boolean;
  shift: Shift;
  summary: ShiftSummary | null;
  onClose: () => void;
  onDone: (r: { shift: Shift; expected: number; counted: number; summary: ShiftSummary | null }) => void;
}) {
  const t = useThemeColors();
  const isTablet = useIsTablet();
  const sheet = sheetClasses(isTablet);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const expected = summary?.expectedCash ?? num(shift.openingCash);
  const hasCount = counted.trim() !== '';
  const diff = num(counted) - expected;
  const tone = diffTone(diff);
  const toneColor = tone.key === 'ok' ? t.success : tone.key === 'over' ? t.warning : t.danger;

  async function submit() {
    if (!(await requireOnline('การปิดกะ'))) return;
    setBusy(true);
    try {
      const res = await api.post(`/employees/shifts/${shift.id}/close`, { closingCash: num(counted), notes: notes.trim() || undefined });
      setCounted('');
      setNotes('');
      const { summary: closeSummary, ...closedShift } = res.data as Shift & { summary?: unknown };
      // The close response carries the final server-side summary (net of change, refunds) — prefer it over the preview.
      const finalSummary = closeSummary ? normalizeServerSummary(closeSummary, shift) : summary;
      onDone({ shift: closedShift as Shift, expected: finalSummary?.expectedCash ?? expected, counted: num(counted), summary: finalSummary });
    } catch (err) {
      Alert.alert('ปิดกะไม่สำเร็จ', errorMessage(err, 'ลองใหม่อีกครั้ง'));
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    const msg = hasCount
      ? `นับเงินสดได้ ${formatCurrency(num(counted))}\n${tone.label}\n\nเมื่อปิดกะแล้วจะแก้ไขไม่ได้`
      : '';
    Alert.alert('ยืนยันปิดกะ?', msg, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ปิดกะ', style: 'destructive', onPress: submit },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className={sheet.overlay}>
        <Pressable className="absolute inset-0" onPress={onClose} />
        <SafeAreaView edges={['bottom']} className={`${sheet.panel} bg-card dark:bg-dark-card`}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View className="flex-row items-center gap-2">
              <Square size={18} color={t.danger} />
              <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">ปิดกะ</Text>
            </View>

            <View className="gap-1 rounded-lg bg-background p-3 dark:bg-dark-background">
              <Row label="เงินสดที่ควรมี" value={formatCurrency(expected)} strong />
              {summary?.source === 'computed' ? (
                <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">คำนวณจากออเดอร์ล่าสุด 200 รายการ</Text>
              ) : null}
            </View>

            <View className="gap-2">
              <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">เงินสดที่นับได้จริง</Text>
              <CashInput value={counted} onChange={setCounted} autoFocus />
              <Pressable onPress={() => setCounted(expected.toFixed(2))} className="self-start rounded-full border border-border px-3 py-1.5 dark:border-dark-border">
                <Text className="text-[12px] font-medium text-foreground dark:text-dark-foreground">ตรงกับที่ควรมี</Text>
              </Pressable>
              {hasCount ? (
                <View style={{ borderColor: toneColor }} className="flex-row items-center gap-2 rounded-lg border bg-background px-3 py-2.5 dark:bg-dark-background">
                  <View style={{ backgroundColor: toneColor }} className="h-2.5 w-2.5 rounded-full" />
                  <Text style={{ color: toneColor }} className="flex-1 text-[14px] font-bold">{tone.label}</Text>
                </View>
              ) : null}
            </View>

            <View className="gap-2">
              <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">หมายเหตุ (ไม่บังคับ)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="เช่น เงินทอนขาด / เก็บเงินเข้าตู้เซฟ"
                placeholderTextColor={t.placeholder}
                multiline
                className="min-h-[60px] rounded-lg border border-border bg-input px-3 py-2 text-[14px] text-foreground dark:border-dark-border dark:bg-dark-input dark:text-dark-foreground"
              />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1"><Button label="ยกเลิก" variant="secondary" onPress={onClose} /></View>
              <View className="flex-1"><Button label="ปิดกะ" onPress={confirm} disabled={!hasCount} loading={busy} /></View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ClosedCard({ data, onDone }: { data: { shift: Shift; expected: number; counted: number; summary: ShiftSummary | null }; onDone: () => void }) {
  const t = useThemeColors();
  const diff = data.counted - data.expected;
  const tone = diffTone(diff);
  const color = tone.key === 'ok' ? t.success : tone.key === 'over' ? t.warning : t.danger;
  const s = data.summary;
  return (
    <View className="gap-3 rounded-[10px] border border-border bg-card p-4 dark:border-dark-border dark:bg-dark-card">
      <View className="items-center gap-1.5 py-2">
        <CheckCircle2 size={36} color={t.success} />
        <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">ปิดกะเรียบร้อย</Text>
        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
          {formatTime(data.shift.startTime)} – {data.shift.endTime ? formatTime(data.shift.endTime) : ''}
        </Text>
      </View>
      <View>
        <Row label="เงินสดตั้งต้น" value={formatCurrency(num(data.shift.openingCash))} />
        {s ? <Row label="ออเดอร์ที่ขาย" value={`${s.orderCount} รายการ`} /> : null}
        <Row label="ยอดขายรวม" value={formatCurrency(num(data.shift.totalSales) || s?.totalSales || 0)} />
        <Row label="เงินสดที่ควรมี" value={formatCurrency(data.expected)} />
        <Row label="เงินสดที่นับได้" value={formatCurrency(data.counted)} strong />
      </View>
      <View style={{ borderColor: color }} className="flex-row items-center gap-2 rounded-lg border px-3 py-2.5">
        <View style={{ backgroundColor: color }} className="h-2.5 w-2.5 rounded-full" />
        <Text style={{ color }} className="flex-1 text-[14px] font-bold">{tone.label}</Text>
      </View>
      <Button label="เสร็จสิ้น" onPress={onDone} />
    </View>
  );
}

/* --------------------------------- history -------------------------------- */

function HistoryList({ canSeeAll, selfId }: { canSeeAll: boolean; selfId?: string }) {
  const t = useThemeColors();
  const isTablet = useIsTablet();
  const [userId, setUserId] = useState<string | undefined>(undefined);

  const { data: staff = [] } = useQuery({
    queryKey: ['shift-staff'],
    queryFn: async () => (await api.get('/employees')).data as { id: string; name: string; role: string; isActive: boolean }[],
    enabled: canSeeAll,
  });
  const people = useMemo(() => staff.filter((s) => s.isActive && s.role !== 'KITCHEN' && s.id !== selfId), [staff, selfId]);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['shift-history', userId ?? 'me'],
    queryFn: async () => (await api.get('/employees/shifts', { params: { userId } })).data as Shift[],
  });

  return (
    <ScrollView
      contentContainerStyle={{ padding: 14, gap: 10, ...centered(isTablet) }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={t.primary} />}
    >
      {canSeeAll && people.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {[{ id: undefined as string | undefined, name: 'ของฉัน' }, ...people].map((p) => {
            const on = userId === p.id;
            return (
              <Pressable
                key={p.id ?? 'me'}
                onPress={() => setUserId(p.id)}
                className={`min-h-[36px] justify-center rounded-full border px-3.5 ${on ? 'border-primary bg-primary-50 dark:bg-dark-muted' : 'border-border bg-card dark:border-dark-border dark:bg-dark-card'}`}
              >
                <Text className={`text-[13px] font-medium ${on ? 'text-primary dark:text-primary-400' : 'text-foreground dark:text-dark-foreground'}`}>{p.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <View className="items-center py-16"><ActivityIndicator color={t.primary} /></View>
      ) : isError ? (
        <View className="items-center gap-2 py-12">
          <Text className="text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">โหลดประวัติกะไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต</Text>
          <Pressable onPress={() => refetch()}><Text className="text-[13px] font-semibold text-primary dark:text-primary-400">ลองใหม่</Text></Pressable>
        </View>
      ) : (data ?? []).length === 0 ? (
        <Text className="py-16 text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีประวัติกะ</Text>
      ) : (
        (data ?? []).map((s) => <HistoryRow key={s.id} s={s} />)
      )}
    </ScrollView>
  );
}

function HistoryRow({ s }: { s: Shift }) {
  const t = useThemeColors();
  const isOpen = !s.endTime;
  const expected = num(s.openingCash) + num(s.cashSales);
  const diff = s.closingCash != null ? num(s.closingCash) - expected : null;
  const tone = diff != null ? diffTone(diff) : null;
  const color = !tone ? t.mutedForeground : tone.key === 'ok' ? t.success : tone.key === 'over' ? t.warning : t.danger;
  return (
    <View className="gap-1.5 rounded-[10px] border border-border bg-card p-3.5 dark:border-dark-border dark:bg-dark-card">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-[14px] font-bold text-foreground dark:text-dark-foreground" numberOfLines={1}>
          {formatDate(s.startTime)}
        </Text>
        {isOpen ? (
          <View className="rounded-full bg-success/10 px-2 py-0.5"><Text className="text-[11px] font-semibold text-success dark:text-dark-success">กำลังเปิด</Text></View>
        ) : null}
      </View>
      <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
        {s.user?.name ? `${s.user.name} · ` : ''}
        {formatTime(s.startTime)}{s.endTime ? ` – ${formatTime(s.endTime)}` : ''}
      </Text>
      <View className="flex-row justify-between pt-1">
        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ยอดขาย {formatCurrency(num(s.totalSales))}</Text>
        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">เงินสด {formatCurrency(num(s.cashSales))}</Text>
      </View>
      {tone && s.closingCash != null ? (
        <Text style={{ color }} className="text-[12px] font-semibold">
          นับได้ {formatCurrency(num(s.closingCash))} · {tone.label}
        </Text>
      ) : null}
    </View>
  );
}
