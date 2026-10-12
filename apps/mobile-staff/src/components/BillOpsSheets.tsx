import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { X, ArrowLeft, Minus, Plus, Check, AlertTriangle, ArrowRight } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatElapsedMinutes } from '@/lib/format';
import { uuid } from '@/lib/uuid';
import { useIsTablet } from '@/hooks/useIsTablet';
import { sheetClasses } from '@/lib/layout';
import { useThemeColors } from '@/lib/theme';
import { useCart } from '@/stores/cart.store';
import { tableStatusColor, TABLE_STATUS_LABEL } from '@/constants/tableStatus';
import type { Order, OrderItem, RestaurantTable } from '@/types/pos';

/* ------------------------------------------------------------------ shared */

export type BillOp = 'move' | 'merge' | 'split';

export const BILL_OP_LABEL: Record<BillOp, string> = {
  move: 'ย้ายโต๊ะ',
  merge: 'รวมบิล',
  split: 'แยกบิล',
};

const OPEN_STATUSES = ['PENDING', 'PREPARING', 'READY'];

/** Mirrors the server's loadOpenBill rule: PENDING/PREPARING/READY and nothing paid yet. */
export const isOpenBill = (o: Pick<Order, 'status' | 'payments'>) =>
  OPEN_STATUSES.includes(o.status) && (o.payments?.length ?? 0) === 0;

export const liveQty = (i: OrderItem) => Math.max(0, i.quantity - (i.refundedQty || 0));
export const liveItemCount = (o: Order) => o.items.reduce((s, i) => s + liveQty(i), 0);

/** Bills carrying a promotion / points / stamps are refused by the server's merge. */
const hasPerk = (o: Order) =>
  !!o.promotionName || Number(o.promotionDiscount ?? 0) > 0 || (o.pointsRedeemed ?? 0) > 0 || (o.stampsRedeemed ?? 0) > 0;

class OfflineError extends Error {}

async function ensureOnline() {
  const net = await NetInfo.fetch();
  if (net.isConnected === false) throw new OfflineError();
}

const OFFLINE_MSG = 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต — ย้ายโต๊ะ/รวมบิล/แยกบิลต้องออนไลน์ ลองใหม่เมื่อมีสัญญาณ';

function describeError(err: unknown): string {
  if (err instanceof OfflineError) return OFFLINE_MSG;
  if (isAxiosError(err)) {
    if (!err.response) return OFFLINE_MSG;
    return (err.response.data?.error as string | undefined) ?? 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง';
  }
  return 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง';
}

function invalidateBills(qc: QueryClient) {
  // ['orders'] also covers ['orders','open-by-table',…] and ['orders','open-all'].
  qc.invalidateQueries({ queryKey: ['orders'] });
  qc.invalidateQueries({ queryKey: ['kds-orders'] });
  qc.invalidateQueries({ queryKey: ['tables'] });
}

/** An Idempotency-Key per distinct request: stays the same on a retry of identical input after a
 * dropped connection, but must change whenever the input changes (or after a server rejection). */
function useIdemKey() {
  const ref = useRef(uuid());
  return {
    get: () => ref.current,
    reset: () => {
      ref.current = uuid();
    },
  };
}

/** Open (unpaid) bills of the whole store. */
export function useOpenBills(enabled = true) {
  return useQuery({
    queryKey: ['orders', 'open-all'],
    queryFn: async () => (await api.get('/orders/open')).data as Order[],
    enabled,
  });
}

/** Tables that carry no open bill (valid targets for move / split). */
function useFreeTables(excludeTableId?: string | null) {
  const tablesQ = useQuery({
    queryKey: ['tables'],
    queryFn: async () => (await api.get('/tables')).data as RestaurantTable[],
  });
  const billsQ = useOpenBills();
  const free = useMemo(() => {
    const busy = new Set((billsQ.data ?? []).map((o) => o.table?.id).filter(Boolean) as string[]);
    return (tablesQ.data ?? []).filter((tb) => !busy.has(tb.id) && tb.id !== excludeTableId);
  }, [tablesQ.data, billsQ.data, excludeTableId]);
  return { free, isLoading: tablesQ.isLoading || billsQ.isLoading, isError: tablesQ.isError || billsQ.isError };
}

/* --------------------------------------------------- cart-store consistency */

/** The cart was working on `order` and it moved: follow it to the new table. */
function reconcileMove(orderId: string, newTableId?: string | null) {
  const c = useCart.getState();
  if (c.openOrderId === orderId && newTableId) c.setTable(newTableId);
}

/** Sources are cancelled: if the cart pointed at one, re-point it (and its table) to the merged bill. */
function reconcileMerge(target: Order, sourceIds: string[]) {
  const c = useCart.getState();
  if (c.openOrderId && sourceIds.includes(c.openOrderId)) {
    c.setOpenOrder(target.id);
    if (target.table?.id) c.setTable(target.table.id);
  }
}

/** Point the POS at a bill and open it. Unsent items are kept only if the bill is at the same table. */
export function useGoToBill() {
  const router = useRouter();
  return (bill: Order) => {
    const c = useCart.getState();
    const tableId = bill.table?.id;
    if (c.tableId !== tableId) {
      c.clearItems();
      c.clearAdjustments();
      c.setPendingOpenOp(undefined);
    } else if (c.openOrderId !== bill.id) {
      c.clearAdjustments();
    }
    c.setType('DINE_IN');
    c.setTable(tableId);
    c.setOpenOrder(bill.id);
    router.push('/pos');
  };
}

/* --------------------------------------------------------------- UI pieces */

function ViewHeader({ title, subtitle, onBack, onClose }: { title: string; subtitle?: string; onBack?: () => void; onClose: () => void }) {
  const t = useThemeColors();
  return (
    <View className="flex-row items-center justify-between gap-2">
      <View className="flex-1 flex-row items-center gap-2">
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12}>
            <ArrowLeft size={20} color={t.mutedForeground} />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">{title}</Text>
          {subtitle ? <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{subtitle}</Text> : null}
        </View>
      </View>
      <Pressable onPress={onClose} hitSlop={12}>
        <X size={22} color={t.mutedForeground} />
      </Pressable>
    </View>
  );
}

function ErrorBox({ message }: { message: string | null }) {
  const t = useThemeColors();
  if (!message) return null;
  return (
    <View className="flex-row items-start gap-2 rounded-[10px] border border-danger bg-card p-3 dark:bg-dark-card">
      <AlertTriangle size={16} color={t.danger} />
      <Text className="flex-1 text-[13px] text-danger dark:text-dark-danger">{message}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const off = disabled || busy;
  return (
    <Pressable onPress={onPress} disabled={off} className={`h-12 items-center justify-center rounded-[10px] bg-primary ${off ? 'opacity-50' : ''}`}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[15px] font-semibold text-white">{label}</Text>}
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="h-11 items-center justify-center rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
      <Text className="text-[14px] font-medium text-foreground dark:text-dark-foreground">{label}</Text>
    </Pressable>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function TableGrid({ tables, selectedId, onSelect }: { tables: RestaurantTable[]; selectedId?: string; onSelect: (t: RestaurantTable) => void }) {
  const t = useThemeColors();
  return (
    <View className="gap-2">
      {chunk(tables, 4).map((row, ri) => (
        <View key={ri} className="flex-row gap-2">
          {row.map((tb) => {
            const c = tableStatusColor(tb.status, t.isDark);
            const active = tb.id === selectedId;
            return (
              <Pressable
                key={tb.id}
                onPress={() => onSelect(tb)}
                style={{ backgroundColor: c.bg, borderColor: active ? t.primary : c.border, borderWidth: active ? 2 : 1 }}
                className="aspect-square flex-1 items-center justify-center rounded-[10px]"
              >
                <Text style={{ color: c.fg }} className="text-[15px] font-bold">{tb.number}</Text>
                <Text style={{ color: c.fg }} className="text-[9px]">{TABLE_STATUS_LABEL[tb.status]}</Text>
              </Pressable>
            );
          })}
          {Array.from({ length: 4 - row.length }).map((_, i) => (
            <View key={`pad${i}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

function QtyStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const t = useThemeColors();
  const btn = 'h-9 w-9 items-center justify-center rounded-lg border border-border bg-card dark:border-dark-border dark:bg-dark-card';
  return (
    <View className="flex-row items-center gap-2.5">
      <Pressable onPress={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} hitSlop={6} className={`${btn} ${value <= 0 ? 'opacity-40' : ''}`}>
        <Minus size={16} color={t.mutedForeground} />
      </Pressable>
      <Text className="w-7 text-center text-[16px] font-bold text-foreground dark:text-dark-foreground">{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} hitSlop={6} className={`${btn} ${value >= max ? 'opacity-40' : ''}`}>
        <Plus size={16} color={t.mutedForeground} />
      </Pressable>
    </View>
  );
}

const tableLabel = (o: Pick<Order, 'table'>) => (o.table ? `โต๊ะ ${o.table.number}` : 'ไม่มีโต๊ะ');

/* ------------------------------------------------------------------- views */

interface ViewProps {
  order: Order;
  /** Back to whatever opened the view (omit when the view is the whole modal). */
  onBack?: () => void;
  /** Close everything. */
  onClose: () => void;
}

/** ย้ายโต๊ะ — POST /orders/:id/move-table */
export function MoveTableView({ order, onBack, onClose }: ViewProps) {
  const qc = useQueryClient();
  const idem = useIdemKey();
  const { free, isLoading, isError } = useFreeTables(order.table?.id);
  const [sel, setSel] = useState<RestaurantTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      await ensureOnline();
      const res = await api.post(`/orders/${order.id}/move-table`, { tableId: sel!.id }, { headers: { 'Idempotency-Key': idem.get() } });
      return res.data as Order;
    },
    onSuccess: (updated) => {
      reconcileMove(order.id, updated.table?.id ?? sel?.id);
      invalidateBills(qc);
      onClose();
      Alert.alert('ย้ายโต๊ะแล้ว', `บิล #${order.orderNumber} อยู่ที่โต๊ะ ${updated.table?.number ?? sel?.number ?? ''}`);
    },
    onError: (err) => {
      setError(describeError(err));
      if (isAxiosError(err) && err.response) idem.reset();
    },
  });

  return (
    <>
      <ViewHeader title="ย้ายโต๊ะ" subtitle={`บิล #${order.orderNumber} · ${tableLabel(order)}`} onBack={onBack} onClose={onClose} />
      <ScrollView className="shrink" contentContainerClassName="gap-3 pb-1" keyboardShouldPersistTaps="handled">
        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">เลือกโต๊ะปลายทาง (แสดงเฉพาะโต๊ะที่ไม่มีบิลค้างอยู่)</Text>
        {isLoading ? (
          <ActivityIndicator className="py-6" />
        ) : isError ? (
          <Text className="py-4 text-center text-[13px] text-danger dark:text-dark-danger">โหลดรายการโต๊ะไม่สำเร็จ ลองใหม่อีกครั้ง</Text>
        ) : free.length === 0 ? (
          <Text className="py-6 text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีโต๊ะว่างให้ย้าย</Text>
        ) : (
          <TableGrid
            tables={free}
            selectedId={sel?.id}
            onSelect={(tb) => {
              setSel(tb);
              setError(null);
              idem.reset();
            }}
          />
        )}
        {sel ? (
          <View className="rounded-[10px] bg-primary-50 px-3.5 py-2.5 dark:bg-dark-muted">
            <Text className="text-[13px] text-foreground dark:text-dark-foreground">
              ย้ายบิล #{order.orderNumber} จาก {tableLabel(order)} ไปโต๊ะ {sel.number}
            </Text>
          </View>
        ) : null}
        <ErrorBox message={error} />
      </ScrollView>
      <PrimaryButton label={sel ? `ยืนยันย้ายไปโต๊ะ ${sel.number}` : 'เลือกโต๊ะปลายทาง'} disabled={!sel} busy={run.isPending} onPress={() => run.mutate()} />
    </>
  );
}

/** รวมบิล — POST /orders/:id/merge {sourceOrderIds} (this bill is the target) */
export function MergeView({ order, onBack, onClose }: ViewProps) {
  const t = useThemeColors();
  const qc = useQueryClient();
  const idem = useIdemKey();
  const { data: all = [], isLoading, isError } = useOpenBills();
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = useMemo(() => {
    const same = order.table?.id;
    return all
      .filter((o) => o.id !== order.id && isOpenBill(o))
      .sort((a, b) => Number(b.table?.id === same) - Number(a.table?.id === same) || a.createdAt.localeCompare(b.createdAt));
  }, [all, order.id, order.table?.id]);
  const chosen = others.filter((o) => picked.includes(o.id));
  const targetHasPerk = hasPerk(order);

  const run = useMutation({
    mutationFn: async () => {
      await ensureOnline();
      const ids = chosen.map((o) => o.id);
      const res = await api.post(`/orders/${order.id}/merge`, { sourceOrderIds: ids }, { headers: { 'Idempotency-Key': idem.get() } });
      return { merged: res.data as Order, ids };
    },
    onSuccess: ({ merged, ids }) => {
      reconcileMerge(merged, ids);
      invalidateBills(qc);
      onClose();
      Alert.alert('รวมบิลแล้ว', `รวม ${ids.length} บิลเข้าเป็นบิล #${merged.orderNumber} · ยอด ${formatCurrency(merged.total)}`);
    },
    onError: (err) => {
      setError(describeError(err));
      setConfirming(false); // show the server's reason next to the selection so it can be changed
      if (isAxiosError(err) && err.response) idem.reset();
    },
  });

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setError(null);
    idem.reset();
  }

  if (confirming) {
    return (
      <>
        <ViewHeader title="ยืนยันรวมบิล" subtitle={`รวมเข้าบิล #${order.orderNumber} · ${tableLabel(order)}`} onBack={() => setConfirming(false)} onClose={onClose} />
        <ScrollView className="shrink" contentContainerClassName="gap-3 pb-1">
          <View className="gap-1.5 rounded-[10px] border border-border bg-card p-3 dark:border-dark-border dark:bg-dark-card">
            <Text className="text-[11px] font-semibold tracking-wider text-muted-foreground dark:text-dark-muted-foreground">บิลที่จะถูกรวมและยกเลิก</Text>
            {chosen.map((o) => (
              <View key={o.id} className="flex-row justify-between">
                <Text className="text-[13px] text-foreground dark:text-dark-foreground">#{o.orderNumber} · {tableLabel(o)}</Text>
                <Text className="text-[13px] text-foreground dark:text-dark-foreground">{formatCurrency(o.total)}</Text>
              </View>
            ))}
          </View>
          <Text className="text-[13px] text-foreground dark:text-dark-foreground">
            รายการทั้งหมดจะย้ายมาอยู่ในบิล #{order.orderNumber} และบิลต้นทางจะถูกยกเลิก (ไม่คืนสต็อก เพราะรายการยังอยู่ในบิลที่รวม) โต๊ะของบิลต้นทางจะว่างเมื่อไม่มีบิลค้าง ย้อนกลับไม่ได้
          </Text>
          <ErrorBox message={error} />
        </ScrollView>
        <PrimaryButton label={`ยืนยันรวม ${chosen.length} บิล`} busy={run.isPending} onPress={() => run.mutate()} />
        <SecondaryButton label="กลับไปแก้ไข" onPress={() => setConfirming(false)} />
      </>
    );
  }

  return (
    <>
      <ViewHeader title="รวมบิล" subtitle={`รวมเข้าบิล #${order.orderNumber} · ${tableLabel(order)}`} onBack={onBack} onClose={onClose} />
      <ScrollView className="shrink" contentContainerClassName="gap-2 pb-1">
        <View className="flex-row items-start gap-2 rounded-[10px] bg-primary-50 px-3 py-2.5 dark:bg-dark-muted">
          <AlertTriangle size={14} color={t.warning} />
          <Text className="flex-1 text-[12px] text-foreground dark:text-dark-foreground">
            บิลที่ใช้โปรโมชั่น แต้ม หรือรางวัลแล้วจะรวมบิลไม่ได้ — ต้องยกเลิกส่วนลดนั้นก่อน
            {targetHasPerk ? ' (บิลนี้เองมีส่วนลดดังกล่าว จึงรวมไม่ได้)' : ''}
          </Text>
        </View>
        {isLoading ? (
          <ActivityIndicator className="py-6" />
        ) : isError ? (
          <Text className="py-4 text-center text-[13px] text-danger dark:text-dark-danger">โหลดรายการบิลไม่สำเร็จ ลองใหม่อีกครั้ง</Text>
        ) : others.length === 0 ? (
          <Text className="py-6 text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีบิลอื่นที่เปิดอยู่ให้รวม</Text>
        ) : (
          others.map((o) => {
            const on = picked.includes(o.id);
            const perk = hasPerk(o);
            return (
              <Pressable
                key={o.id}
                onPress={() => toggle(o.id)}
                className={`flex-row items-center gap-3 rounded-[10px] border p-3 ${on ? 'border-primary bg-primary-50 dark:bg-dark-muted' : 'border-border bg-card dark:border-dark-border dark:bg-dark-card'}`}
              >
                <View className={`h-5 w-5 items-center justify-center rounded border ${on ? 'border-primary bg-primary' : 'border-border dark:border-dark-border'}`}>
                  {on ? <Check size={14} color="#FFFFFF" /> : null}
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">
                    {tableLabel(o)} · #{o.orderNumber}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                    {liveItemCount(o)} รายการ · {formatElapsedMinutes(o.createdAt)}
                    {o.table?.id === order.table?.id ? ' · โต๊ะเดียวกัน' : ''}
                  </Text>
                  {perk ? <Text className="text-[11px] text-warning">มีโปรโมชั่น/แต้ม — อาจรวมไม่ได้</Text> : null}
                </View>
                <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">{formatCurrency(o.total)}</Text>
              </Pressable>
            );
          })
        )}
        <ErrorBox message={error} />
      </ScrollView>
      <PrimaryButton
        label={chosen.length > 0 ? `รวมบิลที่เลือก (${chosen.length})` : 'เลือกบิลที่จะรวม'}
        disabled={chosen.length === 0}
        onPress={() => {
          setError(null);
          setConfirming(true);
        }}
      />
    </>
  );
}

/** แยกบิล — POST /orders/:id/split → { order, newOrder } */
export function SplitView({ order, onBack, onClose }: ViewProps) {
  const t = useThemeColors();
  const qc = useQueryClient();
  const goToBill = useGoToBill();
  const idem = useIdemKey();
  const lines = useMemo(() => order.items.filter((i) => liveQty(i) > 0), [order.items]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [otherTable, setOtherTable] = useState(false);
  const [target, setTarget] = useState<RestaurantTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order: Order; newOrder: Order } | null>(null);
  const { free, isLoading: tablesLoading } = useFreeTables(order.table?.id);

  const totalLive = lines.reduce((s, i) => s + liveQty(i), 0);
  const chosenQty = lines.reduce((s, i) => s + Math.min(liveQty(i), qty[i.id] ?? 0), 0);
  const chosenAmount = lines.reduce((s, i) => s + Number(i.unitPrice) * Math.min(liveQty(i), qty[i.id] ?? 0), 0);
  const nothing = chosenQty === 0;
  const everything = chosenQty >= totalLive;
  const needTable = otherTable && !target;
  const hint = nothing
    ? 'เลือกจำนวนที่ต้องการแยกอย่างน้อย 1 รายการ'
    : everything
      ? 'แยกทั้งหมดไม่ได้ — ต้องเหลืออย่างน้อย 1 รายการในบิลเดิม (ถ้าจะย้ายทั้งบิล ให้ใช้ "ย้ายโต๊ะ")'
      : needTable
        ? 'เลือกโต๊ะปลายทางของบิลใหม่'
        : null;

  const run = useMutation({
    mutationFn: async () => {
      await ensureOnline();
      const body = {
        items: lines.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ orderItemId: i.id, qty: Math.min(liveQty(i), qty[i.id]) })),
        ...(otherTable && target ? { tableId: target.id } : {}),
      };
      const res = await api.post(`/orders/${order.id}/split`, body, { headers: { 'Idempotency-Key': idem.get() } });
      return res.data as { order: Order; newOrder: Order };
    },
    onSuccess: (data) => {
      invalidateBills(qc);
      setResult(data);
    },
    onError: (err) => {
      setError(describeError(err));
      if (isAxiosError(err) && err.response) idem.reset();
    },
  });

  function setLine(id: string, n: number) {
    setQty((m) => ({ ...m, [id]: n }));
    setError(null);
    idem.reset();
  }

  if (result) {
    const { order: kept, newOrder } = result;
    return (
      <>
        <ViewHeader title="แยกบิลสำเร็จ" onClose={onClose} />
        <View className="gap-2">
          {[{ label: 'บิลเดิม', o: kept }, { label: 'บิลใหม่', o: newOrder }].map(({ label, o }) => (
            <View key={o.id} className="flex-row items-center justify-between rounded-[10px] border border-border bg-card p-3 dark:border-dark-border dark:bg-dark-card">
              <View>
                <Text className="text-[11px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
                <Text className="text-[15px] font-bold text-foreground dark:text-dark-foreground">#{o.orderNumber}</Text>
                <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{tableLabel(o)} · {liveItemCount(o)} รายการ</Text>
              </View>
              <Text className="text-[16px] font-bold text-foreground dark:text-dark-foreground">{formatCurrency(o.total)}</Text>
            </View>
          ))}
        </View>
        <Pressable
          onPress={() => {
            goToBill(newOrder);
            onClose();
          }}
          className="h-12 flex-row items-center justify-center gap-2 rounded-[10px] bg-primary"
        >
          <Text className="text-[15px] font-semibold text-white">ไปชำระบิลใหม่</Text>
          <ArrowRight size={18} color="#FFFFFF" />
        </Pressable>
        <SecondaryButton label="เสร็จสิ้น" onPress={onBack ?? onClose} />
      </>
    );
  }

  return (
    <>
      <ViewHeader title="แยกบิล" subtitle={`บิล #${order.orderNumber} · ${tableLabel(order)}`} onBack={onBack} onClose={onClose} />
      <ScrollView className="shrink" contentContainerClassName="gap-2.5 pb-1" keyboardShouldPersistTaps="handled">
        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">เลือกจำนวนของแต่ละรายการที่จะแยกไปเป็นบิลใหม่</Text>
        {lines.map((i) => (
          <View key={i.id} className="flex-row items-center justify-between gap-2 rounded-[10px] border border-border bg-card p-3 dark:border-dark-border dark:bg-dark-card">
            <View className="flex-1">
              <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{i.product?.name ?? 'สินค้า'}</Text>
              <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                {formatCurrency(Number(i.unitPrice))} · มี {liveQty(i)}
              </Text>
              {i.variants && i.variants.length > 0 ? (
                <Text numberOfLines={1} className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                  {i.variants.map((v) => (v.name.includes(': ') ? v.name.split(': ').slice(1).join(': ') : v.name)).join(', ')}
                </Text>
              ) : null}
            </View>
            <QtyStepper value={Math.min(liveQty(i), qty[i.id] ?? 0)} max={liveQty(i)} onChange={(n) => setLine(i.id, n)} />
          </View>
        ))}

        <View className="flex-row overflow-hidden rounded-lg border border-border dark:border-dark-border">
          {[{ k: false, l: `โต๊ะเดิม${order.table ? ` (${order.table.number})` : ''}` }, { k: true, l: 'โต๊ะอื่น' }].map((o) => (
            <Pressable
              key={String(o.k)}
              onPress={() => {
                setOtherTable(o.k);
                setError(null);
                idem.reset();
              }}
              className={`h-10 flex-1 items-center justify-center ${otherTable === o.k ? 'bg-primary' : 'bg-card dark:bg-dark-card'}`}
            >
              <Text className={`text-[13px] font-semibold ${otherTable === o.k ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>{o.l}</Text>
            </Pressable>
          ))}
        </View>
        {otherTable ? (
          tablesLoading ? (
            <ActivityIndicator className="py-3" />
          ) : free.length === 0 ? (
            <Text className="py-2 text-center text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีโต๊ะว่างให้เลือก</Text>
          ) : (
            <TableGrid
              tables={free}
              selectedId={target?.id}
              onSelect={(tb) => {
                setTarget(tb);
                setError(null);
                idem.reset();
              }}
            />
          )
        ) : null}

        <View className="rounded-[10px] bg-primary-50 px-3.5 py-2.5 dark:bg-dark-muted">
          <View className="flex-row justify-between">
            <Text className="text-[13px] text-foreground dark:text-dark-foreground">ยอดส่วนที่แยก ({chosenQty} รายการ)</Text>
            <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">{formatCurrency(chosenAmount)}</Text>
          </View>
          <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">ก่อนภาษี/ค่าบริการ/ส่วนลด — ระบบคำนวณยอดจริงหลังแยก</Text>
        </View>
        {hint ? <Text className="text-[12px] text-warning">{hint}</Text> : null}
        <ErrorBox message={error} />
      </ScrollView>
      <PrimaryButton label={`แยกเป็นบิลใหม่ ${formatCurrency(chosenAmount)}`} disabled={nothing || everything || needTable} busy={run.isPending} onPress={() => run.mutate()} />
    </>
  );
}

/** Switches on the op. */
export function BillOpView({ op, ...props }: ViewProps & { op: BillOp }) {
  if (op === 'move') return <MoveTableView {...props} />;
  if (op === 'merge') return <MergeView {...props} />;
  return <SplitView {...props} />;
}

/** Standalone modal around one op view (used by OrderDetailView). */
export function BillOpsModal({ order, op, onClose }: { order: Order; op: BillOp | null; onClose: () => void }) {
  const sheet = sheetClasses(useIsTablet());
  if (!op) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className={sheet.overlay} onPress={onClose}>
        <Pressable className={`${sheet.panel} max-h-[88%] gap-3 bg-card p-5 dark:bg-dark-card`} onPress={(e) => e.stopPropagation()}>
          <BillOpView key={op} op={op} order={order} onClose={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Row of the three op buttons (outlined). */
export function BillOpButtons({ order, onPick, compact }: { order: Order; onPick: (op: BillOp) => void; compact?: boolean }): ReactNode {
  const canSplit = liveItemCount(order) >= 2;
  return (
    <View className="flex-row gap-2">
      {(['move', 'merge', 'split'] as BillOp[]).map((op) => {
        const disabled = op === 'split' && !canSplit;
        return (
          <Pressable
            key={op}
            disabled={disabled}
            onPress={() => onPick(op)}
            className={`flex-1 items-center justify-center rounded-lg border border-primary bg-card dark:bg-dark-card ${compact ? 'h-9' : 'h-11'} ${disabled ? 'opacity-40' : ''}`}
          >
            <Text className={`font-semibold text-primary dark:text-primary-400 ${compact ? 'text-[12px]' : 'text-[13px]'}`}>{BILL_OP_LABEL[op]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
