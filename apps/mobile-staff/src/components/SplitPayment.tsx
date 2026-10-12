import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Banknote, QrCode, ScanLine, Trash2, Plus, Minus, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { formatCurrency } from '@/lib/format';
import { generatePromptPayPayload } from '@/lib/promptpay';
import { useThemeColors } from '@/lib/theme';
import { uuid } from '@/lib/uuid';
import { equalShares, parseAmount, r2, splitTotals, type SplitLine, type SplitMethod } from '@/lib/splitPayment';

interface Props {
  total: number;
  lines: SplitLine[];
  onChange: (lines: SplitLine[]) => void;
  /** PromptPay ID for direct-QR lines; empty when split PromptPay isn't available. */
  promptPayId: string;
  /** Hint shown when PromptPay can't be used in split mode. */
  promptPayHint: string | null;
  slipEnabled: boolean;
  onScanSlip: (lineId: string) => void;
}

const METHODS: { key: SplitMethod; label: string; Icon: typeof Banknote }[] = [
  { key: 'CASH', label: 'เงินสด', Icon: Banknote },
  { key: 'PROMPTPAY', label: 'พร้อมเพย์', Icon: QrCode },
  { key: 'TRANSFER', label: 'โอน', Icon: ScanLine },
];

export function SplitPayment({ total, lines, onChange, promptPayId, promptPayHint, slipEnabled, onScanSlip }: Props) {
  const t = useThemeColors();
  const [people, setPeople] = useState(2);
  const totals = splitTotals(lines, total);

  function update(id: string, patch: Partial<SplitLine>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLine() {
    onChange([...lines, { id: uuid(), method: 'CASH', amount: totals.remaining > 0 ? totals.remaining.toFixed(2) : '' }]);
  }
  function applyEqual() {
    onChange(equalShares(total, people).map((a) => ({ id: uuid(), method: 'CASH' as const, amount: a.toFixed(2) })));
  }

  return (
    <View className="gap-3">
      {/* Paid / remaining / change */}
      <View className="flex-row rounded-[10px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
        {[
          { label: 'ชำระแล้ว', value: totals.paid, color: t.foreground },
          { label: 'คงเหลือ', value: totals.remaining, color: totals.remaining > 0.001 ? t.warning : t.success },
          { label: 'เงินทอน', value: totals.change, color: t.foreground },
        ].map((c, i) => (
          <View key={c.label} className={`flex-1 items-center py-2.5 ${i > 0 ? 'border-l border-border dark:border-dark-border' : ''}`}>
            <Text className="text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{c.label}</Text>
            <Text style={{ color: c.color }} className="text-[16px] font-bold">{formatCurrency(c.value)}</Text>
          </View>
        ))}
      </View>

      {/* Equal split helper */}
      <View className="flex-row items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2.5 dark:border-dark-border dark:bg-dark-card">
        <Text className="flex-1 text-[13px] font-medium text-foreground dark:text-dark-foreground">หารเท่ากัน</Text>
        <Pressable onPress={() => setPeople((n) => Math.max(2, n - 1))} hitSlop={8} className="h-8 w-8 items-center justify-center rounded-full border border-border dark:border-dark-border">
          <Minus size={14} color={t.foreground} />
        </Pressable>
        <Text className="min-w-[56px] text-center text-[14px] font-bold text-foreground dark:text-dark-foreground">{people} คน</Text>
        <Pressable onPress={() => setPeople((n) => Math.min(20, n + 1))} hitSlop={8} className="h-8 w-8 items-center justify-center rounded-full border border-border dark:border-dark-border">
          <Plus size={14} color={t.foreground} />
        </Pressable>
        <Pressable onPress={applyEqual} className="ml-1 h-8 items-center justify-center rounded-lg border border-primary px-3">
          <Text className="text-[12px] font-semibold text-primary dark:text-primary-400">แบ่ง</Text>
        </Pressable>
      </View>
      {promptPayHint ? (
        <Text className="px-1 text-[11px] text-muted-foreground dark:text-dark-muted-foreground">{promptPayHint}</Text>
      ) : null}

      {lines.map((l, idx) => (
        <LineCard
          key={l.id}
          index={idx}
          line={l}
          total={total}
          remainingExcludingThis={Math.max(0, r2(total - (totals.paid - parseAmount(l.amount))))}
          promptPayId={promptPayId}
          slipEnabled={slipEnabled}
          onChange={(patch) => update(l.id, patch)}
          onRemove={() => onChange(lines.filter((x) => x.id !== l.id))}
          onScan={() => onScanSlip(l.id)}
        />
      ))}

      <Pressable onPress={addLine} className="h-11 flex-row items-center justify-center gap-1.5 rounded-lg border border-primary bg-card dark:bg-dark-card">
        <Plus size={16} color={t.primary} />
        <Text className="text-[14px] font-semibold text-primary dark:text-primary-400">เพิ่มรายการชำระ</Text>
      </Pressable>
    </View>
  );
}

function LineCard({ index, line, remainingExcludingThis, promptPayId, slipEnabled, onChange, onRemove, onScan }: {
  index: number;
  line: SplitLine;
  total: number;
  remainingExcludingThis: number;
  promptPayId: string;
  slipEnabled: boolean;
  onChange: (patch: Partial<SplitLine>) => void;
  onRemove: () => void;
  onScan: () => void;
}) {
  const t = useThemeColors();
  const amount = parseAmount(line.amount);
  const ppUnavailable = !promptPayId;
  const transferUnavailable = !slipEnabled;

  const qr = useMemo(() => {
    if (line.method !== 'PROMPTPAY' || !promptPayId || amount <= 0) return { payload: null as string | null, error: null as string | null };
    try {
      return { payload: generatePromptPayPayload(promptPayId, amount), error: null };
    } catch (e) {
      return { payload: null, error: e instanceof Error ? e.message : 'สร้าง QR ไม่สำเร็จ' };
    }
  }, [line.method, promptPayId, amount]);

  const slip = line.slip;
  const showSlip = line.method === 'TRANSFER' || (line.method === 'PROMPTPAY' && slipEnabled);

  return (
    <View className="gap-3 rounded-[10px] border border-border bg-card p-3 dark:border-dark-border dark:bg-dark-card">
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-bold text-foreground dark:text-dark-foreground">รายการที่ {index + 1}</Text>
        <Pressable onPress={onRemove} hitSlop={10}>
          <Trash2 size={17} color={t.danger} />
        </Pressable>
      </View>

      <View className="flex-row gap-2">
        {METHODS.map(({ key, label, Icon }) => {
          const on = line.method === key;
          const disabled = (key === 'PROMPTPAY' && ppUnavailable) || (key === 'TRANSFER' && transferUnavailable);
          return (
            <Pressable
              key={key}
              disabled={disabled}
              onPress={() => onChange({ method: key, slip: null })}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${on ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'} ${disabled ? 'opacity-40' : ''}`}
            >
              <Icon size={15} color={on ? '#FFFFFF' : t.mutedForeground} />
              <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row items-center gap-2">
        <TextInput
          keyboardType="decimal-pad"
          value={line.amount}
          onChangeText={(v) => onChange({ amount: v.replace(/[^0-9.]/g, '') })}
          placeholder="0.00"
          placeholderTextColor={t.placeholder}
          className="h-12 flex-1 rounded-lg border border-border bg-input px-3 text-[20px] font-bold text-foreground dark:border-dark-border dark:bg-dark-input dark:text-dark-foreground"
        />
        <Pressable
          onPress={() => onChange({ amount: remainingExcludingThis > 0 ? remainingExcludingThis.toFixed(2) : '' })}
          className="h-12 items-center justify-center rounded-lg border border-border px-3 dark:border-dark-border"
        >
          <Text className="text-[12px] font-medium text-foreground dark:text-dark-foreground">ที่เหลือ</Text>
        </Pressable>
      </View>

      {line.method === 'PROMPTPAY' && promptPayId ? (
        qr.error ? (
          <View className="flex-row items-start gap-1.5 rounded-lg bg-danger/10 p-3">
            <AlertTriangle size={16} color={t.danger} />
            <Text className="flex-1 text-[13px] text-danger dark:text-dark-danger">{qr.error}</Text>
          </View>
        ) : qr.payload ? (
          <View className="items-center gap-2">
            <View className="rounded-xl border border-border bg-white p-3 dark:border-dark-border">
              <QRCode value={qr.payload} size={190} />
            </View>
            <Text className="text-center text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
              QR นี้ตามยอด {formatCurrency(amount)} — ให้ลูกค้าสแกนจ่ายแล้วจึงกดยืนยันรับเงิน
            </Text>
          </View>
        ) : (
          <Text className="text-center text-[12px] text-muted-foreground dark:text-dark-muted-foreground">ใส่จำนวนเงินเพื่อสร้าง QR</Text>
        )
      ) : null}

      {showSlip ? (
        <View className="gap-2">
          <Pressable
            onPress={onScan}
            disabled={amount <= 0}
            className={`h-10 flex-row items-center justify-center gap-1.5 rounded-lg border border-primary ${amount <= 0 ? 'opacity-40' : ''}`}
          >
            <ScanLine size={15} color={t.primary} />
            <Text className="text-[13px] font-semibold text-primary dark:text-primary-400">
              {line.method === 'TRANSFER' ? 'สแกน QR บนสลิปโอนเงิน' : 'สแกนสลิปเพื่อตรวจสอบ (ไม่บังคับ)'}
            </Text>
          </Pressable>
          {line.slipVerifying ? (
            <View className="flex-row items-center justify-center gap-1.5">
              <ActivityIndicator size="small" color={t.primary} />
              <Text className="text-[13px] text-muted-foreground dark:text-dark-muted-foreground">กำลังตรวจสอบสลิป…</Text>
            </View>
          ) : null}
          {slip && !line.slipVerifying ? (
            <View className={`flex-row items-start gap-1.5 rounded-lg p-3 ${slip.ok ? 'bg-success/10' : 'bg-warning/10'}`}>
              {slip.ok ? <CheckCircle2 size={16} color={t.success} /> : <AlertTriangle size={16} color={t.warning} />}
              <Text className={`flex-1 text-[13px] ${slip.ok ? 'text-success dark:text-dark-success' : 'text-warning dark:text-dark-warning'}`}>
                {slip.ok
                  ? `ตรวจสอบสลิปผ่าน${slip.amount != null ? ` · ${formatCurrency(slip.amount)}` : ''}${slip.senderName ? ` · ${slip.senderName}` : ''}`
                  : slip.reason || 'ตรวจสอบสลิปไม่ผ่าน'}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
