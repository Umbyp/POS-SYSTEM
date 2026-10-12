import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { ChevronLeft, ChevronRight, WifiOff, Share2 } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import { SectionCard } from '@/components/SectionCard';
import { Button } from '@/components/Button';
import { useIsTablet } from '@/hooks/useIsTablet';
import { centered } from '@/lib/layout';
import { useThemeColors } from '@/lib/theme';
import { buildZReportText, formatYmd, METHOD_LABEL } from '@/lib/zreportText';
import type { ZReport } from '@/types/zreport';

const TZ_MS = 7 * 3600_000; // store day = Asia/Bangkok, same as the API
const todayYmd = () => new Date(Date.now() + TZ_MS).toISOString().slice(0, 10);
const shiftDay = (ymd: string, delta: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + delta * 86400_000).toISOString().slice(0, 10);

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
      <Text className={`text-[13px] ${bold ? 'font-bold' : 'font-medium'} text-foreground dark:text-dark-foreground`} style={tone ? { color: tone } : undefined}>
        {value}
      </Text>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View className="min-w-[46%] flex-1 gap-0.5 rounded-[10px] border border-border bg-card p-3 dark:border-dark-border dark:bg-dark-card">
      <Text className="text-[11px] font-medium text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
      <Text className="text-[17px] font-bold text-foreground dark:text-dark-foreground" style={tone ? { color: tone } : undefined} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export default function ZReportScreen() {
  const t = useThemeColors();
  const isTablet = useIsTablet();
  const today = todayYmd();
  const [date, setDate] = useState(today);
  const [showShiftDetails, setShowShiftDetails] = useState(false);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['z-report', date],
    queryFn: async () => (await api.get('/reports/z-report', { params: { date } })).data as ZReport,
  });
  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data as { name?: string },
  });

  const share = async () => {
    if (!data) return;
    try {
      await Share.share({ message: buildZReportText(data, store?.name) });
    } catch {
      Alert.alert('แชร์ไม่สำเร็จ', 'ลองอีกครั้ง');
    }
  };

  const toneFor = (d: number) => (Math.abs(d) < 0.01 ? t.success : d > 0 ? t.warning : t.danger);
  const diffLabel = (d: number) => (Math.abs(d) < 0.01 ? 'ตรง' : d > 0 ? `เกิน ${formatCurrency(d)}` : `ขาด ${formatCurrency(-d)}`);
  const maxHour = Math.max(1, ...(data?.byHour.map((h) => h.sales) ?? [1]));
  const activeHours = data?.byHour.filter((h) => h.orders > 0) ?? [];
  const isEmpty = !!data && data.sales.orderCount === 0 && data.sales.refunds.count === 0 && data.shifts.length === 0;
  const errMsg = isAxiosError(error) && error.response?.status === 403 ? 'เฉพาะเจ้าของ/แอดมินเท่านั้น' : 'โหลดรายงานไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="border-b border-border bg-card dark:border-dark-border dark:bg-dark-card">
        <View style={centered(isTablet)} className="flex-row items-center justify-between px-2 py-1.5">
          <Pressable onPress={() => setDate(shiftDay(date, -1))} hitSlop={8} className="p-2.5" accessibilityLabel="วันก่อนหน้า">
            <ChevronLeft size={22} color={t.foreground} />
          </Pressable>
          <Pressable onPress={() => setDate(today)} className="items-center">
            <Text className="text-[15px] font-bold text-foreground dark:text-dark-foreground">{formatYmd(date)}</Text>
            <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{date === today ? 'วันนี้' : 'แตะเพื่อกลับไปวันนี้'}</Text>
          </Pressable>
          <Pressable
            onPress={() => setDate(shiftDay(date, 1))}
            disabled={date >= today}
            hitSlop={8}
            className="p-2.5"
            style={{ opacity: date >= today ? 0.3 : 1 }}
            accessibilityLabel="วันถัดไป"
          >
            <ChevronRight size={22} color={t.foreground} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 12, ...centered(isTablet) }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={t.primary} />}
      >
        {isLoading ? (
          <View className="items-center py-16"><ActivityIndicator color={t.primary} /></View>
        ) : isError || !data ? (
          <View className="items-center gap-3 rounded-[10px] border border-border bg-card p-6 dark:border-dark-border dark:bg-dark-card">
            <WifiOff size={26} color={t.faint} />
            <Text className="text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">{errMsg}</Text>
            <Button label="ลองใหม่" variant="secondary" onPress={() => refetch()} />
          </View>
        ) : (
          <>
            <View className="flex-row flex-wrap gap-2.5">
              <Stat label="ยอดขายสุทธิ" value={formatCurrency(data.sales.netSales)} tone={t.primary} />
              <Stat label="จำนวนบิล" value={`${data.sales.orderCount} บิล`} />
              <Stat label={`คืนเงิน (${data.sales.refunds.count})`} value={formatCurrency(data.sales.refunds.amount)} tone={data.sales.refunds.amount > 0 ? t.danger : undefined} />
              <Stat label="เฉลี่ย/บิล" value={formatCurrency(data.sales.avgBill)} />
            </View>

            <SectionCard title="เงินสดในลิ้นชัก">
              <View className="flex-row flex-wrap gap-2.5">
                <Stat label="ควรมี" value={formatCurrency(data.cashDrawer.expectedTotal)} />
                <Stat label="นับได้" value={data.cashDrawer.openShifts > 0 ? 'รอปิดกะ' : formatCurrency(data.cashDrawer.countedTotal)} />
              </View>
              <View className="flex-row items-center justify-between rounded-[8px] bg-muted px-3 py-2.5 dark:bg-dark-muted">
                <Text className="text-[12px] font-semibold text-foreground dark:text-dark-foreground">ผลต่างเงินสด</Text>
                <Text className="text-[14px] font-bold" style={{ color: data.cashDrawer.openShifts > 0 ? t.warning : toneFor(data.cashDrawer.differenceTotal) }}>
                  {data.cashDrawer.openShifts > 0 ? `รอปิด ${data.cashDrawer.openShifts} กะ` : diffLabel(data.cashDrawer.differenceTotal)}
                </Text>
              </View>
            </SectionCard>

            {isEmpty ? (
              <View className="items-center rounded-[10px] border border-border bg-card p-6 dark:border-dark-border dark:bg-dark-card">
                <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีการขายในวันนี้</Text>
              </View>
            ) : (
              <>
                <SectionCard title="ช่องทางชำระเงิน (สุทธิ หลังหักเงินทอนและคืนเงิน)">
                  {data.byMethod.map((m) => (
                    <Row key={m.method} label={METHOD_LABEL[m.method] ?? m.method} value={formatCurrency(m.amount)} />
                  ))}
                  <View className="h-px bg-border dark:bg-dark-border" />
                  <Row label="รวม" value={formatCurrency(data.sales.netSales)} bold />
                </SectionCard>

                <SectionCard title="ยอดขายและภาษี">
                  <Row label="ยอดขายรวม" value={formatCurrency(data.sales.grossSales)} />
                  <Row label="ค่าบริการ" value={formatCurrency(data.sales.serviceCharge)} />
                  <Row label="ภาษีมูลค่าเพิ่ม (VAT)" value={formatCurrency(data.sales.tax)} />
                </SectionCard>

                <SectionCard title="ยอดขายรายชั่วโมง">
                  {activeHours.length === 0 ? (
                    <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีการขาย</Text>
                  ) : (
                    activeHours.map((h) => (
                      <View key={h.hour} className="flex-row items-center gap-2">
                        <Text className="w-[44px] text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{String(h.hour).padStart(2, '0')}:00</Text>
                        <View className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted dark:bg-dark-muted">
                          <View style={{ width: `${Math.max(3, (h.sales / maxHour) * 100)}%`, backgroundColor: t.primary }} className="h-full rounded-full" />
                        </View>
                        <Text className="w-[84px] text-right text-[12px] text-foreground dark:text-dark-foreground">{formatCurrency(h.sales)}</Text>
                        <Text className="w-[28px] text-right text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{h.orders}</Text>
                      </View>
                    ))
                  )}
                </SectionCard>

                {data.topItems.length > 0 && (
                  <SectionCard title="สินค้าขายดี">
                    {data.topItems.map((i, idx) => (
                      <View key={`${i.name}-${idx}`} className="flex-row items-center justify-between gap-2">
                        <Text className="flex-1 text-[13px] text-foreground dark:text-dark-foreground" numberOfLines={1}>{idx + 1}. {i.name}</Text>
                        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">x{i.quantity}</Text>
                        <Text className="w-[90px] text-right text-[13px] font-medium text-foreground dark:text-dark-foreground">{formatCurrency(i.revenue)}</Text>
                      </View>
                    ))}
                  </SectionCard>
                )}

                {data.byCashier.length > 0 && (
                  <SectionCard title="ตามพนักงานขาย">
                    {data.byCashier.map((c, idx) => (
                      <View key={`${c.name}-${idx}`} className="flex-row items-center justify-between gap-2">
                        <Text className="flex-1 text-[13px] text-foreground dark:text-dark-foreground" numberOfLines={1}>{c.name}</Text>
                        <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{c.orders} บิล</Text>
                        <Text className="w-[90px] text-right text-[13px] font-medium text-foreground dark:text-dark-foreground">{formatCurrency(c.sales)}</Text>
                      </View>
                    ))}
                  </SectionCard>
                )}

                <SectionCard title="รายละเอียดกะ">
                  <Pressable onPress={() => setShowShiftDetails((v) => !v)} className="h-11 flex-row items-center justify-between rounded-[8px] bg-muted px-3 dark:bg-dark-muted">
                    <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{data.shifts.length ? `${data.shifts.length} กะในวันนี้` : 'ไม่มีกะในวันนี้'}</Text>
                    <Text className="text-[12px] font-semibold text-primary">{showShiftDetails ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}</Text>
                  </Pressable>
                  {showShiftDetails ? (
                    <>
                  {data.shifts.length === 0 ? (
                    <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีกะที่เริ่มในวันนี้</Text>
                  ) : (
                    <>
                      {data.shifts.map((s) => (
                        <View key={s.shiftId} className="gap-1 border-b border-muted pb-2.5 dark:border-dark-muted">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{s.userName}</Text>
                            <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                              {formatTime(s.startTime)} – {s.endTime ? formatTime(s.endTime) : 'ยังไม่ปิดกะ'}
                            </Text>
                          </View>
                          <Row label="เงินเริ่มต้น" value={formatCurrency(s.openingCash)} />
                          <Row label="ควรมีในลิ้นชัก" value={formatCurrency(s.expectedCash)} />
                          {s.closingCash != null && s.difference != null ? (
                            <>
                              <Row label="นับได้" value={formatCurrency(s.closingCash)} />
                              <Row label="ผลต่าง" value={diffLabel(s.difference)} bold tone={toneFor(s.difference)} />
                            </>
                          ) : (
                            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">รอปิดกะเพื่อนับเงินสด</Text>
                          )}
                        </View>
                      ))}
                    </>
                  )}
                    </>
                  ) : null}
                </SectionCard>
              </>
            )}

            <Pressable
              onPress={share}
              className="flex-row items-center justify-center gap-2 rounded-[10px] bg-primary py-3.5 active:opacity-80"
              accessibilityRole="button"
            >
              <Share2 size={18} color="#FFFFFF" />
              <Text className="text-[14px] font-semibold text-white">แชร์สรุป</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
