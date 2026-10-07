'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Stamp,
  Search,
  Loader2,
  Sparkles,
  LogOut,
  UserPlus,
  Gift,
  Phone,
  Mail,
  User,
  AlertCircle,
  PartyPopper,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type RewardFilter = 'ALL' | 'FREE' | 'POINTS' | 'SPECIAL';
const FILTERS: { key: RewardFilter; label: string }[] = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'FREE', label: 'รับฟรี' },
  { key: 'POINTS', label: 'แลกคะแนน' },
  { key: 'SPECIAL', label: 'พิเศษเฉพาะคุณ' },
];
const BADGE: Record<string, { label: string; cls: string }> = {
  POINTS: { label: 'แลกคะแนน', cls: 'bg-[#F6E6DC] text-[#A64B1F]' },
  FREE: { label: 'รับฟรี', cls: 'bg-[#FEE2E2] text-[#B91C1C]' },
  SPECIAL: { label: 'พิเศษ', cls: 'bg-[#F2E9E0] text-[#7A6A5C]' },
};

const thDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

function validityText(r: { validFrom?: string | null; validTo?: string | null }) {
  if (r.validFrom && r.validTo) return `แลกได้ ${thDate(r.validFrom)} - ${thDate(r.validTo)}`;
  if (r.validTo) return `แลกได้ถึง ${thDate(r.validTo)}`;
  if (r.validFrom) return `แลกได้ตั้งแต่ ${thDate(r.validFrom)}`;
  return 'แลกได้ไม่จำกัดเวลา';
}

function MemberPortalContent() {
  const searchParams = useSearchParams();
  const storeId = searchParams.get('storeId') || searchParams.get('s');
  // Present when this page was opened via the "scan to collect points" QR
  // printed on a receipt (Receipt.tsx) or on the order slip handed over at the
  // table (OrderSlip.tsx) — the order has no member linked yet, so once we know
  // who's asking we claim it for them.
  const orderId = searchParams.get('order');

  const [phone, setPhone] = useState('');
  const [member, setMember] = useState<any>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');

  const [claimResult, setClaimResult] = useState<{ earnedPoints: number; earnedStamps: number } | null>(null);
  const [claimNotice, setClaimNotice] = useState('');
  const [claimRetryable, setClaimRetryable] = useState(false);
  const claimedRef = useRef(false);

  const qc = useQueryClient();
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('ALL');
  const [redeemResult, setRedeemResult] = useState<{ code: string; name: string } | null>(null);
  const [redeemError, setRedeemError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const { data: store, isLoading: storeLoading, isError: storeError } = useQuery({
    queryKey: ['public-store', storeId],
    queryFn: () => api.get(`/self-order/store/${storeId}`).then((r) => r.data),
    enabled: !!storeId,
    retry: false,
  });

  // Member QR (the phone number) for staff to scan at the counter.
  const memberPhone: string | undefined = member?.phone;
  useEffect(() => {
    if (!memberPhone) { setQrDataUrl(''); return; }
    let live = true;
    import('qrcode').then((QRCode) =>
      QRCode.default
        .toDataURL(memberPhone, { width: 160, margin: 1, color: { dark: '#2B1F17', light: '#FFFFFF' } })
        .then((u) => live && setQrDataUrl(u))
        .catch(() => live && setQrDataUrl(''))
    );
    return () => { live = false; };
  }, [memberPhone]);

  const { data: rewards = [] } = useQuery<any[]>({
    queryKey: ['member-rewards', storeId, memberPhone],
    queryFn: () =>
      api.get(`/self-order/store/${storeId}/rewards`, { params: { phone: memberPhone } }).then((r) => r.data),
    enabled: !!storeId && !!memberPhone,
    retry: false,
  });

  const refreshMember = useCallback(async () => {
    if (!storeId || !memberPhone) return;
    try {
      const { data } = await api.get(`/self-order/store/${storeId}/customer/lookup`, { params: { phone: memberPhone } });
      if (data?.id) setMember(data);
    } catch { /* keep the card we already have */ }
    qc.invalidateQueries({ queryKey: ['member-rewards', storeId, memberPhone] });
  }, [storeId, memberPhone, qc]);

  const redeem = useMutation({
    mutationFn: (rewardId: string) =>
      api.post(`/self-order/store/${storeId}/rewards/${rewardId}/redeem`, { phone: memberPhone }).then((r) => r.data),
    onSuccess: (data) => {
      setRedeemError('');
      setCodeCopied(false);
      setRedeemResult({ code: data.redemption.code, name: data.reward.name });
      refreshMember();
    },
    onError: (err: any) => {
      setRedeemError(err.response?.data?.error || 'แลกรางวัลไม่สำเร็จ กรุณาลองใหม่');
      refreshMember();
    },
  });

  useEffect(() => {
    setMember(null);
    setPhone('');
    setLookupError('');
    setShowRegisterForm(false);
    setRegisterName('');
    setRegisterEmail('');
    claimedRef.current = false;
    setClaimResult(null);
    setClaimNotice('');
    setClaimRetryable(false);
  }, [storeId]);

  // Remembers, on this device, that this order was collected here — so a
  // reload of the same link reads as "you already collected this" instead of
  // the flat "someone already claimed it" a stranger's scan should get.
  const claimedHereKey = orderId ? `pos-claimed-order:${orderId}` : '';
  const claimedHere = () => !!claimedHereKey && !!localStorage.getItem(claimedHereKey);

  // Once we know who the member is (via lookup or fresh registration) and
  // this visit came from a printed QR, claim that order's points — exactly
  // what checkout would have earned had a cashier linked the member.
  const claimPoints = useCallback(() => {
    if (!member || !orderId) return;
    claimedRef.current = true;
    setClaimNotice('');
    setClaimRetryable(false);
    api
      .post(`/self-order/order/${orderId}/claim-points`, { phone: member.phone })
      .then(({ data }) => {
        setMember((m: any) => ({ ...m, points: data.customer.points, stamps: data.customer.stamps }));
        refreshMember(); // tier / expiry / rewards may have changed
        if (data.earnedPoints > 0 || data.earnedStamps > 0) {
          setClaimResult({ earnedPoints: data.earnedPoints, earnedStamps: data.earnedStamps });
        }
        try {
          localStorage.setItem(claimedHereKey, member.phone);
        } catch {
          /* private mode — we just lose the "collected here" hint */
        }
      })
      .catch((err) => {
        const code = err.response?.data?.code;
        if (code === 'ALREADY_CLAIMED') {
          // One bill, one collect — say so, rather than leaving the guest
          // staring at a portal that looks like nothing happened.
          setClaimNotice(
            claimedHere()
              ? 'คุณเก็บแต้มจากบิลนี้ไปแล้ว — 1 บิลเก็บได้ครั้งเดียว'
              : 'บิลนี้ถูกเก็บแต้มไปแล้ว — 1 บิลเก็บได้ครั้งเดียว'
          );
          return;
        }
        // Scanned from the order slip before paying: the earn is still waiting,
        // so keep the door open instead of dead-ending them.
        const unpaid = err.response?.status === 400 && /ยังไม่ได้ชำระเงิน/.test(err.response?.data?.error || '');
        setClaimNotice(
          unpaid
            ? 'บิลนี้ยังไม่ได้ชำระเงิน — ชำระเงินแล้วกด "เก็บแต้มอีกครั้ง" หรือสแกน QR บนใบเสร็จ'
            : err.response?.data?.error || 'สะสมแต้มจากบิลนี้ไม่สำเร็จ'
        );
        setClaimRetryable(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, orderId, claimedHereKey, refreshMember]);

  useEffect(() => {
    if (!member || !orderId || claimedRef.current) return;
    claimPoints();
  }, [member, orderId, claimPoints]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    setLookupLoading(true);
    setLookupError('');
    try {
      const { data } = await api.get(`/self-order/store/${storeId}/customer/lookup?phone=${phone}`);
      if (data && data.id) {
        setMember(data);
        setShowRegisterForm(false);
      } else {
        setLookupError('ไม่พบเบอร์โทรศัพท์นี้ในระบบสมาชิก');
        setShowRegisterForm(true);
      }
    } catch (err: any) {
      setLookupError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูล');
    } finally {
      setLookupLoading(false);
    }
  };

  const register = useMutation({
    mutationFn: (payload: any) =>
      api.post(`/self-order/store/${storeId}/customer/register`, payload).then((r) => r.data),
    onSuccess: (data) => {
      setMember(data);
      setShowRegisterForm(false);
    },
    onError: (err: any) => {
      setLookupError(err.response?.data?.error || 'การลงทะเบียนล้มเหลว กรุณาลองใหม่อีกครั้ง');
    },
  });

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerName || !phone) return;
    register.mutate({
      name: registerName,
      phone,
      email: registerEmail || undefined,
    });
  };

  const resetPortal = () => {
    setMember(null);
    setPhone('');
    setLookupError('');
    setShowRegisterForm(false);
    setRegisterName('');
    setRegisterEmail('');
    claimedRef.current = false;
    setClaimResult(null);
    setClaimNotice('');
    setClaimRetryable(false);
  };

  if (!storeId) {
    return (
      <PortalShell>
        <Card className="w-full max-w-md text-center">
          <CardHeader className="space-y-2">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-warning" />
            </div>
            <CardTitle className="text-xl font-bold mt-2">ไม่พบลิงก์ของร้านค้า</CardTitle>
            <CardDescription>
              กรุณาสแกน QR Code สมาชิกที่ตั้งอยู่หน้าร้านค้า หรือใช้ลิงก์ที่ถูกต้องเพื่อเข้าสู่ระบบสมาชิก
            </CardDescription>
          </CardHeader>
        </Card>
      </PortalShell>
    );
  }

  if (storeLoading) {
    return (
      <PortalShell>
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลร้านค้า...</p>
        </div>
      </PortalShell>
    );
  }

  if (storeError || !store) {
    return (
      <PortalShell>
        <Card className="w-full max-w-md text-center">
          <CardHeader className="space-y-2">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-danger" />
            </div>
            <CardTitle className="text-xl font-bold">โหลดข้อมูลไม่สำเร็จ</CardTitle>
            <CardDescription>ไม่พบข้อมูลร้านค้านี้ในระบบ หรือร้านค้าปิดการใช้งานแล้ว</CardDescription>
          </CardHeader>
        </Card>
      </PortalShell>
    );
  }

  const loyaltyMode = store.loyaltyMode ?? 'BOTH';
  const showPoints = loyaltyMode === 'POINTS' || loyaltyMode === 'BOTH';
  const showStamps = loyaltyMode === 'STAMPS' || loyaltyMode === 'BOTH';
  const stampsPerReward = store.stampsPerReward || 10;
  const stamps = member?.stamps ?? 0;
  const cardsReady = stampsPerReward > 0 ? Math.floor(stamps / stampsPerReward) : 0;
  const currentStampsProgress = stampsPerReward > 0 ? stamps % stampsPerReward : 0;

  return (
    <div
      className="customer-theme min-h-screen bg-background flex flex-col items-center p-4 py-8 relative overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(circle at 12px 12px, #F2E4D6 2px, transparent 2px)',
        backgroundSize: '26px 26px',
      }}
    >

      <div className="w-full max-w-md space-y-4 relative">
        {/* Header — brand mark + greeting, matches the store's own bottom-nav style */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            {store.logo ? (
              <img
                src={store.logo.startsWith('http') ? store.logo : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${store.logo}`}
                alt={store.name}
                className="w-12 h-12 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/30">
                <span className="text-lg font-bold">{store.name.substring(0, 1)}</span>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">สวัสดี</p>
              <p className="text-base font-bold truncate max-w-[160px]">{member ? member.name : 'ลูกค้า'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#8C6A4F] max-w-[140px] truncate">{store.name}</p>
          </div>
        </div>

        {/* Claim result banner — only when this visit came from a receipt QR */}
        {claimResult && (
          <div className="relative overflow-hidden rounded-2xl border border-success/30 bg-card p-4 flex items-center gap-3 animate-slide-up">
            <div className="w-11 h-11 rounded-full bg-success/20 flex items-center justify-center shrink-0">
              <PartyPopper className="w-6 h-6 text-success" />
            </div>
            <div className="text-sm">
              <div className="font-bold text-success">สะสมแต้มจากบิลนี้สำเร็จ!</div>
              <div className="text-muted-foreground">
                {claimResult.earnedPoints > 0 && `+${claimResult.earnedPoints} แต้ม `}
                {claimResult.earnedStamps > 0 && `+${claimResult.earnedStamps} ดวง`}
              </div>
            </div>
          </div>
        )}
        {claimNotice && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning animate-fade-in space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {claimNotice}
            </div>
            {claimRetryable && (
              <Button size="sm" variant="outline" className="w-full h-8" onClick={claimPoints}>
                เก็บแต้มอีกครั้ง
              </Button>
            )}
          </div>
        )}

        {/* State 1: Enter Phone Number */}
        {!member && !showRegisterForm && (
          <Card className="overflow-hidden rounded-2xl animate-slide-up">
            <div className="bg-[#8C6A4F] px-5 py-4 flex items-center justify-between text-[#FBF6F0]">
              <div>
                <p className="text-sm font-semibold">สแกนแล้วสะสมแต้มได้เลย</p>
                <p className="text-xs opacity-80 mt-0.5">ระบบสมาชิก {store.name}</p>
              </div>
              <Sparkles className="w-5 h-5 opacity-80" />
            </div>
            <CardHeader className="pt-5">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" /> ค้นหาข้อมูลสมาชิก
              </CardTitle>
              <CardDescription>
                กรอกเบอร์โทรศัพท์มือถือของคุณเพื่อดูคะแนนสะสมและบัตรสมาชิก
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLookup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">เบอร์โทรศัพท์ของคุณ</Label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="เช่น 0812345678"
                      className="pl-10"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {lookupError && (
                  <p className="text-xs text-danger flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {lookupError}
                  </p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={lookupLoading || !phone}>
                  {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ตรวจสอบข้อมูล / ค้นหา'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* State 2: Member dashboard */}
        {member && (
          <div className="space-y-4 animate-slide-up">
            {/* Member card — tier bar, big point number + staff-scan QR, expiry notice */}
            <div className="rounded-2xl overflow-hidden border border-border bg-card">
              <div className="bg-[#8C6A4F] px-4 py-3 text-[#FBF6F0]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">ระดับสมาชิกของคุณ</span>
                  {member.tier ? (
                    <span className="px-3.5 py-1 rounded-full bg-[#FBF6F0] text-foreground text-xs font-bold tracking-wide uppercase">
                      {member.tier.name}
                    </span>
                  ) : (
                    <span className="px-3.5 py-1 rounded-full bg-[#FBF6F0] text-foreground text-xs font-bold tabular-nums font-mono">
                      {member.phone}
                    </span>
                  )}
                </div>
                {member.tierProgress && member.nextTier && (
                  <div className="mt-2.5">
                    <div className="h-1.5 rounded-full bg-[#FBF6F0]/25 overflow-hidden">
                      <div className="h-full rounded-full bg-[#FBF6F0]" style={{ width: `${member.tierProgress.pct}%` }} />
                    </div>
                    <div className="text-[11px] opacity-85 mt-1.5">
                      ใช้จ่ายอีก {formatCurrency(member.tierProgress.remaining)} เพื่อเลื่อนเป็น {member.nextTier.name}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-stretch">
                <div className={`flex-1 grid ${showPoints && showStamps ? 'grid-cols-2 divide-x divide-border' : 'grid-cols-1'}`}>
                  {showPoints && (
                    <div className="px-4 py-4">
                      <div className="text-[40px] font-bold tabular-nums leading-none">{(member.points ?? 0).toLocaleString()}</div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          P
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground tracking-wide">แต้มสะสม</span>
                      </div>
                    </div>
                  )}
                  {showStamps && (
                    <div className="px-4 py-4">
                      <div className="text-[40px] font-bold tabular-nums leading-none">{member.stamps ?? 0}</div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Stamp className="w-5 h-5 text-primary" />
                        <span className="text-xs font-semibold text-muted-foreground tracking-wide">ดวงสะสม</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="w-[78px] shrink-0 bg-primary rounded-bl-[40px] flex flex-col items-center justify-center gap-1 text-primary-foreground">
                  {qrDataUrl ? <img src={qrDataUrl} alt="QR สมาชิก" className="w-[46px] h-[46px] rounded bg-white" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                  <span className="text-[10.5px] font-semibold">ให้พนักงานสแกน</span>
                </div>
              </div>
              {showPoints && (member.expiringPoints ?? 0) > 0 && member.expiringDate && (
                <div className="border-t border-[#F3DFA2] bg-[#FEFCE8] px-4 py-2.5 text-center text-[11px] font-medium text-[#B45309]">
                  {member.expiringPoints.toLocaleString()} แต้ม กำลังจะหมดอายุ ภายใน {thDate(member.expiringDate)}
                </div>
              )}
              {showPoints && Number(store.pointValue) > 0 && (member.points ?? 0) > 0 && (
                <div className="border-t border-border bg-muted px-4 py-2.5 text-center text-[11px] font-medium text-muted-foreground">
                  แลกได้สูงสุด {formatCurrency((member.points ?? 0) * Number(store.pointValue))}
                  {Number(store.minRedeemPoints) > 0 && ` · ขั้นต่ำ ${store.minRedeemPoints} แต้ม`}
                </div>
              )}
            </div>

            {/* Stamp card progress */}
            {showStamps && (
              <Card className="rounded-2xl">
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Gift className="w-4 h-4 text-primary" /> บัตรสะสมดวงของคุณ
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      ครบ {stampsPerReward} ดวง รับรางวัลฟรี!
                    </CardDescription>
                  </div>
                  <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full shrink-0">
                    {currentStampsProgress} / {stampsPerReward}
                  </span>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-5 gap-2.5">
                    {Array.from({ length: stampsPerReward }).map((_, idx) => {
                      const isStamped = idx < currentStampsProgress;
                      return (
                        <div
                          key={idx}
                          className={`aspect-square rounded-full flex items-center justify-center text-xs font-bold border transition-all duration-300 ${
                            isStamped
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'bg-card border-border text-muted-foreground border-dashed'
                          }`}
                        >
                          {isStamped ? <span className="w-3 h-3 rounded-full bg-white" /> : <span className="text-[10px] font-mono">{idx + 1}</span>}
                        </div>
                      );
                    })}
                  </div>

                  {cardsReady > 0 && (
                    <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/30 rounded-xl p-3">
                      <Gift className="w-5 h-5 text-primary shrink-0" />
                      <div className="text-xs leading-relaxed">
                        <span className="font-semibold">ยินดีด้วยครับ!</span> คุณมีของรางวัลรอแลกอยู่{' '}
                        <strong className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px]">{cardsReady} รางวัล</strong>{' '}
                        แจ้งพนักงานเมื่อคิดเงินเพื่อกดแลกใช้สิทธิ์
                      </div>
                    </div>
                  )}

                  {store.stampRewardName && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span>
                        ของรางวัล: <strong className="text-foreground">{store.stampRewardName}</strong>
                      </span>
                      {Number(store.stampRewardValue) > 0 && (
                        <span className="text-primary">(มูลค่าส่วนลด {formatCurrency(store.stampRewardValue)})</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Coupons / special privileges */}
            {rewards.length > 0 && (
              <div className="pt-2">
                <h3 className="text-lg font-bold mb-3">สิทธิพิเศษเฉพาะคุณ</h3>
                <div className="flex gap-2 flex-wrap mb-3">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setRewardFilter(f.key)}
                      className={`px-4 py-2 rounded-full text-[12.5px] transition-colors ${
                        rewardFilter === f.key
                          ? 'bg-[#8C6A4F] text-white font-semibold'
                          : 'bg-card border border-border text-foreground font-medium'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {redeemError && (
                  <p className="text-xs text-danger flex items-center gap-1 mb-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {redeemError}
                  </p>
                )}
                <div className="flex flex-col gap-2.5">
                  {rewards
                    .filter((r: any) =>
                      rewardFilter === 'ALL' ? true
                      : rewardFilter === 'FREE' ? r.pointsCost === 0
                      : rewardFilter === 'POINTS' ? r.pointsCost > 0
                      : !!r.minTier
                    )
                    .map((r: any) => {
                      const badge = BADGE[r.category] ?? BADGE.POINTS;
                      return (
                        <div key={r.id} className="flex bg-card border border-border rounded-[14px] overflow-hidden">
                          <div className="w-[116px] shrink-0 bg-[#F6E6DC] border-r border-border flex flex-col items-center justify-center gap-1.5 p-2.5">
                            <span className={`px-2.5 py-[3px] rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                            {r.imageUrl ? (
                              <img
                                src={r.imageUrl.startsWith('http') ? r.imageUrl : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${r.imageUrl}`}
                                alt={r.name}
                                className="w-[52px] h-[52px] rounded-[10px] object-cover"
                              />
                            ) : (
                              <div className="w-[52px] h-[52px] rounded-[10px] border border-dashed border-[#D8C7B8] flex items-center justify-center text-[#8C6A4F]">
                                <Gift className="w-6 h-6" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 p-3 flex flex-col gap-1">
                            <div className="text-sm font-semibold leading-snug">{r.name}</div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-[15px] h-[15px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">P</span>
                              <span className="text-[11.5px] font-semibold text-muted-foreground">
                                {r.pointsCost > 0 ? `${r.pointsCost.toLocaleString()} แต้ม` : 'ฟรี'}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {r.pointsCost > 0 && !r.canRedeem
                                ? `แต้มไม่พอ · ขาดอีก ${r.shortfall.toLocaleString()} แต้ม`
                                : validityText(r)}
                            </div>
                            <button
                              disabled={!r.canRedeem || redeem.isPending}
                              onClick={() => { setRedeemError(''); redeem.mutate(r.id); }}
                              className={`h-9 rounded-[9px] mt-1 text-[12.5px] font-semibold flex items-center justify-center ${
                                r.canRedeem ? 'bg-primary text-primary-foreground' : 'bg-[#F2E9E0] text-[#7A6A5C]'
                              }`}
                            >
                              {redeem.isPending && redeem.variables === r.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : r.canRedeem ? 'แลกรับสิทธิ์' : 'แต้มยังไม่พอ'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <Button onClick={resetPortal} variant="outline" className="w-full text-xs bg-card text-muted-foreground">
              <LogOut className="w-3.5 h-3.5 mr-1" /> ออกจากหน้านี้
            </Button>
          </div>
        )}

        {/* State 3: Self Registration Form */}
        {showRegisterForm && !member && (
          <Card className="animate-slide-up rounded-2xl">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg p-2.5 leading-relaxed mb-1">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <div>
                  ไม่พบเบอร์โทรศัพท์ <strong>{phone}</strong> ในระบบสมาชิก สมัครสมาชิกฟรีได้ทันทีด้านล่างนี้
                </div>
              </div>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" /> สมัครสมาชิกใหม่
              </CardTitle>
              <CardDescription>กรุณาระบุชื่อของคุณเพื่อเริ่มสะสมแต้มและรับสิทธิ์แลกของรางวัล</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">ชื่อ-นามสกุลของคุณ *</Label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="reg-name"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      placeholder="กรอกชื่อและนามสกุล"
                      className="pl-10"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">เบอร์โทรศัพท์มือถือ *</Label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input id="reg-phone" value={phone} disabled className="pl-10 opacity-70 cursor-not-allowed" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">อีเมลของคุณ (ถ้ามี)</Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="reg-email"
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="pl-10"
                    />
                  </div>
                </div>

                {register.isError && (
                  <p className="text-xs text-danger flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {(register.error as any)?.response?.data?.error || 'เกิดข้อผิดพลาดในการลงทะเบียน'}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <Button type="button" onClick={() => setShowRegisterForm(false)} variant="outline" className="flex-1">
                    ย้อนกลับ
                  </Button>
                  <Button type="submit" className="flex-1" disabled={register.isPending || !registerName}>
                    {register.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ยืนยันการสมัครสมาชิก'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!redeemResult} onOpenChange={(o) => !o && setRedeemResult(null)}>
        <DialogContent className="max-w-sm customer-theme">
          <DialogHeader>
            <DialogTitle>แลกรับสิทธิ์สำเร็จ</DialogTitle>
          </DialogHeader>
          {redeemResult && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">{redeemResult.name}</p>
              <div className="rounded-xl border border-dashed border-primary/50 bg-primary/5 py-4">
                <div className="text-[11px] text-muted-foreground mb-1">โค้ดของคุณ — แสดงให้พนักงาน</div>
                <div className="text-3xl font-bold tracking-[0.25em] font-mono text-primary">{redeemResult.code}</div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard?.writeText(redeemResult.code);
                  setCodeCopied(true);
                }}
              >
                {codeCopied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {codeCopied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PortalShell({ children }: { children: React.ReactNode }) {
  return <div className="customer-theme min-h-screen bg-background flex items-center justify-center p-4">{children}</div>;
}

export default function MemberPortalPage() {
  return (
    <Suspense
      fallback={
        <PortalShell>
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </PortalShell>
      }
    >
      <MemberPortalContent />
    </Suspense>
  );
}
