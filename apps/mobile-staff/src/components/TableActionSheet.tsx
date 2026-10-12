import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { X, ArrowRight, QrCode, ArrowLeft } from 'lucide-react-native';
import { TABLE_STATUS_LABEL, TABLE_STATUS_ORDER, tableStatusColor } from '@/constants/tableStatus';
import { WEB_URL } from '@/constants/config';
import { api } from '@/lib/api';
import { formatCurrency, formatElapsedMinutes } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { BillOpView, BillOpButtons, liveItemCount, type BillOp } from '@/components/BillOpsSheets';
import { useIsTablet } from '@/hooks/useIsTablet';
import { sheetClasses } from '@/lib/layout';
import { useThemeColors } from '@/lib/theme';
import type { Order, RestaurantTable, TableStatus } from '@/types/pos';

interface TableActionSheetProps {
  table: RestaurantTable | null;
  onClose: () => void;
  onChangeStatus: (status: TableStatus) => void;
  onOpenBill: () => void;
  updating: boolean;
}

export function TableActionSheet({ table, onClose, onChangeStatus, onOpenBill, updating }: TableActionSheetProps) {
  const t = useThemeColors();
  const sheet = sheetClasses(useIsTablet());
  const [showQr, setShowQr] = useState(false);
  const [billOp, setBillOp] = useState<{ op: BillOp; orderId: string } | null>(null);

  const { data: bills = [] } = useQuery({
    queryKey: ['orders', 'open-by-table', table?.id, 'all'],
    queryFn: async () => (await api.get(`/orders/open/by-table/${table!.id}/all`)).data as Order[],
    enabled: !!table,
  });
  const opOrder = billOp ? bills.find((b) => b.id === billOp.orderId) : undefined;

  // Reset back to the main sheet each time it's reopened for a (possibly
  // different) table, rather than reopening mid-QR-view.
  useEffect(() => {
    if (!table) {
      setShowQr(false);
      setBillOp(null);
    }
  }, [table]);

  return (
    <Modal visible={!!table} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className={sheet.overlay} onPress={onClose}>
        <Pressable className={`${sheet.panel} max-h-[90%] bg-card dark:bg-dark-card p-5 gap-4`} onPress={(e) => e.stopPropagation()}>
          {table && billOp && opOrder ? (
            <BillOpView op={billOp.op} order={opOrder} onBack={() => setBillOp(null)} onClose={onClose} />
          ) : table && showQr ? (
            <TableQrView table={table} onBack={() => setShowQr(false)} onClose={onClose} />
          ) : table ? (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">โต๊ะ {table.number}</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <X size={22} color={t.mutedForeground} />
                </Pressable>
              </View>

              <Pressable
                onPress={onOpenBill}
                className="h-12 flex-row items-center justify-center gap-2 rounded-[10px] bg-primary"
              >
                <Text className="text-[15px] font-semibold text-white">ไปที่บิล / POS</Text>
                <ArrowRight size={18} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={() => setShowQr(true)}
                className="h-12 flex-row items-center justify-center gap-2 rounded-[10px] border border-primary bg-card dark:bg-dark-card"
              >
                <QrCode size={18} color={t.primary} />
                <Text className="text-[15px] font-semibold text-primary dark:text-primary-400">ดู QR โต๊ะ</Text>
              </Pressable>

              {bills.length > 0 ? (
                <View className="gap-2">
                  <Text className="text-[11px] font-semibold tracking-wider text-muted-foreground dark:text-dark-muted-foreground">จัดการบิล</Text>
                  <ScrollView className="max-h-[260px]" contentContainerClassName="gap-2">
                    {bills.map((b) => (
                      <View key={b.id} className="gap-2 rounded-[10px] border border-border bg-card p-3 dark:border-dark-border dark:bg-dark-card">
                        <View className="flex-row items-center justify-between gap-2">
                          <View className="flex-1">
                            <Text className="text-[14px] font-bold text-foreground dark:text-dark-foreground">
                              #{b.orderNumber} · {formatCurrency(b.total)}
                            </Text>
                            <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                              {liveItemCount(b)} รายการ · {formatElapsedMinutes(b.createdAt)}
                            </Text>
                          </View>
                          <StatusBadge status={b.status} />
                        </View>
                        <BillOpButtons compact order={b} onPick={(op) => setBillOp({ op, orderId: b.id })} />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View className="gap-2">
                <Text className="text-[11px] font-semibold tracking-wider text-muted-foreground dark:text-dark-muted-foreground">เปลี่ยนสถานะ</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TABLE_STATUS_ORDER.map((status) => {
                    const active = table.status === status;
                    const c = tableStatusColor(status, t.isDark);
                    return (
                      <Pressable
                        key={status}
                        disabled={updating || active}
                        onPress={() => onChangeStatus(status)}
                        style={{ backgroundColor: active ? c.fg : c.bg, borderColor: c.border }}
                        className="rounded-full border px-3.5 py-2"
                      >
                        <Text style={{ color: active ? (t.isDark ? '#161616' : '#FFFFFF') : c.fg }} className="text-[12px] font-semibold">
                          {TABLE_STATUS_LABEL[status]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TableQrView({ table, onBack, onClose }: { table: RestaurantTable; onBack: () => void; onClose: () => void }) {
  const t = useThemeColors();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrCode(null);
    setError(false);
    api
      .get(`/tables/${table.id}/qr`)
      .then((r) => {
        if (!cancelled) setQrCode(r.data.qrCode);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [table.id]);

  const link = qrCode ? `${WEB_URL}/order/${qrCode}` : null;

  return (
    <>
      <View className="flex-row items-center justify-between">
        <Pressable onPress={onBack} hitSlop={12} className="flex-row items-center gap-1.5">
          <ArrowLeft size={18} color={t.mutedForeground} />
          <Text className="text-[13px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">ย้อนกลับ</Text>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={12}>
          <X size={22} color={t.mutedForeground} />
        </Pressable>
      </View>

      <View className="items-center gap-3 py-2">
        <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">โต๊ะ {table.number}</Text>
        <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">สแกนเพื่อสั่งอาหาร</Text>

        {error ? (
          <Text className="text-[13px] text-danger dark:text-dark-danger py-8">โหลด QR ไม่สำเร็จ ลองใหม่อีกครั้ง</Text>
        ) : !link ? (
          <View className="py-8">
            <ActivityIndicator color={t.primary} />
          </View>
        ) : (
          <>
            <View className="bg-white p-4 rounded-[10px] border border-border dark:border-dark-border">
              <QRCode value={link} size={200} />
            </View>
            <Pressable onPress={() => Linking.openURL(link)} className="mt-1">
              <Text className="text-[12px] text-primary dark:text-primary-400 font-semibold">เปิดในเบราว์เซอร์เพื่อพิมพ์</Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}
