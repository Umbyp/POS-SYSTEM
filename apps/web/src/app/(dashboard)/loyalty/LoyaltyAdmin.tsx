'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, Gift, Plus, Trash2, Ticket, Timer, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const errMsg = (e: any, fallback: string) => e?.response?.data?.error || fallback;
const selectCls =
  'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary';

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-base font-extrabold">
          <span className="text-primary">{icon}</span> {title}
        </div>
        {hint && <div className="text-[13px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Tiers, rewards, redemption codes and point-expiry setting for the loyalty admin page. */
export function LoyaltyAdmin({ store }: { store: any }) {
  return (
    <>
      <ExpirySetting store={store} />
      <TiersManager />
      <RewardsManager />
      <RedemptionsPanel />
    </>
  );
}

// ------------------------------------------------------------ expiry -------
function ExpirySetting({ store }: { store: any }) {
  const qc = useQueryClient();
  const [months, setMonths] = useState('0');
  useEffect(() => {
    if (store) setMonths(String(store.pointsExpiryMonths ?? 0));
  }, [store]);
  const save = useMutation({
    mutationFn: () => api.patch('/stores/me', { pointsExpiryMonths: parseInt(months) || 0 }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-me'] });
      toast.success('บันทึกแล้ว');
    },
    onError: (e) => toast.error(errMsg(e, 'บันทึกไม่สำเร็จ')),
  });
  return (
    <Section
      icon={<Timer className="w-4 h-4" />}
      title="แต้มหมดอายุ"
      hint="แต้มที่ได้ใหม่จะหมดอายุหลังจากกี่เดือนนับจากวันที่ได้ (0 = ไม่หมดอายุ) — มีผลกับแต้มที่ได้หลังจากบันทึกเท่านั้น"
    >
      <div className="flex items-end gap-3 max-w-xs">
        <div className="flex-1">
          <Label className="mb-1 block text-xs">อายุแต้ม (เดือน)</Label>
          <Input type="number" min="0" max="120" value={months} onChange={(e) => setMonths(e.target.value)} className="h-9" />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>บันทึก</Button>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------- tiers -------
function TiersManager() {
  const qc = useQueryClient();
  const { data: tiers = [] } = useQuery<any[]>({
    queryKey: ['loyalty-tiers'],
    queryFn: () => api.get('/loyalty/tiers').then((r) => r.data),
  });
  const [draft, setDraft] = useState<Record<string, { name: string; minSpent: string }>>({});
  const [newTier, setNewTier] = useState({ name: '', minSpent: '' });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['loyalty-tiers'] });
    qc.invalidateQueries({ queryKey: ['loyalty-rewards'] });
  };

  const update = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/loyalty/tiers/${id}`, body),
    onSuccess: () => { refresh(); toast.success('บันทึกแล้ว'); },
    onError: (e) => toast.error(errMsg(e, 'บันทึกไม่สำเร็จ (เฉพาะเจ้าของ/แอดมิน)')),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post('/loyalty/tiers', {
        name: newTier.name.trim(), minSpent: parseFloat(newTier.minSpent) || 0, sortOrder: tiers.length,
      }),
    onSuccess: () => { setNewTier({ name: '', minSpent: '' }); refresh(); },
    onError: (e) => toast.error(errMsg(e, 'เพิ่มไม่สำเร็จ')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/loyalty/tiers/${id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errMsg(e, 'ลบไม่สำเร็จ')),
  });

  return (
    <Section
      icon={<Crown className="w-4 h-4" />}
      title="ระดับสมาชิก"
      hint="ระดับคำนวณจากยอดใช้จ่ายสะสมของลูกค้า — ถึงยอดขั้นต่ำของระดับไหนก็ได้ระดับนั้น"
    >
      <div className="space-y-2">
        {tiers.map((t) => {
          const d = draft[t.id] ?? { name: t.name, minSpent: String(t.minSpent) };
          const dirty = d.name !== t.name || Number(d.minSpent) !== t.minSpent;
          return (
            <div key={t.id} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color || '#8C6A4F' }} />
              <Input
                value={d.name}
                onChange={(e) => setDraft({ ...draft, [t.id]: { ...d, name: e.target.value } })}
                className="h-9 flex-1"
              />
              <div className="flex items-center gap-1 w-40 shrink-0">
                <span className="text-xs text-muted-foreground">฿</span>
                <Input
                  type="number" min="0" value={d.minSpent}
                  onChange={(e) => setDraft({ ...draft, [t.id]: { ...d, minSpent: e.target.value } })}
                  className="h-9"
                />
              </div>
              <Button
                size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty || update.isPending}
                onClick={() => update.mutate({ id: t.id, name: d.name.trim(), minSpent: parseFloat(d.minSpent) || 0 })}
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="sm" variant="outline" disabled={tiers.length <= 1}
                onClick={() => confirm(`ลบระดับ ${t.name}?`) && remove.mutate(t.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Input
          placeholder="ชื่อระดับใหม่ เช่น PLATINUM" value={newTier.name}
          onChange={(e) => setNewTier({ ...newTier, name: e.target.value })} className="h-9 flex-1"
        />
        <div className="flex items-center gap-1 w-40 shrink-0">
          <span className="text-xs text-muted-foreground">฿</span>
          <Input
            type="number" min="0" placeholder="ยอดขั้นต่ำ" value={newTier.minSpent}
            onChange={(e) => setNewTier({ ...newTier, minSpent: e.target.value })} className="h-9"
          />
        </div>
        <Button size="sm" disabled={!newTier.name.trim() || create.isPending} onClick={() => create.mutate()}>
          <Plus className="w-4 h-4 mr-1" /> เพิ่ม
        </Button>
      </div>
    </Section>
  );
}

// ----------------------------------------------------------- rewards -------
const emptyReward = {
  id: '', name: '', description: '', kind: 'FREE_ITEM', pointsCost: '0', discountAmount: '0',
  minTier: '', validFrom: '', validTo: '', isActive: true,
};
const toDateInput = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function RewardsManager() {
  const qc = useQueryClient();
  const [form, setForm] = useState<typeof emptyReward | null>(null);
  const { data: rewards = [] } = useQuery<any[]>({
    queryKey: ['loyalty-rewards'],
    queryFn: () => api.get('/loyalty/rewards').then((r) => r.data),
  });
  const { data: tiers = [] } = useQuery<any[]>({
    queryKey: ['loyalty-tiers'],
    queryFn: () => api.get('/loyalty/tiers').then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: (f: typeof emptyReward) => {
      const body = {
        name: f.name.trim(),
        description: f.description || null,
        kind: f.kind,
        pointsCost: parseInt(f.pointsCost) || 0,
        discountAmount: parseFloat(f.discountAmount) || 0,
        minTier: f.minTier || null,
        validFrom: f.validFrom ? new Date(f.validFrom).toISOString() : null,
        validTo: f.validTo ? new Date(`${f.validTo}T23:59:59`).toISOString() : null,
        isActive: f.isActive,
      };
      return f.id ? api.patch(`/loyalty/rewards/${f.id}`, body) : api.post('/loyalty/rewards', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty-rewards'] });
      setForm(null);
      toast.success('บันทึกแล้ว');
    },
    onError: (e) => toast.error(errMsg(e, 'บันทึกไม่สำเร็จ (เฉพาะเจ้าของ/แอดมิน)')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/loyalty/rewards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-rewards'] }),
    onError: (e) => toast.error(errMsg(e, 'ลบไม่สำเร็จ')),
  });

  const tierName = (id?: string | null) => tiers.find((t) => t.id === id)?.name;

  return (
    <Section
      icon={<Gift className="w-4 h-4" />}
      title="รางวัล / คูปอง"
      hint="แสดงเป็นการ์ด “สิทธิพิเศษเฉพาะคุณ” บนหน้าสมาชิก — ใส่แต้ม 0 = รับฟรี, กำหนดระดับขั้นต่ำ = พิเศษเฉพาะระดับ"
    >
      <div className="space-y-2">
        {rewards.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีรางวัล</div>}
        {rewards.map((r) => (
          <div key={r.id} className={`flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 ${r.isActive ? '' : 'opacity-50'}`}>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold truncate">{r.name}</div>
              <div className="text-[11.5px] text-muted-foreground truncate">
                {r.pointsCost > 0 ? `${r.pointsCost} แต้ม` : 'รับฟรี'}
                {r.kind === 'DISCOUNT' && Number(r.discountAmount) > 0 && ` · ลด ${formatCurrency(r.discountAmount)}`}
                {r.minTier && ` · ระดับ ${tierName(r.minTier) ?? '?'}+`}
                {r.validTo && ` · ถึง ${formatDate(r.validTo)}`}
                {!r.isActive && ' · ปิดอยู่'}
              </div>
            </div>
            <Button
              size="sm" variant="outline"
              onClick={() =>
                setForm({
                  id: r.id, name: r.name, description: r.description ?? '', kind: r.kind,
                  pointsCost: String(r.pointsCost), discountAmount: String(r.discountAmount),
                  minTier: r.minTier ?? '', validFrom: toDateInput(r.validFrom), validTo: toDateInput(r.validTo),
                  isActive: r.isActive,
                })
              }
            >
              แก้ไข
            </Button>
            <Button size="sm" variant="outline" onClick={() => confirm(`ลบรางวัล "${r.name}"?`) && remove.mutate(r.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={() => setForm({ ...emptyReward })}>
        <Plus className="w-4 h-4 mr-1" /> เพิ่มรางวัล
      </Button>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'แก้ไขรางวัล' : 'เพิ่มรางวัล'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <Label className="mb-1 block text-xs">ชื่อรางวัล *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น แลกรับฟรี เครื่องดื่ม Size L" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">รายละเอียด</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">ประเภท</Label>
                  <select className={selectCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                    <option value="FREE_ITEM">ของแถม (พนักงานแจก)</option>
                    <option value="DISCOUNT">ส่วนลด (บาท)</option>
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">แต้มที่ใช้ (0 = ฟรี)</Label>
                  <Input type="number" min="0" value={form.pointsCost} onChange={(e) => setForm({ ...form, pointsCost: e.target.value })} />
                </div>
              </div>
              {form.kind === 'DISCOUNT' && (
                <div>
                  <Label className="mb-1 block text-xs">ส่วนลด (บาท)</Label>
                  <Input type="number" min="0" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} />
                </div>
              )}
              <div>
                <Label className="mb-1 block text-xs">ระดับสมาชิกขั้นต่ำ</Label>
                <select className={selectCls} value={form.minTier} onChange={(e) => setForm({ ...form, minTier: e.target.value })}>
                  <option value="">ทุกคน</option>
                  {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} ขึ้นไป</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">เริ่มแลกได้</Label>
                  <Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">แลกได้ถึง</Label>
                  <Input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                เปิดใช้งาน
              </label>
              <Button className="w-full" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate(form)}>
                บันทึก
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ------------------------------------------------------- redemptions -------
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'รอใช้', USED: 'ใช้แล้ว', CANCELLED: 'ยกเลิก' };

function RedemptionsPanel() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [found, setFound] = useState<any>(null);

  const { data: active = [] } = useQuery<any[]>({
    queryKey: ['loyalty-redemptions'],
    queryFn: () => api.get('/loyalty/redemptions', { params: { status: 'ACTIVE' } }).then((r) => r.data),
  });

  const lookup = useMutation({
    mutationFn: () => api.get(`/loyalty/redemptions/code/${encodeURIComponent(code.trim())}`).then((r) => r.data),
    onSuccess: setFound,
    onError: (e) => { setFound(null); toast.error(errMsg(e, 'ไม่พบโค้ดนี้')); },
  });
  const use = useMutation({
    mutationFn: (id: string) => api.post(`/loyalty/redemptions/${id}/use`, {}).then((r) => r.data),
    onSuccess: (r) => {
      setFound(r);
      qc.invalidateQueries({ queryKey: ['loyalty-redemptions'] });
      toast.success('บันทึกการใช้สิทธิ์แล้ว');
    },
    onError: (e) => toast.error(errMsg(e, 'ใช้สิทธิ์ไม่สำเร็จ')),
  });

  const Row = ({ r, action }: { r: any; action?: boolean }) => (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold truncate">
          <span className="font-mono text-primary mr-2">{r.code}</span>{r.reward?.name}
        </div>
        <div className="text-[11.5px] text-muted-foreground truncate">
          {r.customer?.name} {r.customer?.phone && `· ${r.customer.phone}`} · {STATUS_LABEL[r.status] ?? r.status} · {formatDate(r.createdAt)}
        </div>
      </div>
      {action && r.status === 'ACTIVE' && (
        <Button size="sm" onClick={() => use.mutate(r.id)} disabled={use.isPending}>ใช้สิทธิ์</Button>
      )}
    </div>
  );

  return (
    <Section icon={<Ticket className="w-4 h-4" />} title="ตรวจโค้ดแลกรางวัล" hint="ลูกค้าแสดงโค้ดหลังกดแลก — กรอกโค้ดเพื่อตรวจและกดใช้สิทธิ์">
      <form
        className="flex gap-2 max-w-sm"
        onSubmit={(e) => { e.preventDefault(); code.trim() && lookup.mutate(); }}
      >
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="เช่น K7M2QX" className="h-9 font-mono tracking-widest" />
        <Button type="submit" size="sm" disabled={lookup.isPending}><Search className="w-4 h-4" /></Button>
      </form>
      {found && <Row r={found} action />}
      {active.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">รอใช้สิทธิ์ ({active.length})</div>
          {active.map((r) => <Row key={r.id} r={r} action />)}
        </div>
      )}
    </Section>
  );
}
