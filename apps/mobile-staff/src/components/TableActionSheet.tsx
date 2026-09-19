import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, Linking } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { X, ArrowRight, QrCode, ArrowLeft } from 'lucide-react-native';
import { TABLE_STATUS_LABEL, TABLE_STATUS_ORDER, TABLE_STATUS_COLOR } from '@/constants/tableStatus';
import { WEB_URL } from '@/constants/config';
import { api } from '@/lib/api';
import type { RestaurantTable, TableStatus } from '@/types/pos';

interface TableActionSheetProps {
  table: RestaurantTable | null;
  onClose: () => void;
  onChangeStatus: (status: TableStatus) => void;
  onOpenBill: () => void;
  updating: boolean;
}

export function TableActionSheet({ table, onClose, onChangeStatus, onOpenBill, updating }: TableActionSheetProps) {
  const [showQr, setShowQr] = useState(false);

  // Reset back to the main sheet each time it's reopened for a (possibly
  // different) table, rather than reopening mid-QR-view.
  useEffect(() => {
    if (!table) setShowQr(false);
  }, [table]);

  return (
    <Modal visible={!!table} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable className="rounded-t-2xl bg-card dark:bg-dark-card p-5 gap-4" onPress={(e) => e.stopPropagation()}>
          {table && showQr ? (
            <TableQrView table={table} onBack={() => setShowQr(false)} onClose={onClose} />
          ) : table ? (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">โต๊ะ {table.number}</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <X size={22} color="#9CA3AF" />
                </Pressable>
              </View>

              <Pressable
                onPress={onOpenBill}
                className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-primary"
              >
                <Text className="text-[15px] font-semibold text-white">ไปที่บิล / POS</Text>
                <ArrowRight size={18} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={() => setShowQr(true)}
                className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-muted dark:bg-dark-muted"
              >
                <QrCode size={18} color="#7A6A5C" />
                <Text className="text-[15px] font-semibold text-foreground dark:text-dark-foreground">ดู QR โต๊ะ</Text>
              </Pressable>

              <View className="gap-2">
                <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">เปลี่ยนสถานะ</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TABLE_STATUS_ORDER.map((status) => {
                    const active = table.status === status;
                    const c = TABLE_STATUS_COLOR[status];
                    return (
                      <Pressable
                        key={status}
                        disabled={updating || active}
                        onPress={() => onChangeStatus(status)}
                        style={{ backgroundColor: active ? c.fg : c.bg, borderColor: c.border }}
                        className="rounded-full border px-3.5 py-2"
                      >
                        <Text style={{ color: active ? '#FFFFFF' : c.fg }} className="text-[12px] font-semibold">
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
          <ArrowLeft size={18} color="#7A6A5C" />
          <Text className="text-[13px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">ย้อนกลับ</Text>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={12}>
          <X size={22} color="#9CA3AF" />
        </Pressable>
      </View>

      <View className="items-center gap-3 py-2">
        <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground">โต๊ะ {table.number}</Text>
        <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">สแกนเพื่อสั่งอาหาร</Text>

        {error ? (
          <Text className="text-[13px] text-danger py-8">โหลด QR ไม่สำเร็จ ลองใหม่อีกครั้ง</Text>
        ) : !link ? (
          <View className="py-8">
            <ActivityIndicator color="#C9622E" />
          </View>
        ) : (
          <>
            <View className="bg-white p-4 rounded-2xl border border-border dark:border-dark-border">
              <QRCode value={link} size={200} />
            </View>
            <Pressable onPress={() => Linking.openURL(link)} className="mt-1">
              <Text className="text-[12px] text-primary font-semibold">เปิดในเบราว์เซอร์เพื่อพิมพ์</Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}
