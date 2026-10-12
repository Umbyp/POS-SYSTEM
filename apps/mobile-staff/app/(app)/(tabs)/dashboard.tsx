import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Bell } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import { SectionCard } from '@/components/SectionCard';
import { SectionLabel } from '@/components/SectionLabel';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { StatusBadge, spineColor } from '@/components/StatusBadge';
import { useKdsOrders } from '@/hooks/useKdsOrders';
import { useThemeColors } from '@/lib/theme';
import type { DailySalesRow, DashboardOverview, ReportSummary } from '@/types/backoffice';
import type { OrderStatus } from '@/types/pos';

const TH_DAY = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const INSIGHT_SPINE: Record<string, string> = {
  positive: '#047857',
  neutral: '#1D4ED8',
  warning: '#B45309',
  critical: '#B91C1C',
};
// Brighter variants so the 6px status bar stays visible on dark cards.
const INSIGHT_SPINE_DARK: Record<string, string> = {
  positive: '#4ADE80',
  neutral: '#60A5FA',
  warning: '#FBBF24',
  critical: '#F87171',
};

const PERIODS = [
  { key: 'today', label: 'วันนี้', heroTitle: 'ยอดขายวันนี้' },
  { key: 'week', label: '7 วัน', heroTitle: 'ยอดขาย 7 วันล่าสุด' },
  { key: 'month', label: 'เดือนนี้', heroTitle: 'ยอดขายเดือนนี้' },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

function periodRange(period: Exclude<PeriodKey, 'today'>) {
  const to = new Date();
  const from = new Date(to);
  from.setHours(0, 0, 0, 0);
  if (period === 'week') from.setDate(from.getDate() - 6);
  else from.setDate(1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const t = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // Orders waiting in the kitchen — same cache entry the KDS uses (kept fresh by sockets).
  const { data: kds } = useKdsOrders({ refetchInterval: 15000 });
  const [period, setPeriod] = useState<PeriodKey>('today');
  const isToday = period === 'today';
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => (await api.get('/dashboard/overview')).data as DashboardOverview,
    refetchInterval: 30000,
  });

  // Tablet-only range views — reuse the reports endpoints the Reports screen already calls.
  const rangeEnabled = wide && !isToday;
  const { data: summary } = useQuery({
    queryKey: ['dashboard-range-summary', period],
    queryFn: async () => {
      const { from, to } = periodRange(period as Exclude<PeriodKey, 'today'>);
      return (await api.get('/reports/summary', { params: { from, to } })).data as ReportSummary;
    },
    enabled: rangeEnabled,
  });
  // Phone shows the 7-day sales chart permanently (same key as the tablet's 7-day view).
  const { data: daily } = useQuery({
    queryKey: ['dashboard-range-daily', wide ? period : 'week'],
    queryFn: async () => {
      const { from, to } = periodRange(wide ? (period as Exclude<PeriodKey, 'today'>) : 'week');
      return (await api.get('/reports/daily-sales', { params: { from, to } })).data as DailySalesRow[];
    },
    enabled: rangeEnabled || !wide,
  });

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  const rangeView = rangeEnabled && !!summary;
  const vsYesterday = rangeView ? summary.growth.revenue : data.today.vsYesterdayPct;
  const heroRevenue = rangeView ? summary.revenue : data.today.revenue;
  const heroTitle = PERIODS.find((p) => p.key === period)!.heroTitle;
  const compareLabel = isToday ? ' เทียบเมื่อวาน' : ' เทียบช่วงก่อนหน้า';

  const bars: { label: string; value: number }[] = isToday
    ? hourBars(data.hourly ?? [])
    : (daily ?? []).map((d) => ({ label: String(new Date(d.date).getDate()), value: d.revenue }));
  const maxBar = Math.max(1, ...bars.map((b) => b.value));
  const peakBar = bars.reduce((best, b, i) => (b.value > (bars[best]?.value ?? 0) ? i : best), 0);
  const maxQty = Math.max(1, ...data.topItems.map((t) => t.qty));
  const lowStock = data.alerts.lowStock;
  const pendingKitchen = data.restaurant.pendingKitchen;
  const pendingOrders = kds ? kds.data.filter((o) => o.status === 'PENDING').length : pendingKitchen;
  const canOpenKds = user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'KITCHEN';
  const bell = <NotificationBell count={pendingOrders} onPress={canOpenKds ? () => router.push('/kds' as never) : undefined} />;
  const hasActions = data.insights.length > 0 || lowStock.length > 0 || pendingKitchen > 0;

  const stats = [
    { label: 'ออเดอร์', value: String(rangeView ? summary.orderCount : data.today.orders), amber: false },
    { label: 'ยอด/บิล', value: formatCurrency(rangeView ? summary.avgTicket : data.today.avgTicket), amber: false },
    { label: 'โต๊ะใช้งาน', value: `${data.restaurant.activeTables}/${data.restaurant.totalTables}`, amber: false },
    { label: 'รอครัว', value: String(pendingKitchen), amber: pendingKitchen > 0 },
  ];

  const hero = (
    <SectionCard>
      <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">{heroTitle}</Text>
      <View className="flex-row flex-wrap items-baseline gap-2.5">
        <Text className="text-metric-lg text-foreground dark:text-dark-foreground">{formatCurrency(heroRevenue)}</Text>
        {vsYesterday != null ? (
          <View
            className={`flex-row items-center gap-1 rounded-full px-2 py-[3px] ${vsYesterday >= 0 ? 'bg-[#ECFDF5] dark:bg-dark-success/15' : 'bg-[#FEE2E2] dark:bg-dark-danger/15'}`}
          >
            {vsYesterday >= 0 ? <TrendingUp size={12} color={t.success} /> : <TrendingDown size={12} color={t.danger} />}
            <Text className={`text-[12px] font-bold ${vsYesterday >= 0 ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger'}`}>
              {Math.abs(vsYesterday).toFixed(1)}%{compareLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="h-[78px] flex-row items-end gap-[7px] border-t border-border pt-3.5 dark:border-dark-border">
        {bars.map((b, i) => (
          <View key={i} className="flex-1 items-center gap-[5px]">
            <View
              className={`w-full rounded-[4px] ${i === peakBar && b.value > 0 ? 'bg-primary' : 'bg-primary-50 dark:bg-dark-border'}`}
              style={{ height: Math.max(4, (b.value / maxBar) * 40) }}
            />
            <Text
              numberOfLines={1}
              className="w-full text-center text-[10px] font-semibold text-muted-foreground dark:text-dark-muted-foreground"
            >
              {bars.length > 12 && i % 2 === 1 ? '' : b.label}
            </Text>
          </View>
        ))}
      </View>
    </SectionCard>
  );

  // ---- Phone: 7-day sales bar chart card ----
  // The API only returns days that had sales — pad to the last 7 calendar days so the chart is always 7 bars.
  const revenueByDay = new Map((daily ?? []).map((d) => [String(d.date).slice(0, 10), d.revenue]));
  const weekBars = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return { label: TH_DAY[day.getDay()], value: revenueByDay.get(key) ?? 0 };
  });
  const weekMax = Math.max(1, ...weekBars.map((b) => b.value));
  const weekTotal = weekBars.reduce((sum, b) => sum + b.value, 0);
  const CHART_H = 110;
  const salesChart = (
    <View className="overflow-hidden rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
      <View className="flex-row items-center justify-between border-b border-border px-3.5 py-2.5 dark:border-dark-border">
        <SectionLabel>ยอดขาย 7 วัน</SectionLabel>
        <Text className="text-[12px] font-bold text-foreground dark:text-dark-foreground">{formatCurrency(weekTotal)}</Text>
      </View>
      <View className="px-3.5 pb-3 pt-3">
        {weekBars.length === 0 ? (
          <View style={{ height: CHART_H + 40 }} className="items-center justify-center">
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีข้อมูล</Text>
          </View>
        ) : (
          <View className="flex-row items-end gap-2" style={{ height: CHART_H + 40 }}>
            {weekBars.map((b, i) => {
              const last = i === weekBars.length - 1;
              const h = Math.max(6, (b.value / weekMax) * CHART_H);
              return (
                <View key={i} className="flex-1 items-center justify-end gap-1.5">
                  {last ? (
                    <View style={{ position: 'absolute', right: -2, bottom: h + 24, alignItems: 'flex-end', width: 90 }}>
                      <View className="rounded-[6px] bg-foreground px-2 py-1 dark:bg-dark-foreground">
                        <Text numberOfLines={1} className="text-[11px] font-bold text-white dark:text-dark-background">
                          {formatCurrency(b.value)}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  <View className={`w-full rounded-[4px] ${last ? 'bg-primary' : 'bg-primary-50 dark:bg-dark-border'}`} style={{ height: h }} />
                  <Text className="text-[10px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">{b.label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
      <View className="flex-row items-center justify-between border-t border-border px-3.5 py-2.5 dark:border-dark-border">
        <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">วันนี้ {formatCurrency(data.today.revenue)}</Text>
        {data.today.vsYesterdayPct != null ? (
          <Text className={`text-[11px] font-bold ${data.today.vsYesterdayPct >= 0 ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger'}`}>
            {data.today.vsYesterdayPct >= 0 ? '▲' : '▼'} {Math.abs(data.today.vsYesterdayPct).toFixed(1)}% เทียบเมื่อวาน
          </Text>
        ) : null}
      </View>
    </View>
  );

  // ---- Phone: 2x2 bordered stat table ----
  const freeTables = Math.max(0, data.restaurant.totalTables - data.restaurant.activeTables);
  const phoneStats = [
    { label: 'ออเดอร์รอ', value: String(pendingKitchen), sub: '', amber: pendingKitchen > 0 },
    { label: 'ยอด/บิล', value: formatCurrency(data.today.avgTicket), sub: '', amber: false },
    { label: 'ออเดอร์วันนี้', value: String(data.today.orders), sub: '', amber: false },
    { label: 'โต๊ะว่าง', value: String(freeTables), sub: `/${data.restaurant.totalTables}`, amber: false },
  ];
  const statGrid = (
    <View className="overflow-hidden rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
      {[0, 2].map((r) => (
        <View key={r} className={`flex-row ${r === 2 ? 'border-t border-border dark:border-dark-border' : ''}`}>
          {phoneStats.slice(r, r + 2).map((st, c) => (
            <View key={st.label} className={`flex-1 px-3.5 py-3 ${c === 1 ? 'border-l border-border dark:border-dark-border' : ''}`}>
              <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{st.label}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit className={`mt-1 text-[24px] font-bold ${st.amber ? 'text-warning dark:text-dark-warning' : 'text-foreground dark:text-dark-foreground'}`}>
                {st.value}
                {st.sub ? <Text className="text-[13px] font-medium text-muted-foreground dark:text-dark-muted-foreground">{st.sub}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );

  const actions = hasActions ? (
    <View className="overflow-hidden rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
      <SectionLabel className="px-3.5 pb-2 pt-3">ต้องจัดการก่อน</SectionLabel>
      {pendingKitchen > 0 ? (
        <ActionRow color={t.warning} title={`รอครัว ${pendingKitchen} รายการ`} />
      ) : null}
      {data.insights.map((ins, i) => (
        <ActionRow key={i} color={(t.isDark ? INSIGHT_SPINE_DARK : INSIGHT_SPINE)[ins.type] ?? (t.isDark ? INSIGHT_SPINE_DARK : INSIGHT_SPINE).neutral} title={ins.text} />
      ))}
      {lowStock.length > 0 ? (
        <ActionRow
          color={t.warning}
          title={`สต็อกใกล้หมด ${lowStock.length} รายการ`}
          sub={lowStock.map((it) => `${it.name} ${it.quantity}/${it.lowStockAt}`).join(' · ')}
        />
      ) : null}
    </View>
  ) : null;

  const topItems = (
    <SectionCard title="ขายดีวันนี้">
      {data.topItems.length === 0 ? (
        <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีข้อมูล</Text>
      ) : (
        data.topItems.map((item, i) => (
          <View key={i} className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-[13px] font-semibold text-foreground dark:text-dark-foreground" numberOfLines={1}>
                {item.name} × {item.qty}
              </Text>
              <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{formatCurrency(item.revenue)}</Text>
            </View>
            <View className="h-1.5 rounded-full bg-muted dark:bg-dark-muted">
              <View
                className="h-1.5 rounded-full bg-primary"
                style={{ width: `${Math.max(4, (item.qty / maxQty) * 100)}%` }}
              />
            </View>
          </View>
        ))
      )}
    </SectionCard>
  );

  const recent = (
    <SectionCard title="กิจกรรมล่าสุด">
      {data.recentOrders.length === 0 ? (
        <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีออเดอร์</Text>
      ) : (
        data.recentOrders.map((o) => (
          <View key={o.id} className="flex-row items-center gap-2.5">
            <View className="h-9 w-1.5 rounded-[3px]" style={{ backgroundColor: spineColor(o.status as OrderStatus, t.isDark) ?? '#D4D4D4' }} />
            <View className="flex-1">
              <Text numberOfLines={1} className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">#{o.orderNumber.split('-').pop()}</Text>
              <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                {o.tableNumber ? `โต๊ะ ${o.tableNumber}` : o.type} · {formatTime(o.createdAt)}
              </Text>
            </View>
            <View className="items-end gap-1">
              <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">{formatCurrency(o.total)}</Text>
              <StatusBadge status={o.status as OrderStatus} />
            </View>
          </View>
        ))
      )}
    </SectionCard>
  );

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={wide ? ['bottom', 'left', 'right'] : ['top', 'left', 'right']}>
      {!wide ? (
        <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
          <View className="flex-1 pr-3">
            <Text numberOfLines={1} className="text-[20px] font-bold text-foreground dark:text-dark-foreground">
              สวัสดี, {user?.name ?? ''}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
              {data.storeName}
            </Text>
          </View>
          {bell}
        </View>
      ) : null}
      {wide ? (
        <View className="flex-row items-center justify-between border-b border-border bg-card px-[22px] py-1 dark:border-dark-border dark:bg-dark-card">
          <Text className="text-[18px] font-bold text-foreground dark:text-dark-foreground">ภาพรวม</Text>
          <View className="flex-row items-center gap-3">
            <UnderlineTabs
              fill={false}
              tabs={PERIODS.map((p) => ({ key: p.key, label: p.label }))}
              value={period}
              onChange={setPeriod}
              className="border-b-0"
            />
            {bell}
          </View>
        </View>
      ) : null}
      <ScrollView
        contentContainerClassName={wide ? 'p-5 gap-4' : 'p-3.5 gap-3'}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={t.primary} />}
      >
        {wide ? (
          <View className="flex-row gap-4">
            <View className="flex-[1.5]">{hero}</View>
            <View className="flex-1 flex-row flex-wrap gap-3">
              {stats.map((st) => (
                <View
                  key={st.label}
                  className="basis-[47%] grow justify-center rounded-[10px] border border-border bg-card p-3.5 dark:border-dark-border dark:bg-dark-card"
                >
                  <Text className="text-[10px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">{st.label}</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit className={`text-[26px] font-bold ${st.amber ? 'text-warning dark:text-dark-warning' : 'text-foreground dark:text-dark-foreground'}`}>
                    {st.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <>
            {statGrid}
            {salesChart}
          </>
        )}

        {wide ? (
          <View className="flex-row items-start gap-4">
            <View className="flex-1 gap-4">
              {actions}
              {recent}
            </View>
            <View className="w-[330px]">{topItems}</View>
          </View>
        ) : (
          <>
            {actions}
            {topItems}
            {recent}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Hourly revenue bars covering at least 08–19, widened to include any off-hours sales. */
function hourBars(hourly: { hour: number; revenue: number }[]) {
  const active = hourly.filter((h) => h.revenue > 0).map((h) => h.hour);
  const first = Math.min(8, ...active);
  const last = Math.max(19, ...active);
  return hourly
    .filter((h) => h.hour >= first && h.hour <= last)
    .map((h) => ({ label: String(h.hour).padStart(2, '0'), value: h.revenue }));
}

/** Bell with an "orders waiting" badge; taps through to the KDS when the role may open it. */
function NotificationBell({ count, onPress }: { count: number; onPress?: () => void }) {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `ออเดอร์รอทำ ${count} รายการ` : 'ไม่มีออเดอร์รอทำ'}
      className="h-11 w-11 items-center justify-center rounded-[8px] border border-border bg-card active:bg-muted dark:border-dark-border dark:bg-dark-card dark:active:bg-dark-muted"
    >
      <Bell size={20} color={count > 0 ? t.primary : t.mutedForeground} />
      {count > 0 ? (
        <View className="absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 dark:bg-dark-danger">
          <Text className="text-[10px] font-bold text-white dark:text-dark-background">{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ActionRow({ color, title, sub }: { color: string; title: string; sub?: string }) {
  return (
    <View className="flex-row items-center gap-[11px] border-t border-muted px-4 py-[11px] dark:border-dark-muted">
      <View className="h-9 w-1.5 rounded-[3px]" style={{ backgroundColor: color }} />
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">{title}</Text>
        {sub ? (
          <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground" numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
