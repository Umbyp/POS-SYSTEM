import { useEffect, useMemo, useState } from 'react';
import { Platform, View, Text, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Printer } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { SpineGauge } from '@/components/Spine';
import { useIsTablet } from '@/hooks/useIsTablet';
import { printKitchenTicket, PrinterError } from '@/lib/printer';
import type { Order, OrderStatus } from '@/types/pos';
import type { StoreSettings } from '@/types/backoffice';

const TABS: { key: OrderStatus; label: string }[] = [
  { key: 'PENDING', label: 'รอทำ' },
  { key: 'PREPARING', label: 'กำลังทำ' },
  { key: 'READY', label: 'พร้อมเสิร์ฟ' },
];

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  PENDING: { label: 'เริ่มทำ', next: 'PREPARING' },
  PREPARING: { label: 'เสร็จแล้ว', next: 'READY' },
};

// KDS is always dark (kitchen-wall display), independent of system theme.
const K = { bg: '#23180F', card: '#2F2117', card2: '#3B2A1E', border: '#4A3627', fg: '#FBF6F0', muted: '#B9A392' };
const SPINE = { PENDING: '#FBBF24', PREPARING: '#60A5FA', READY: '#4ADE80', overdue: '#F87171' };
const ALLOWED_SEC = 15 * 60;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export default function KdsScreen() {
  const qc = useQueryClient();
  const isTablet = useIsTablet();
  const columns = isTablet ? 2 : 1;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const [tab, setTab] = useState<OrderStatus>('PENDING');
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching, isError } = useQuery({
    queryKey: ['kds-orders'],
    queryFn: async () => {
      const res = await api.get('/orders', { params: { status: 'PENDING,PREPARING,READY', limit: 150 } });
      return res.data as { data: Order[] };
    },
    refetchInterval: 10000,
  });

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data as StoreSettings,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) =>
      (await api.patch(`/orders/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-orders'] }),
  });

  const orders = data?.data ?? [];
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, orders.filter((o) => o.status === t.key).length])),
    [orders]
  );
  const filtered = useMemo(
    () => orders.filter((o) => o.status === tab).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [orders, tab]
  );

  async function onReprint(order: Order) {
    if (!store) return;
    setPrintingId(order.id);
    try {
      await printKitchenTicket(store, order);
    } catch (err) {
      const message = err instanceof PrinterError ? err.message : 'พิมพ์ไม่สำเร็จ — ตรวจสอบว่ามือถือต่อ WiFi เดียวกับเครื่องพิมพ์';
      Alert.alert('พิมพ์ไม่สำเร็จ', message);
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <SafeAreaView style={{ backgroundColor: K.bg }} className="flex-1" edges={['bottom', 'left', 'right']}>
      <View style={{ borderBottomColor: K.border }} className="flex-row items-center justify-between gap-3 border-b px-4 py-3">
        <View className="flex-row gap-2 flex-shrink">
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{ backgroundColor: tab === t.key ? '#B45309' : K.card2 }}
              className="items-center rounded-[10px] px-3.5 py-2.5"
            >
              <Text style={{ color: tab === t.key ? '#FFFFFF' : K.fg }} className={`text-[14px] ${tab === t.key ? 'font-bold' : 'font-semibold'}`}>
                {t.label} {counts[t.key] ?? 0}
              </Text>
            </Pressable>
          ))}
        </View>
        {isTablet ? (
          <View className="flex-row items-center gap-3.5">
            <View className="flex-row items-center gap-1.5">
              <View style={{ backgroundColor: isError ? '#F87171' : '#4ADE80' }} className="h-2 w-2 rounded-full" />
              <Text style={{ color: K.muted }} className="text-[13px] font-semibold">{isError ? 'ขาดการเชื่อมต่อ' : 'เชื่อมต่อแล้ว'}</Text>
            </View>
            <Text style={{ color: K.muted }} className="text-[13px] font-semibold">{formatTime(new Date(now).toISOString())}</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: isError ? '#F87171' : '#4ADE80' }} className="h-2 w-2 rounded-full" />
        )}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C9622E" />
        </View>
      ) : (
        <FlatList
          key={columns}
          data={filtered}
          keyExtractor={(o) => o.id}
          numColumns={columns}
          contentContainerStyle={{ padding: isTablet ? 20 : 14, gap: 14 }}
          columnWrapperStyle={columns > 1 ? { gap: 14 } : undefined}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View className="items-center py-16 gap-2">
              <ChefHat size={28} color={K.muted} />
              <Text style={{ color: K.muted }} className="text-[13px]">ไม่มีออเดอร์ในคิวนี้</Text>
            </View>
          }
          renderItem={({ item }) => {
            const action = NEXT_ACTION[item.status];
            const isDineIn = !!item.table;
            const elapsedSec = Math.max(0, Math.floor((now - new Date(item.createdAt).getTime()) / 1000));
            const ratio = item.status === 'READY' ? 1 : elapsedSec / ALLOWED_SEC;
            const overdue = item.status !== 'READY' && ratio >= 1;
            const color = overdue ? SPINE.overdue : SPINE[item.status as 'PENDING' | 'PREPARING' | 'READY'] ?? SPINE.PENDING;
            const statusLabel = overdue ? 'เกินเวลา' : item.status === 'PENDING' ? 'รอทำ' : item.status === 'PREPARING' ? 'กำลังทำ' : 'พร้อมเสิร์ฟ';
            const mm = String(Math.min(99, Math.floor(elapsedSec / 60))).padStart(2, '0');
            const ss = String(elapsedSec % 60).padStart(2, '0');
            return (
              <View
                style={{ backgroundColor: K.card, borderColor: K.border }}
                className={`${columns > 1 ? 'flex-1 ' : ''}overflow-hidden rounded-[14px] border`}
              >
                <SpineGauge color={color} ratio={ratio} trackColor={K.border} />
                <View className="gap-2.5 pl-6 pr-4 pt-3.5 pb-4">
                  <View className="flex-row items-baseline justify-between">
                    <View className="flex-row items-baseline gap-3.5 flex-shrink">
                      <Text style={{ color: K.fg }} numberOfLines={1} className="text-[28px] font-bold flex-shrink">#{item.orderNumber.split('-').pop()}</Text>
                      <Text style={{ color: K.fg }} numberOfLines={1} className="text-[18px] font-semibold flex-shrink">
                        {isDineIn ? `โต๊ะ ${item.table!.number}` : item.type === 'TAKEAWAY' ? 'กลับบ้าน' : 'เดลิเวอรี่'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <View className="flex-row items-center gap-2.5">
                        <Pressable onPress={() => onReprint(item)} disabled={printingId === item.id} hitSlop={8}>
                          <Printer size={18} color={K.muted} />
                        </Pressable>
                        <Text
                          style={{ color: overdue ? SPINE.overdue : item.status === 'READY' ? SPINE.READY : K.muted, fontFamily: MONO }}
                          className="text-[20px] font-bold"
                        >
                          {item.status === 'READY' ? 'พร้อม' : `${mm}:${ss}`}
                        </Text>
                      </View>
                      <Text style={{ color }} className="text-[11px] font-semibold">{statusLabel}</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: K.border }} className="h-px" />

                  <View className="gap-2">
                    {item.items.map((li) => (
                      <View key={li.id}>
                        <Text style={{ color: K.fg }} className="text-[20px] font-semibold">
                          {li.quantity}× {li.product?.name ?? 'สินค้า'}
                        </Text>
                        {li.notes ? (
                          <Text style={{ color: '#FBBF24' }} className="text-[15px] font-semibold">{li.notes}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  {action ? (
                    <Pressable
                      onPress={() => updateStatus.mutate({ id: item.id, status: action.next })}
                      disabled={updateStatus.isPending}
                      className="h-14 items-center justify-center rounded-xl bg-primary mt-1"
                    >
                      <Text className="text-[17px] font-bold text-white">{action.label}</Text>
                    </Pressable>
                  ) : item.status === 'READY' && !isDineIn ? (
                    <Pressable
                      onPress={() => updateStatus.mutate({ id: item.id, status: 'COMPLETED' })}
                      disabled={updateStatus.isPending}
                      style={{ backgroundColor: K.card2 }}
                      className="h-14 items-center justify-center rounded-xl mt-1"
                    >
                      <Text style={{ color: K.muted }} className="text-[16px] font-semibold">ลูกค้ารับแล้ว</Text>
                    </Pressable>
                  ) : item.status === 'READY' ? (
                    <View style={{ backgroundColor: K.card2 }} className="h-14 items-center justify-center rounded-xl mt-1">
                      <Text style={{ color: K.muted }} className="text-[14px] font-semibold">รอลูกค้าเช็คบิล</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
