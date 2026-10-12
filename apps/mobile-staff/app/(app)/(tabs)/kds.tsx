import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, useWindowDimensions, View, Text, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, ChefHat, Printer, Volume2, VolumeX } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { SpineGauge } from '@/components/Spine';
import { useKdsOrders } from '@/hooks/useKdsOrders';
import { useNewOrderAlert } from '@/hooks/useNewOrderAlert';
import { playNewOrderSound } from '@/lib/orderSound';
import { useKdsAlert } from '@/stores/kdsAlert.store';
import { useSocketStatus } from '@/lib/socket';
import { useIsTablet } from '@/hooks/useIsTablet';
import { useThemeColors } from '@/lib/theme';
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

const ALLOWED_SEC = 15 * 60;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export default function KdsScreen() {
  const qc = useQueryClient();
  // Follows the app theme (light grey + orange / dark), same tokens as every other screen.
  const t = useThemeColors();
  const K = { bg: t.background, card: t.card, card2: t.muted, border: t.border, fg: t.foreground, muted: t.mutedForeground, accent: t.primary };
  // Status colours: text variants are contrast-tuned per theme (theme.ts); the gauge fill can be brighter.
  const SPINE = t.isDark
    ? { PENDING: '#FBBF24', PREPARING: '#60A5FA', READY: '#4ADE80', overdue: '#F87171' }
    : { PENDING: '#D97706', PREPARING: '#2563EB', READY: '#059669', overdue: '#DC2626' };
  const SPINE_TEXT = t.isDark
    ? SPINE
    : { PENDING: '#B45309', PREPARING: '#1D4ED8', READY: '#047857', overdue: '#B91C1C' };
  const isTablet = useIsTablet();
  // Content area = window − 196 sidebar; ~330pt per ticket column (2 on portrait iPad, 3 on 12.9" landscape).
  const { width: winW } = useWindowDimensions();
  const columns = isTablet ? Math.max(2, Math.min(4, Math.floor((winW - 196) / 330))) : 1;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const [tab, setTab] = useState<OrderStatus>('PENDING');
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching, isError } = useKdsOrders();
  const socketStatus = useSocketStatus();
  const muted = useKdsAlert((s) => s.muted);
  const setMuted = useKdsAlert((s) => s.setMuted);
  const { newCount, dismiss } = useNewOrderAlert(data?.data);

  // Pulse the "new order" banner while it's visible.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (newCount === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [newCount > 0, pulse]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real connection state: socket down OR the HTTP poll failing => not live.
  const live: 'ok' | 'connecting' | 'down' =
    isError || socketStatus === 'disconnected' ? 'down' : socketStatus === 'connecting' ? 'connecting' : 'ok';
  const dotColor = live === 'ok' ? t.success : live === 'connecting' ? t.warning : t.danger;
  const liveLabel = live === 'ok' ? 'เชื่อมต่อแล้ว' : live === 'connecting' ? 'กำลังเชื่อมต่อ…' : 'ขาดการเชื่อมต่อ';

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
      <View style={{ borderBottomColor: K.border }} className="flex-row items-center justify-between gap-3 border-b px-4 pt-2">
        <View className="flex-row gap-5 flex-shrink">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{ borderBottomColor: on ? K.accent : 'transparent', borderBottomWidth: 3 }}
                className="items-center px-1 pb-2 pt-1.5"
              >
                <Text style={{ color: on ? K.accent : K.muted }} className={`text-[15px] ${on ? 'font-bold' : 'font-semibold'}`}>
                  {t.label} <Text style={{ color: on ? K.accent : K.fg }}>{counts[t.key] ?? 0}</Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View className="flex-row items-center gap-3.5">
          <Pressable
            onPress={() => {
              // un-muting plays the chime once so the cook can confirm the volume
              if (muted) playNewOrderSound();
              setMuted(!muted);
            }}
            hitSlop={10}
            accessibilityLabel={muted ? 'เปิดเสียงเตือนออเดอร์ใหม่' : 'ปิดเสียงเตือนออเดอร์ใหม่'}
            className="h-9 w-9 items-center justify-center"
          >
            {muted ? <VolumeX size={20} color={K.muted} /> : <Volume2 size={20} color={K.accent} />}
          </Pressable>
          {isTablet ? (
            <>
              <View className="flex-row items-center gap-1.5">
                <View style={{ backgroundColor: dotColor }} className="h-2 w-2 rounded-full" />
                <Text style={{ color: K.muted }} className="text-[13px] font-semibold">{liveLabel}</Text>
              </View>
              <Text style={{ color: K.muted }} className="text-[13px] font-semibold">{formatTime(new Date(now).toISOString())}</Text>
            </>
          ) : (
            <View style={{ backgroundColor: dotColor }} className="h-2.5 w-2.5 rounded-full" accessibilityLabel={liveLabel} />
          )}
        </View>
      </View>

      {newCount > 0 ? (
        <Pressable
          onPress={() => {
            setTab('PENDING');
            dismiss();
          }}
        >
          <Animated.View
            style={{ opacity: pulse }}
            className="flex-row items-center justify-center gap-2 bg-primary px-4 py-2.5"
          >
            <BellRing size={18} color="#FFFFFF" />
            <Text className="text-[15px] font-bold text-white">ออเดอร์ใหม่ {newCount} รายการ</Text>
          </Animated.View>
        </Pressable>
      ) : null}

      {live === 'down' ? (
        <View style={{ backgroundColor: t.isDark ? '#3B1D1D' : '#FEE2E2' }} className="px-4 py-1.5">
          <Text style={{ color: t.danger }} className="text-center text-[12px] font-semibold">
            ขาดการเชื่อมต่อ — ออเดอร์อาจไม่อัปเดตจนกว่าจะเชื่อมต่อใหม่
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={t.primary} />
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
                className={`${columns > 1 ? 'flex-1 ' : ''}overflow-hidden rounded-[10px] border`}
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
                          style={{ color: overdue ? SPINE_TEXT.overdue : item.status === 'READY' ? SPINE_TEXT.READY : K.muted, fontFamily: MONO }}
                          className="text-[20px] font-bold"
                        >
                          {item.status === 'READY' ? 'พร้อม' : `${mm}:${ss}`}
                        </Text>
                      </View>
                      <Text style={{ color: overdue ? SPINE_TEXT.overdue : SPINE_TEXT[item.status as 'PENDING' | 'PREPARING' | 'READY'] ?? SPINE_TEXT.PENDING }} className="text-[11px] font-semibold">{statusLabel}</Text>
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
                          <Text style={{ color: t.warning }} className="text-[15px] font-semibold">{li.notes}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  {action ? (
                    <Pressable
                      onPress={() => updateStatus.mutate({ id: item.id, status: action.next })}
                      disabled={updateStatus.isPending}
                      className="h-14 items-center justify-center rounded-[10px] bg-primary mt-1"
                    >
                      <Text className="text-[17px] font-bold text-white">{action.label}</Text>
                    </Pressable>
                  ) : item.status === 'READY' && !isDineIn ? (
                    <Pressable
                      onPress={() => updateStatus.mutate({ id: item.id, status: 'COMPLETED' })}
                      disabled={updateStatus.isPending}
                      style={{ backgroundColor: K.card2 }}
                      className="h-14 items-center justify-center rounded-[10px] mt-1"
                    >
                      <Text style={{ color: K.muted }} className="text-[16px] font-semibold">ลูกค้ารับแล้ว</Text>
                    </Pressable>
                  ) : item.status === 'READY' ? (
                    <View style={{ backgroundColor: K.card2 }} className="h-14 items-center justify-center rounded-[10px] mt-1">
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
