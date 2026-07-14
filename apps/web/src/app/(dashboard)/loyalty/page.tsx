'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stamp, Coins, Search, Settings2, Plus, Minus, History, QrCode, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Mode = 'OFF' | 'POINTS' | 'STAMPS' | 'BOTH';

const TX_META: Record<string, { label: string; tone: string }> = {
  EARN: { label: 'ได้แต้ม', tone: 'text-emerald-600 dark:text-emerald-400' },
  REDEEM: { label: 'ใช้แต้ม', tone: 'text-rose-600 dark:text-rose-400' },
  STAMP_EARN: { label: 'ได้ดวง', tone: 'text-emerald-600 dark:text-emerald-400' },
  STAMP_REDEEM: { label: 'แลกรางวัล', tone: 'text-rose-600 dark:text-rose-400' },
  REFUND_REVERSAL: { label: 'คืนเงิน/ปรับกลับ', tone: 'text-amber-600 dark:text-amber-400' },
  MANUAL_ADJUST: { label: 'ปรับแต้มเอง', tone: 'text-sky-600 dark:text-sky-400' },
  STAMP_ADJUST: { label: 'ปรับดวงเอง', tone: 'text-sky-600 dark:text-sky-400' },
};

export default function LoyaltyPage() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<any>(null);

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['loyalty-members', q],
    queryFn: () =>
      api.get('/customers', { params: { q: q || undefined, limit: 200 } }).then((r) => r.data),
  });

  const mode: Mode = store?.loyaltyMode ?? 'BOTH';
  const showPoints = mode === 'POINTS' || mode === 'BOTH';
  const showStamps = mode === 'STAMPS' || mode === 'BOTH';

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin space-y-6">
      <div className="flex items-center gap-2">
        <Stamp className="w-5 h-5" />
        <h2 className="text-xl font-semibold tracking-tight">สะสมแต้ม / สมาชิก</h2>
      </div>

      <LoyaltySettings store={store} />

      {/* Members */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">สมาชิก ({customers.length})</h3>
          <div className="relative w-full max-w-xs">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ / เบอร์โทร"
              className="pl-8"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer h-12 rounded-lg" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">ยังไม่มีสมาชิก</div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
            {customers.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-card-hover text-left transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.phone || '—'}</div>
                </div>
                {showPoints && (
                  <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    <Coins className="w-3.5 h-3.5" /> {c.points ?? 0}
                  </span>
                )}
                {showStamps && (
                  <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-indigo-600 dark:text-indigo-400 min-w-[3rem] justify-end">
                    <Stamp className="w-3.5 h-3.5" /> {c.stamps ?? 0}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <MemberDetailDialog
        customer={selected}
        store={store}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function LoyaltySettings({ store }: { store: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [memberUrl, setMemberUrl] = useState('');

  useEffect(() => {
    if (store?.id) {
      const url = `${window.location.origin}/member?storeId=${store.id}`;
      setMemberUrl(url);
      import('qrcode').then((QRCode) => {
        QRCode.default.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'H' })
          .then(setQrDataUrl)
          .catch(() => setQrDataUrl(''));
      });
    }
  }, [store]);

  useEffect(() => {
    if (store) {
      setForm({
        loyaltyMode: store.loyaltyMode ?? 'BOTH',
        pointsEarnBaht: String(store.pointsEarnBaht ?? 100),
        pointValue: String(store.pointValue ?? 1),
        minRedeemPoints: String(store.minRedeemPoints ?? 0),
        stampsPerReward: String(store.stampsPerReward ?? 10),
        stampRewardValue: String(store.stampRewardValue ?? 0),
        stampRewardName: store.stampRewardName ?? '',
      });
    }
  }, [store]);

  const save = useMutation({
    mutationFn: (payload: any) => api.patch('/stores/me', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-me'] });
      toast.success('บันทึกการตั้งค่าแล้ว');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  if (!form) return <div className="shimmer h-40 rounded-xl" />;

  const modes: { v: Mode; label: string; desc: string }[] = [
    { v: 'BOTH', label: 'แต้ม + ดวง', desc: 'เปิดทั้งสองแบบ' },
    { v: 'POINTS', label: 'แต้มตามยอด', desc: 'จ่ายมากได้แต้มมาก' },
    { v: 'STAMPS', label: 'ดวง (บัตรสะสม)', desc: 'มา 1 ครั้ง = 1 ดวง' },
    { v: 'OFF', label: 'ปิด', desc: 'ไม่สะสมแต้ม' },
  ];
  const showPoints = form.loyaltyMode === 'POINTS' || form.loyaltyMode === 'BOTH';
  const showStamps = form.loyaltyMode === 'STAMPS' || form.loyaltyMode === 'BOTH';

  const submit = () => {
    save.mutate({
      loyaltyMode: form.loyaltyMode,
      pointsEarnBaht: parseInt(form.pointsEarnBaht) || 0,
      pointValue: parseFloat(form.pointValue) || 0,
      minRedeemPoints: parseInt(form.minRedeemPoints) || 0,
      stampsPerReward: parseInt(form.stampsPerReward) || 1,
      stampRewardValue: parseFloat(form.stampRewardValue) || 0,
      stampRewardName: form.stampRewardName || null,
    });
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-4 bg-card">
      <div className="flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">ตั้งค่าโปรแกรมสะสมแต้ม</h3>
      </div>

      {/* Mode picker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {modes.map((m) => {
          const active = form.loyaltyMode === m.v;
          return (
            <button
              key={m.v}
              onClick={() => setForm({ ...form, loyaltyMode: m.v })}
              className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-muted-foreground bg-card'
              }`}
            >
              <div className="text-sm font-medium">{m.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {showPoints && (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" /> แต้มตามยอด
            </div>
            <NumField label="ใช้จ่ายกี่บาท ได้ 1 แต้ม" value={form.pointsEarnBaht}
              onChange={(v) => setForm({ ...form, pointsEarnBaht: v })} />
            <NumField label="1 แต้ม = ส่วนลดกี่บาท" value={form.pointValue}
              onChange={(v) => setForm({ ...form, pointValue: v })} />
            <NumField label="ใช้แต้มขั้นต่ำต่อครั้ง (0 = ไม่จำกัด)" value={form.minRedeemPoints}
              onChange={(v) => setForm({ ...form, minRedeemPoints: v })} />
          </div>
        )}
        {showStamps && (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <Stamp className="w-3.5 h-3.5" /> บัตรสะสมดวง
            </div>
            <NumField label="ครบกี่ดวง ได้ 1 รางวัล" value={form.stampsPerReward}
              onChange={(v) => setForm({ ...form, stampsPerReward: v })} />
            <NumField label="รางวัล = ส่วนลดกี่บาท" value={form.stampRewardValue}
              onChange={(v) => setForm({ ...form, stampRewardValue: v })} />
            <div>
              <Label className="mb-1 block text-xs">ชื่อรางวัล (เช่น กาแฟฟรี 1 แก้ว)</Label>
              <Input value={form.stampRewardName}
                onChange={(e) => setForm({ ...form, stampRewardName: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={save.isPending}>บันทึกการตั้งค่า</Button>
      </div>

      {/* QR Code and Member Link section */}
      {store?.id && (
        <div className="pt-4 border-t border-border mt-4">
          <div className="flex items-center gap-2 mb-3">
            <QrCode className="w-4 h-4 text-indigo-500" />
            <h4 className="text-xs font-semibold text-foreground">คิวอาร์โค้ดสมัครสมาชิกสำหรับลูกค้า (Customer Registration Portal)</h4>
          </div>
          <div className="flex flex-col md:flex-row gap-4 bg-muted/30 p-3 rounded-lg border border-border">
            {qrDataUrl && (
              <div className="flex-shrink-0 flex flex-col items-center gap-2 bg-white p-2 rounded-lg border border-border max-w-[140px] mx-auto md:mx-0">
                <img src={qrDataUrl} alt="Registration QR Code" className="w-28 h-28 animate-fade-in" />
                <a 
                  href={qrDataUrl} 
                  download={`${store.name}_member_qr.png`}
                  className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold"
                >
                  <Download className="w-3 h-3" /> ดาวน์โหลด QR
                </a>
              </div>
            )}
            <div className="flex-1 flex flex-col justify-between space-y-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  ร้านค้าสามารถพิมพ์คิวอาร์โค้ดนี้หรือคัดลอกลิงก์สมาชิกเพื่อแชร์ให้ลูกค้าสแกนสมัครสมาชิกด้วยตัวเอง
                  และเข้ามาดูแต้มหรือดวงสะสมผ่านหน้าจอมือถือได้ทันที
                </p>
                <div className="text-[11px] font-mono bg-slate-900 border border-slate-800 p-2 rounded text-slate-300 break-all select-all flex items-center justify-between gap-2 mt-2">
                  <span className="truncate">{memberUrl}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(memberUrl);
                      toast.success('คัดลอกลิงก์ไปยังคลิปบอร์ดแล้ว');
                    }}
                    className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    title="Copy Link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      <Input type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function MemberDetailDialog({ customer, store, onClose }: { customer: any; store: any; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!customer;
  const mode: Mode = store?.loyaltyMode ?? 'BOTH';
  const showPoints = mode === 'POINTS' || mode === 'BOTH';
  const showStamps = mode === 'STAMPS' || mode === 'BOTH';

  const { data, isLoading } = useQuery({
    queryKey: ['customer-points', customer?.id],
    queryFn: () => api.get(`/customers/${customer.id}/points`).then((r) => r.data),
    enabled: open,
  });

  const adjust = useMutation({
    mutationFn: (payload: { kind: 'points' | 'stamps'; delta: number }) =>
      api.post(`/customers/${customer.id}/adjust`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-points', customer.id] });
      qc.invalidateQueries({ queryKey: ['loyalty-members'] });
      toast.success('ปรับเรียบร้อย');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'ปรับไม่สำเร็จ'),
  });

  const points = data?.customer?.points ?? customer?.points ?? 0;
  const stamps = customer?.stamps ?? 0;
  const perReward = store?.stampsPerReward ?? 10;
  const cardsReady = perReward > 0 ? Math.floor(stamps / perReward) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {customer && (
          <>
            <DialogHeader>
              <DialogTitle>{customer.name}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3">
              {showPoints && (
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> แต้ม</div>
                  <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{points}</div>
                  <AdjustRow onAdd={() => adjust.mutate({ kind: 'points', delta: 1 })}
                    onSub={() => adjust.mutate({ kind: 'points', delta: -1 })} disabled={adjust.isPending} />
                </div>
              )}
              {showStamps && (
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Stamp className="w-3.5 h-3.5" /> ดวง</div>
                  <div className="text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{stamps}</div>
                  {cardsReady > 0 && (
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ครบแลกได้ {cardsReady} รางวัล
                    </div>
                  )}
                  <AdjustRow onAdd={() => adjust.mutate({ kind: 'stamps', delta: 1 })}
                    onSub={() => adjust.mutate({ kind: 'stamps', delta: -1 })} disabled={adjust.isPending} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <History className="w-3.5 h-3.5" /> ประวัติ
              </div>
              {isLoading ? (
                <div className="shimmer h-24 rounded-lg" />
              ) : !data?.transactions?.length ? (
                <div className="text-xs text-muted-foreground py-4 text-center">ยังไม่มีประวัติ</div>
              ) : (
                <div className="max-h-64 overflow-y-auto scrollbar-thin divide-y divide-border border border-border rounded-lg">
                  {data.transactions.map((tx: any) => {
                    const meta = TX_META[tx.type] || { label: tx.type, tone: '' };
                    return (
                      <div key={tx.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className={`font-medium ${meta.tone}`}>{meta.label}</div>
                          <div className="text-muted-foreground truncate">{tx.note || formatDate(tx.createdAt)}</div>
                        </div>
                        <div className="text-right tabular-nums shrink-0 ml-2">
                          <div className={`font-semibold ${tx.points >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {tx.points >= 0 ? '+' : ''}{tx.points}
                          </div>
                          <div className="text-muted-foreground">คงเหลือ {tx.balanceAfter}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdjustRow({ onAdd, onSub, disabled }: { onAdd: () => void; onSub: () => void; disabled: boolean }) {
  return (
    <div className="flex gap-1.5 mt-2">
      <button onClick={onSub} disabled={disabled}
        className="flex-1 h-7 rounded border border-border hover:bg-card-hover flex items-center justify-center disabled:opacity-50">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button onClick={onAdd} disabled={disabled}
        className="flex-1 h-7 rounded border border-border hover:bg-card-hover flex items-center justify-center disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
