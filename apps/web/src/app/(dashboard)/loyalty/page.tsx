'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Stamp,
  Coins,
  Star,
  Ban,
  Search,
  Plus,
  Minus,
  History,
  QrCode,
  Copy,
  Download,
  Check,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Mode = 'OFF' | 'POINTS' | 'STAMPS' | 'BOTH';

// Illustrative example bill used to show the customer-facing preview live —
// matches the ฿327 canonical demo amount used elsewhere in the design system.
const PREVIEW_BILL = 327;
const PREVIEW_EXISTING_POINTS = 240;

export default function LoyaltyPage() {
  const t = useT();
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
  const stampsPerReward = Number(store?.stampsPerReward ?? 10);
  const stampRewardName = store?.stampRewardName || t('loyalty.rewardFallback');

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin space-y-6">
      <div className="flex items-center gap-2">
        <Stamp className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-extrabold tracking-tight">{t('loyalty.title')}</h2>
      </div>

      <LoyaltySettings store={store} t={t} />

      {/* Members */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-sm font-extrabold">
            {t('loyalty.members')} {customers.length} {t('loyalty.peopleUnit')}
          </h3>
          <div className="relative w-full max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('loyalty.searchPlaceholder')}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer h-14 rounded-xl" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">{t('loyalty.noMembers')}</div>
        ) : (
          <div className="space-y-2">
            {customers.map((c: any) => {
              const stamps = c.stamps ?? 0;
              const remainder = stampsPerReward > 0 ? stamps % stampsPerReward : 0;
              const justEarnedReward = stampsPerReward > 0 && stamps > 0 && remainder === 0;
              const remainingStamps = stampsPerReward - remainder;

              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card-hover border border-border hover:border-primary/40 text-left transition-colors"
                >
                  <div className="w-[38px] h-[38px] rounded-full bg-primary/15 text-primary font-extrabold text-sm flex items-center justify-center shrink-0">
                    {c.name?.[0] || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold truncate">{c.name}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">
                      {c.phone || '—'}
                      {c.visitCount != null &&
                        ` · ${t('loyalty.visitedPrefix')} ${c.visitCount} ${t(c.visitCount === 1 ? 'customers.visit' : 'customers.visits')}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {showPoints && (
                      <div className="text-[15px] font-extrabold tabular-nums text-accent">
                        {c.points ?? 0} {t('loyalty.pointsUnit')}
                      </div>
                    )}
                    {showStamps && (
                      <div className={`text-[11px] font-medium ${justEarnedReward ? 'text-success' : 'text-muted-foreground'}`}>
                        {stamps === 0
                          ? `0 ${t('loyalty.stampsUnit')}`
                          : justEarnedReward
                            ? t('loyalty.rewardEarned')
                            : t('loyalty.remainingStamps').replace('%s', String(remainingStamps)).replace('%s', stampRewardName)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <MemberDetailDialog customer={selected} store={store} onClose={() => setSelected(null)} t={t} />
    </div>
  );
}

function InlinePill({ value, onChange, suffix }: { value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-muted border border-border rounded-lg px-1 focus-within:border-primary">
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 bg-transparent text-center font-extrabold text-[13.5px] py-1 outline-none tabular-nums"
      />
      {suffix && <span className="font-extrabold text-[13.5px] pr-1.5">{suffix}</span>}
    </span>
  );
}

/** Non-editable version of InlinePill — for values the data model fixes (e.g. always 1 point per threshold). */
function StaticPill({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-muted border border-border rounded-lg px-2.5 py-1 font-extrabold text-[13.5px]">
      {value}
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

function LoyaltySettings({ store, t }: { store: any; t: (k: string, f?: string) => string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [memberUrl, setMemberUrl] = useState('');

  useEffect(() => {
    if (store?.id) {
      const url = `${window.location.origin}/member?storeId=${store.id}`;
      setMemberUrl(url);
      import('qrcode').then((QRCode) => {
        QRCode.default
          .toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'H' })
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
        stampsEarnBaht: String(store.stampsEarnBaht ?? 0),
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
      toast.success(t('loyalty.saved'));
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('loyalty.saveFailed')),
  });

  if (!form) return <div className="shimmer h-96 rounded-2xl" />;

  const modes: { v: Mode; icon: React.ReactNode; label: string; desc: string }[] = [
    { v: 'POINTS', icon: <Coins className="w-[22px] h-[22px]" />, label: t('loyalty.mode.points.label'), desc: t('loyalty.mode.points.desc') },
    { v: 'STAMPS', icon: <Stamp className="w-[22px] h-[22px]" />, label: t('loyalty.mode.stamps.label'), desc: t('loyalty.mode.stamps.desc') },
    { v: 'BOTH', icon: <Star className="w-[22px] h-[22px]" />, label: t('loyalty.mode.both.label'), desc: t('loyalty.mode.both.desc') },
    { v: 'OFF', icon: <Ban className="w-[22px] h-[22px]" />, label: t('loyalty.mode.off.label'), desc: t('loyalty.mode.off.desc') },
  ];
  const showPoints = form.loyaltyMode === 'POINTS' || form.loyaltyMode === 'BOTH';
  const showStamps = form.loyaltyMode === 'STAMPS' || form.loyaltyMode === 'BOTH';

  const submit = () => {
    save.mutate({
      loyaltyMode: form.loyaltyMode,
      pointsEarnBaht: parseInt(form.pointsEarnBaht) || 0,
      pointValue: parseFloat(form.pointValue) || 0,
      minRedeemPoints: parseInt(form.minRedeemPoints) || 0,
      stampsEarnBaht: parseInt(form.stampsEarnBaht) || 0,
      stampsPerReward: parseInt(form.stampsPerReward) || 1,
      stampRewardValue: parseFloat(form.stampRewardValue) || 0,
      stampRewardName: form.stampRewardName || null,
    });
  };

  // Live preview math — mirrors what a real customer would see with the
  // rule values currently in the form (not yet saved).
  const pointsEarnBaht = parseInt(form.pointsEarnBaht) || 0;
  const pointValue = parseFloat(form.pointValue) || 0;
  const earnedPoints = pointsEarnBaht > 0 ? Math.floor(PREVIEW_BILL / pointsEarnBaht) : 0;
  const totalPoints = PREVIEW_EXISTING_POINTS + earnedPoints;
  const worthDiscount = totalPoints * pointValue;
  const stampsEarnBaht = parseInt(form.stampsEarnBaht) || 0;
  const earnedStamps = stampsEarnBaht > 0 ? Math.floor(PREVIEW_BILL / stampsEarnBaht) : 1;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
      <div>
        <div className="text-base font-extrabold mb-0.5">{t('loyalty.settingsHeading')}</div>
        <div className="text-[13px] text-muted-foreground">{t('loyalty.settingsSubtitle')}</div>
      </div>

      {/* Mode picker — plain cards with icon + checkmark badge when selected */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {modes.map((m) => {
          const active = form.loyaltyMode === m.v;
          return (
            <button
              key={m.v}
              onClick={() => setForm({ ...form, loyaltyMode: m.v })}
              className={`relative text-left rounded-[13px] p-3.5 border-2 transition-colors ${
                active ? 'border-primary bg-primary/[0.06]' : 'border-border bg-card hover:border-muted-foreground/40'
              }`}
            >
              {active && (
                <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </span>
              )}
              <div className="text-primary mb-2.5">{m.icon}</div>
              <div className="text-[13.5px] font-extrabold mb-0.5">{m.label}</div>
              <div className="text-[11.5px] text-muted-foreground leading-snug">{m.desc}</div>
            </button>
          );
        })}
      </div>

      {form.loyaltyMode !== 'OFF' && (
        <div className="grid lg:grid-cols-2 gap-3.5">
          {/* Rule sentence builder */}
          <div className="bg-card-hover border border-border rounded-[13px] p-4 space-y-2.5">
            <div className="text-[13px] font-extrabold mb-1">
              {showPoints ? t('loyalty.ruleHeading') : t('loyalty.stampRuleHeading')}
            </div>

            {showPoints && (
              <>
                <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                  <span>{t('loyalty.everyBaht')}</span>
                  <InlinePill value={form.pointsEarnBaht} onChange={(v) => setForm({ ...form, pointsEarnBaht: v })} suffix="฿" />
                  <span>{t('loyalty.thatSpent')}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                  <span>{t('loyalty.customerGets')}</span>
                  <StaticPill value="1" suffix={t('loyalty.pointsUnit')} />
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                  <span>{t('loyalty.pointWorth')}</span>
                  <InlinePill value={form.pointValue} onChange={(v) => setForm({ ...form, pointValue: v })} suffix="฿" />
                </div>
              </>
            )}

            {showStamps && (
              <>
                {showPoints && <div className="h-px bg-border my-1" />}
                <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                  <span>{t('loyalty.everyBaht')}</span>
                  <InlinePill value={form.stampsEarnBaht} onChange={(v) => setForm({ ...form, stampsEarnBaht: v })} suffix="฿" />
                  <span>{t('loyalty.thatSpent')}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                  <span>{t('loyalty.customerGets')}</span>
                  <StaticPill value="1" suffix={t('loyalty.stampsUnit')} />
                </div>
                <p className="text-[11px] text-muted-foreground">{t('loyalty.stampsEarnBahtHint')}</p>
                <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                  <span>{t('loyalty.collectStamps')}</span>
                  <InlinePill value={form.stampsPerReward} onChange={(v) => setForm({ ...form, stampsPerReward: v })} suffix={t('loyalty.stampsUnit')} />
                  <span>{t('loyalty.getsReward')}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                  <Input
                    value={form.stampRewardName}
                    onChange={(e) => setForm({ ...form, stampRewardName: e.target.value })}
                    placeholder={t('loyalty.rewardNamePlaceholder')}
                    className="h-8 flex-1 min-w-[140px] text-[13px]"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                  <span>{t('loyalty.rewardWorth')}</span>
                  <InlinePill value={form.stampRewardValue} onChange={(v) => setForm({ ...form, stampRewardValue: v })} suffix="฿" />
                </div>
              </>
            )}
          </div>

          {/* Live customer-facing preview */}
          <div
            className="rounded-[13px] p-4 text-white border"
            style={{
              background: 'linear-gradient(150deg, #241109, #3a1a0e)',
              borderColor: 'rgba(255,107,53,.3)',
            }}
          >
            <div className="text-[11.5px] font-bold uppercase tracking-wide mb-2.5" style={{ color: '#FFB088' }}>
              <Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              {t('loyalty.previewHeading')}
            </div>
            <div className="bg-white/[0.08] rounded-[11px] p-3.5">
              {showPoints ? (
                <>
                  <div className="text-[13px] opacity-85">
                    {t('loyalty.previewBill')} {formatCurrency(PREVIEW_BILL)}
                  </div>
                  <div className="flex items-center gap-2 my-2">
                    <span className="text-[26px] font-extrabold" style={{ color: '#FFB088' }}>
                      +{earnedPoints}
                    </span>
                    <span className="text-sm font-bold">{t('loyalty.pointsUnit')}</span>
                  </div>
                  <div className="h-px bg-white/[0.14] my-2.5" />
                  <div className="text-[12.5px] opacity-85 leading-relaxed">
                    {t('loyalty.previewHasPoints')} <b className="text-white">{totalPoints} {t('loyalty.pointsUnit')}</b>
                    <br />
                    {t('loyalty.previewWorthDiscount')} <b style={{ color: '#FFB088' }}>{formatCurrency(worthDiscount)}</b>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[13px] opacity-85">
                    {t('loyalty.previewBill')} {formatCurrency(PREVIEW_BILL)}
                  </div>
                  <div className="flex items-center gap-2 my-2">
                    <span className="text-[26px] font-extrabold" style={{ color: '#FFB088' }}>
                      +{earnedStamps}
                    </span>
                    <span className="text-sm font-bold">{t('loyalty.stampsUnit')}</span>
                  </div>
                  <div className="h-px bg-white/[0.14] my-2.5" />
                  <div className="text-[12.5px] opacity-85 leading-relaxed">
                    {t('loyalty.collectStamps')} <b className="text-white">{form.stampsPerReward} {t('loyalty.stampsUnit')}</b>{' '}
                    {t('loyalty.getsReward')}{' '}
                    <b style={{ color: '#FFB088' }}>{form.stampRewardName || t('loyalty.rewardNamePlaceholder')}</b>
                  </div>
                </>
              )}
            </div>
            <div className="text-[11px] opacity-70 mt-2.5 leading-relaxed">{t('loyalty.previewLive')}</div>
          </div>
        </div>
      )}

      {form.loyaltyMode !== 'OFF' && showPoints && (
        <div className="max-w-xs">
          <Label className="mb-1 block text-xs">{t('loyalty.minRedeemLabel')}</Label>
          <Input
            type="number"
            min="0"
            value={form.minRedeemPoints}
            onChange={(e) => setForm({ ...form, minRedeemPoints: e.target.value })}
            className="h-9"
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={save.isPending}>
          {t('loyalty.saveSettings')}
        </Button>
      </div>

      {/* QR Code and Member Link section */}
      {store?.id && (
        <div className="pt-5 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <QrCode className="w-4 h-4 text-primary" />
            <h4 className="text-[13px] font-extrabold">{t('loyalty.qrHeading')}</h4>
          </div>
          <div className="flex flex-col md:flex-row gap-4 bg-muted/40 p-3.5 rounded-xl border border-border">
            {qrDataUrl && (
              <div className="flex-shrink-0 flex flex-col items-center gap-2 bg-white p-2 rounded-lg border border-border max-w-[140px] mx-auto md:mx-0">
                <img src={qrDataUrl} alt="Registration QR Code" className="w-28 h-28" />
                <a
                  href={qrDataUrl}
                  download={`${store.name}_member_qr.png`}
                  className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold"
                >
                  <Download className="w-3 h-3" /> {t('loyalty.downloadQr')}
                </a>
              </div>
            )}
            <div className="flex-1 flex flex-col justify-between space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">{t('loyalty.qrDesc')}</p>
              <div className="text-[11px] font-mono bg-foreground text-background p-2 rounded-lg break-all select-all flex items-center justify-between gap-2">
                <span className="truncate opacity-90">{memberUrl}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(memberUrl);
                    toast.success(t('loyalty.linkCopied'));
                  }}
                  className="p-1 rounded bg-background/10 hover:bg-background/20 transition-colors shrink-0"
                  title={t('loyalty.copyLink')}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberDetailDialog({
  customer,
  store,
  onClose,
  t,
}: {
  customer: any;
  store: any;
  onClose: () => void;
  t: (k: string, f?: string) => string;
}) {
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
      toast.success(t('loyalty.adjustSuccess'));
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('loyalty.adjustFailed')),
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
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5" /> {t('loyalty.pointsUnit')}
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-accent">{points}</div>
                  <AdjustRow
                    onAdd={() => adjust.mutate({ kind: 'points', delta: 1 })}
                    onSub={() => adjust.mutate({ kind: 'points', delta: -1 })}
                    disabled={adjust.isPending}
                  />
                </div>
              )}
              {showStamps && (
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Stamp className="w-3.5 h-3.5" /> {t('loyalty.stampsUnit')}
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-primary">{stamps}</div>
                  {cardsReady > 0 && (
                    <div className="text-[10px] text-success font-medium">
                      {t('loyalty.rewardEarned')} ×{cardsReady}
                    </div>
                  )}
                  <AdjustRow
                    onAdd={() => adjust.mutate({ kind: 'stamps', delta: 1 })}
                    onSub={() => adjust.mutate({ kind: 'stamps', delta: -1 })}
                    disabled={adjust.isPending}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <History className="w-3.5 h-3.5" /> {t('loyalty.history')}
              </div>
              {isLoading ? (
                <div className="shimmer h-24 rounded-lg" />
              ) : !data?.transactions?.length ? (
                <div className="text-xs text-muted-foreground py-4 text-center">{t('loyalty.noHistory')}</div>
              ) : (
                <div className="max-h-64 overflow-y-auto scrollbar-thin divide-y divide-border border border-border rounded-lg">
                  {data.transactions.map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium">{t(`loyalty.tx.${tx.type}`, tx.type)}</div>
                        <div className="text-muted-foreground truncate">{tx.note || formatDate(tx.createdAt)}</div>
                      </div>
                      <div className="text-right tabular-nums shrink-0 ml-2">
                        <div className={`font-semibold ${tx.points >= 0 ? 'text-success' : 'text-danger'}`}>
                          {tx.points >= 0 ? '+' : ''}
                          {tx.points}
                        </div>
                        <div className="text-muted-foreground">
                          {t('loyalty.balance')} {tx.balanceAfter}
                        </div>
                      </div>
                    </div>
                  ))}
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
      <button
        onClick={onSub}
        disabled={disabled}
        className="flex-1 h-7 rounded border border-border hover:bg-card-hover flex items-center justify-center disabled:opacity-50"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onAdd}
        disabled={disabled}
        className="flex-1 h-7 rounded border border-border hover:bg-card-hover flex items-center justify-center disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
