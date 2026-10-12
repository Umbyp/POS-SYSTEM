import { useEffect } from 'react';
import { Pressable, Text, Vibration, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, PackageX, X } from 'lucide-react-native';
import { getSocket } from '@/lib/socket';
import { useStockAlert, type StockAlertItem } from '@/stores/stockAlert.store';

const AUTO_HIDE_MS = 12000;

/** Listens for the API's `stock:low` event and shows a tappable banner that opens the stock screen. */
export function StockAlertBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const items = useStockAlert((s) => s.items);
  const push = useStockAlert((s) => s.push);
  const dismiss = useStockAlert((s) => s.dismiss);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onLow = (payload: { items?: StockAlertItem[] }) => {
      if (!payload?.items?.length) return;
      push(payload.items);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      try { Vibration.vibrate(payload.items.some((i) => i.level === 2) ? [0, 250, 120, 250] : 200); } catch { /* no vibration */ }
    };
    s.on('stock:low', onLow);
    return () => { s.off('stock:low', onLow); };
  }, [push, qc]);

  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(dismiss, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [items, dismiss]);

  if (!items.length) return null;
  const out = items.filter((i) => i.level === 2);
  const low = items.filter((i) => i.level === 1);
  const worst = out.length > 0;
  const line = (list: StockAlertItem[], fmt: (i: StockAlertItem) => string) => {
    const shown = list.slice(0, 3).map(fmt).join(', ');
    return list.length > 3 ? `${shown} และอีก ${list.length - 3} รายการ` : shown;
  };

  return (
    <Pressable
      onPress={() => { dismiss(); router.push('/inventory'); }}
      // Overlay above the header (not in the layout flow) so it clears the notch and never shifts the screen.
      style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, paddingTop: insets.top + 8 }}
      className={`flex-row items-start gap-2 px-3 pb-2 ${worst ? 'bg-destructive' : 'bg-warning'}`}
      accessibilityRole="button"
      accessibilityLabel="ดูสต็อกที่ใกล้หมด"
    >
      <View className="pt-0.5">{worst ? <PackageX size={16} color="#FFFFFF" /> : <AlertTriangle size={16} color="#FFFFFF" />}</View>
      <View className="flex-1">
        {out.length > 0 && <Text className="text-[12px] font-bold text-white">หมดแล้ว: {line(out, (i) => i.name)}</Text>}
        {low.length > 0 && <Text className="text-[12px] font-medium text-white">ใกล้หมด: {line(low, (i) => `${i.name} (เหลือ ${i.quantity})`)}</Text>}
        <Text className="text-[11px] text-white/80">แตะเพื่อดูสต็อก</Text>
      </View>
      <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel="ปิดการแจ้งเตือน">
        <X size={16} color="#FFFFFF" />
      </Pressable>
    </Pressable>
  );
}
