import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { SectionCard } from '@/components/SectionCard';
import type { ReportSummary } from '@/types/backoffice';

const RANGES = [
  { key: 'today', label: 'วันนี้', days: 0 },
  { key: '7d', label: '7 วัน', days: 7 },
  { key: '30d', label: '30 วัน', days: 30 },
  { key: '90d', label: '90 วัน', days: 90 },
] as const;

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'เงินสด',
  PROMPTPAY: 'พร้อมเพย์',
  BANK_TRANSFER: 'โอนเงิน',
  CREDIT_CARD: 'บัตรเครดิต',
};

function rangeToDates(days: number) {
  const to = new Date();
  const from = new Date();
  if (days === 0) from.setHours(0, 0, 0, 0);
  else from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function ReportsScreen() {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('today');

  const { data, isLoading } = useQuery({
    queryKey: ['reports-summary', range],
    queryFn: async () => {
      const r = RANGES.find((x) => x.key === range)!;
      const { from, to } = rangeToDates(r.days);
      return (await api.get('/reports/summary', { params: { from, to } })).data as ReportSummary;
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-row gap-2 px-4 py-3">
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRange(r.key)}
            className={`flex-1 items-center rounded-lg py-2 ${range === r.key ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'}`}
          >
            <Text className={`text-[13px] font-semibold ${range === r.key ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading || !data ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FF6B35" />
        </View>
      ) : (
        <ScrollView contentContainerClassName="p-4 gap-4">
          <SectionCard>
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ยอดขาย</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-metric-md text-foreground dark:text-dark-foreground">{formatCurrency(data.revenue)}</Text>
              {data.growth.revenue != null ? <GrowthBadge value={data.growth.revenue} /> : null}
            </View>
            <View className="flex-row justify-between mt-2">
              <MiniStat label="ออเดอร์" value={String(data.orderCount)} />
              <MiniStat label="ยอด/บิล" value={formatCurrency(data.avgTicket)} />
              <MiniStat label="กำไรขั้นต้น" value={formatCurrency(data.grossProfit)} />
              <MiniStat label="มาร์จิ้น" value={`${data.profitMargin.toFixed(1)}%`} />
            </View>
          </SectionCard>

          <SectionCard title="สินค้าขายดี">
            {data.topProducts.length === 0 ? (
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีข้อมูล</Text>
            ) : (
              data.topProducts.slice(0, 8).map((p, i) => (
                <View key={i} className="flex-row items-center justify-between">
                  <Text className="flex-1 text-[13px] text-foreground dark:text-dark-foreground" numberOfLines={1}>
                    {p.product.name} × {p.quantity}
                  </Text>
                  <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">{formatCurrency(p.revenue)}</Text>
                </View>
              ))
            )}
          </SectionCard>

          <SectionCard title="ช่องทางการชำระเงิน">
            {data.paymentBreakdown.length === 0 ? (
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">ไม่มีข้อมูล</Text>
            ) : (
              data.paymentBreakdown.map((p, i) => (
                <View key={i} className="flex-row items-center justify-between">
                  <Text className="text-[13px] text-foreground dark:text-dark-foreground">
                    {PAYMENT_LABEL[p.method] ?? p.method} ({p.count})
                  </Text>
                  <Text className="text-[13px] font-medium text-foreground dark:text-dark-foreground">{formatCurrency(p.amount)}</Text>
                </View>
              ))
            )}
          </SectionCard>
        </ScrollView>
      )}
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

function GrowthBadge({ value }: { value: number }) {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${positive ? 'bg-success/10' : 'bg-danger/10'}`}>
      <Icon size={12} color={positive ? '#10B981' : '#EF4444'} />
      <Text className={`text-[11px] font-semibold ${positive ? 'text-success' : 'text-danger'}`}>{Math.abs(value).toFixed(1)}%</Text>
    </View>
  );
}
