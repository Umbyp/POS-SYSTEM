import { View, Text, ScrollView, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge, SPINE_COLOR } from '@/components/StatusBadge';
import type { DashboardOverview } from '@/types/backoffice';
import type { OrderStatus } from '@/types/pos';

const INSIGHT_SPINE: Record<string, string> = {
  positive: '#047857',
  neutral: '#1D4ED8',
  warning: '#B45309',
  critical: '#B91C1C',
};

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => (await api.get('/dashboard/overview')).data as DashboardOverview,
    refetchInterval: 30000,
  });

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-dark-background">
        <ActivityIndicator color="#C9622E" />
      </View>
    );
  }

  const vsYesterday = data.today.vsYesterdayPct;
  const maxQty = Math.max(1, ...data.topItems.map((t) => t.qty));
  const lowStock = data.alerts.lowStock;
  const pendingKitchen = data.restaurant.pendingKitchen;
  const hasActions = data.insights.length > 0 || lowStock.length > 0 || pendingKitchen > 0;

  const stats = [
    { label: 'ออเดอร์', value: String(data.today.orders), amber: false },
    { label: 'ยอด/บิล', value: formatCurrency(data.today.avgTicket), amber: false },
    { label: 'โต๊ะใช้งาน', value: `${data.restaurant.activeTables}/${data.restaurant.totalTables}`, amber: false },
    { label: 'รอครัว', value: String(pendingKitchen), amber: pendingKitchen > 0 },
  ];

  const hero = (
    <SectionCard>
      <Text className="text-[12px] font-semibold text-[#8C6A4F] dark:text-dark-muted-foreground">ยอดขายวันนี้</Text>
      <View className="flex-row flex-wrap items-baseline gap-2.5">
        <Text className="text-metric-lg text-foreground dark:text-dark-foreground">{formatCurrency(data.today.revenue)}</Text>
        {vsYesterday != null ? (
          <View
            className={`flex-row items-center gap-1 rounded-full px-2 py-[3px] ${vsYesterday >= 0 ? 'bg-[#ECFDF5]' : 'bg-[#FEE2E2]'}`}
          >
            {vsYesterday >= 0 ? <TrendingUp size={12} color="#047857" /> : <TrendingDown size={12} color="#B91C1C" />}
            <Text className={`text-[12px] font-bold ${vsYesterday >= 0 ? 'text-success' : 'text-danger'}`}>
              {Math.abs(vsYesterday).toFixed(1)}%{wide ? ' เทียบเมื่อวาน' : ''}
            </Text>
          </View>
        ) : null}
      </View>
      {wide ? null : (
        <View className="flex-row justify-between border-t border-border dark:border-dark-border pt-3">
          {stats.map((st) => (
            <MiniStat key={st.label} label={st.label} value={st.value} amber={st.amber} />
          ))}
        </View>
      )}
    </SectionCard>
  );

  const actions = hasActions ? (
    <View className="overflow-hidden rounded-[14px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
      <Text className="px-4 pb-2 pt-3 text-[12px] font-semibold text-[#8C6A4F] dark:text-dark-muted-foreground">ต้องจัดการก่อน</Text>
      {pendingKitchen > 0 ? (
        <ActionRow color="#B45309" title={`รอครัว ${pendingKitchen} รายการ`} />
      ) : null}
      {data.insights.map((ins, i) => (
        <ActionRow key={i} color={INSIGHT_SPINE[ins.type] ?? INSIGHT_SPINE.neutral} title={ins.text} />
      ))}
      {lowStock.length > 0 ? (
        <ActionRow
          color="#B45309"
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
                className="h-1.5 rounded-full bg-foreground dark:bg-dark-foreground"
                style={{ width: `${Math.max(4, (item.qty / maxQty) * 100)}%` }}
              />
            </View>
          </View>
        ))
      )}
    </SectionCard>
  );

  const recent = (
    <SectionCard title="ออเดอร์ล่าสุด">
      {data.recentOrders.length === 0 ? (
        <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีออเดอร์</Text>
      ) : (
        data.recentOrders.map((o) => (
          <View key={o.id} className="flex-row items-center gap-2.5">
            <View className="h-9 w-1.5 rounded-[3px]" style={{ backgroundColor: SPINE_COLOR[o.status as OrderStatus] ?? '#D8C7B8' }} />
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-foreground dark:text-dark-foreground">#{o.orderNumber}</Text>
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
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerClassName={wide ? 'p-5 gap-4' : 'p-3.5 gap-3'}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#C9622E" />}
      >
        {wide ? (
          <View className="flex-row gap-4">
            <View className="flex-[1.5]">{hero}</View>
            <View className="flex-1 flex-row flex-wrap gap-3">
              {stats.map((st) => (
                <View
                  key={st.label}
                  className="basis-[47%] grow justify-center rounded-[14px] border border-border bg-card p-3.5 dark:border-dark-border dark:bg-dark-card"
                >
                  <Text className="text-[10px] font-semibold text-[#8C6A4F] dark:text-dark-muted-foreground">{st.label}</Text>
                  <Text className={`text-[26px] font-bold ${st.amber ? 'text-warning' : 'text-foreground dark:text-dark-foreground'}`}>
                    {st.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          hero
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

function MiniStat({ label, value, amber }: { label: string; value: string; amber?: boolean }) {
  return (
    <View>
      <Text className="text-[10px] font-semibold text-[#8C6A4F] dark:text-dark-muted-foreground">{label}</Text>
      <Text className={`text-[17px] font-bold ${amber ? 'text-warning' : 'text-foreground dark:text-dark-foreground'}`}>{value}</Text>
    </View>
  );
}
