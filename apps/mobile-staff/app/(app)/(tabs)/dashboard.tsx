import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, AlertTriangle, Info, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import type { DashboardOverview } from '@/types/backoffice';
import type { OrderStatus } from '@/types/pos';

const INSIGHT_ICON: Record<string, { icon: typeof Info; color: string }> = {
  positive: { icon: CheckCircle2, color: '#10B981' },
  neutral: { icon: Info, color: '#6B7280' },
  warning: { icon: AlertTriangle, color: '#F59E0B' },
  critical: { icon: AlertCircle, color: '#EF4444' },
};

export default function DashboardScreen() {
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

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="p-4 gap-4"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#C9622E" />}
      >
        <SectionCard>
          <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ยอดขายวันนี้</Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-metric-lg text-foreground dark:text-dark-foreground">{formatCurrency(data.today.revenue)}</Text>
            {vsYesterday != null ? (
              <View
                className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${vsYesterday >= 0 ? 'bg-success/10' : 'bg-danger/10'}`}
              >
                {vsYesterday >= 0 ? (
                  <TrendingUp size={12} color="#10B981" />
                ) : (
                  <TrendingDown size={12} color="#EF4444" />
                )}
                <Text className={`text-[11px] font-semibold ${vsYesterday >= 0 ? 'text-success' : 'text-danger'}`}>
                  {Math.abs(vsYesterday).toFixed(1)}%
                </Text>
              </View>
            ) : null}
          </View>
          <View className="flex-row justify-between mt-2">
            <MiniStat label="ออเดอร์" value={String(data.today.orders)} />
            <MiniStat label="ยอด/บิล" value={formatCurrency(data.today.avgTicket)} />
            <MiniStat label="โต๊ะที่ใช้งาน" value={`${data.restaurant.activeTables}/${data.restaurant.totalTables}`} />
            <MiniStat label="รอครัว" value={String(data.restaurant.pendingKitchen)} />
          </View>
        </SectionCard>

        {data.insights.length > 0 ? (
          <SectionCard title="สรุปสถานการณ์">
            {data.insights.map((ins, i) => {
              const cfg = INSIGHT_ICON[ins.type] ?? INSIGHT_ICON.neutral;
              const Icon = cfg.icon;
              return (
                <View key={i} className="flex-row items-start gap-2">
                  <Icon size={15} color={cfg.color} />
                  <Text className="flex-1 text-[13px] text-foreground dark:text-dark-foreground">{ins.text}</Text>
                </View>
              );
            })}
          </SectionCard>
        ) : null}

        {data.alerts.lowStock.length > 0 ? (
          <SectionCard title={`สต็อกใกล้หมด (${data.alerts.lowStock.length})`}>
            {data.alerts.lowStock.map((item) => (
              <View key={item.id} className="flex-row items-center justify-between">
                <Text className="text-[13px] text-foreground dark:text-dark-foreground">{item.name}</Text>
                <Text className="text-[12px] text-warning font-medium">
                  {item.quantity}/{item.lowStockAt}
                </Text>
              </View>
            ))}
          </SectionCard>
        ) : null}

        <SectionCard title="สินค้าขายดีวันนี้">
          {data.topItems.length === 0 ? (
            <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีข้อมูล</Text>
          ) : (
            data.topItems.map((item, i) => (
              <View key={i} className="flex-row items-center justify-between">
                <Text className="flex-1 text-[13px] text-foreground dark:text-dark-foreground" numberOfLines={1}>
                  {item.name} × {item.qty}
                </Text>
                <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">{formatCurrency(item.revenue)}</Text>
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard title="ออเดอร์ล่าสุด">
          {data.recentOrders.length === 0 ? (
            <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ยังไม่มีออเดอร์</Text>
          ) : (
            data.recentOrders.map((o) => (
              <View key={o.id} className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">#{o.orderNumber}</Text>
                  <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">
                    {o.tableNumber ? `โต๊ะ ${o.tableNumber}` : o.type} · {formatTime(o.createdAt)}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{formatCurrency(o.total)}</Text>
                  <StatusBadge status={o.status as OrderStatus} />
                </View>
              </View>
            ))
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
      <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{value}</Text>
    </View>
  );
}
