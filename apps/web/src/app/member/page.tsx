'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Stamp,
  Coins,
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';

function MemberPortalContent() {
  const searchParams = useSearchParams();
  const storeId = searchParams.get('storeId') || searchParams.get('s');
  // Present when this page was opened via the "scan to collect points" QR
  // printed on a receipt (see Receipt.tsx) — the order hasn't been linked to
  // any member yet, so once we know who's asking we claim it for them.
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
  const claimedRef = useRef(false);

  const { data: store, isLoading: storeLoading, isError: storeError } = useQuery({
    queryKey: ['public-store', storeId],
    queryFn: () => api.get(`/self-order/store/${storeId}`).then((r) => r.data),
    enabled: !!storeId,
    retry: false,
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
  }, [storeId]);

  // Once we know who the member is (via lookup or fresh registration) and
  // this visit came from a receipt QR, silently claim that order's points —
  // exactly what checkout would have earned had a cashier linked the member.
  useEffect(() => {
    if (!member || !orderId || claimedRef.current) return;
    claimedRef.current = true;
    api
      .post(`/self-order/order/${orderId}/claim-points`, { phone: member.phone })
      .then(({ data }) => {
        setMember((m: any) => ({ ...m, points: data.customer.points, stamps: data.customer.stamps }));
        if (data.earnedPoints > 0 || data.earnedStamps > 0) {
          setClaimResult({ earnedPoints: data.earnedPoints, earnedStamps: data.earnedStamps });
        }
      })
      .catch((err) => {
        const code = err.response?.data?.code;
        if (code !== 'ALREADY_CLAIMED') {
          setClaimNotice(err.response?.data?.error || 'สะสมแต้มจากบิลนี้ไม่สำเร็จ');
        }
      });
  }, [member, orderId]);

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
    <div className="min-h-screen bg-background flex flex-col items-center p-4 py-8 relative overflow-hidden">
      {/* Soft brand glow behind the page — purely decorative */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[36rem] h-[24rem] rounded-full bg-primary/20 blur-3xl opacity-60 dark:opacity-30" />

      <div className="w-full max-w-md space-y-4 relative">
        {/* Header — brand mark + greeting, matches the store's own bottom-nav style */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            {store.logo ? (
              <img
                src={store.logo.startsWith('http') ? store.logo : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${store.logo}`}
                alt={store.name}
                className="w-12 h-12 rounded-full object-cover border border-border shadow-sm"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-sm">
                <span className="text-lg font-bold">{store.name.substring(0, 1)}</span>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">สวัสดี</p>
              <p className="text-sm font-semibold truncate max-w-[160px]">{member ? member.name : 'ลูกค้า'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold tracking-widest uppercase">{store.name}</p>
          </div>
        </div>

        {/* Claim result banner — only when this visit came from a receipt QR */}
        {claimResult && (
          <div className="relative overflow-hidden rounded-2xl border border-success/30 bg-gradient-to-br from-success/15 via-success/10 to-transparent p-4 flex items-center gap-3 animate-slide-up shadow-card">
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
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" /> {claimNotice}
          </div>
        )}

        {/* State 1: Enter Phone Number */}
        {!member && !showRegisterForm && (
          <Card className="overflow-hidden shadow-card animate-slide-up">
            <div className="bg-gradient-to-br from-primary to-primary-600 px-5 pt-6 pb-8 text-center text-primary-foreground">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-7 h-7" />
              </div>
              <p className="text-base font-bold">สแกนแล้วสะสมแต้มได้เลย</p>
              <p className="text-xs text-primary-foreground/80 mt-1">ระบบสมาชิก {store.name}</p>
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
            {/* Digital membership card — dark gradient "wallet pass" look */}
            <div className="relative rounded-3xl overflow-hidden shadow-pop bg-gradient-to-br from-foreground via-[#1c2333] to-foreground text-background p-5">
              {/* Decorative rings, purely visual */}
              <div className="pointer-events-none absolute -right-10 -top-10 w-40 h-40 rounded-full border border-background/10" />
              <div className="pointer-events-none absolute -right-4 -bottom-8 w-28 h-28 rounded-full bg-primary/20 blur-2xl" />

              <div className="relative flex items-center justify-between">
                <span className="text-xs font-semibold tracking-widest uppercase opacity-70">บัตรสมาชิก</span>
                <Sparkles className="w-4 h-4 opacity-70" />
              </div>
              <p className="relative text-lg font-bold mt-3 truncate">{member.name}</p>
              <p className="relative text-xs font-mono opacity-60 tracking-wider">{member.phone}</p>

              <div className={`relative mt-5 grid ${showPoints && showStamps ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                {showPoints && (
                  <div className="rounded-2xl bg-background/10 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                      <Coins className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-2xl font-bold tabular-nums leading-tight">{member.points ?? 0}</div>
                      <div className="text-[11px] opacity-70 uppercase tracking-wide">แต้มสะสม</div>
                    </div>
                  </div>
                )}
                {showStamps && (
                  <div className="rounded-2xl bg-background/10 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-400/20 text-indigo-300 flex items-center justify-center shrink-0">
                      <Stamp className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-2xl font-bold tabular-nums leading-tight">{member.stamps ?? 0}</div>
                      <div className="text-[11px] opacity-70 uppercase tracking-wide">ดวงสะสม</div>
                    </div>
                  </div>
                )}
              </div>

              {showPoints && Number(store.pointValue) > 0 && (member.points ?? 0) > 0 && (
                <p className="relative mt-3 text-[11px] opacity-60">
                  แลกได้สูงสุด {formatCurrency((member.points ?? 0) * Number(store.pointValue))}
                  {Number(store.minRedeemPoints) > 0 && ` · ใช้ขั้นต่ำ ${store.minRedeemPoints} แต้ม`}
                </p>
              )}
            </div>

            {/* Stamp card progress */}
            {showStamps && (
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Gift className="w-4 h-4 text-indigo-600" /> บัตรสะสมดวงของคุณ
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      ครบ {stampsPerReward} ดวง รับรางวัลฟรี!
                    </CardDescription>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full shrink-0">
                    {currentStampsProgress} / {stampsPerReward}
                  </span>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-5 gap-2.5 bg-muted p-3 rounded-xl border border-border">
                    {Array.from({ length: stampsPerReward }).map((_, idx) => {
                      const isStamped = idx < currentStampsProgress;
                      return (
                        <div
                          key={idx}
                          className={`aspect-square rounded-full flex items-center justify-center text-xs font-bold border transition-all duration-300 ${
                            isStamped
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-md scale-105'
                              : 'bg-card border-border text-muted-foreground border-dashed'
                          }`}
                        >
                          {isStamped ? <span className="text-sm">⭐</span> : <span className="text-[10px] font-mono">{idx + 1}</span>}
                        </div>
                      );
                    })}
                  </div>

                  {cardsReady > 0 && (
                    <div className="flex items-center gap-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
                      <Gift className="w-5 h-5 text-indigo-600 shrink-0" />
                      <div className="text-xs leading-relaxed">
                        <span className="font-semibold">ยินดีด้วยครับ!</span> คุณมีของรางวัลรอแลกอยู่{' '}
                        <strong className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[10px]">{cardsReady} รางวัล</strong>{' '}
                        แจ้งพนักงานเมื่อคิดเงินเพื่อกดแลกใช้สิทธิ์
                      </div>
                    </div>
                  )}

                  {store.stampRewardName && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                      <span>
                        ของรางวัล: <strong className="text-foreground">{store.stampRewardName}</strong>
                      </span>
                      {Number(store.stampRewardValue) > 0 && (
                        <span className="text-indigo-600">(มูลค่าส่วนลด {formatCurrency(store.stampRewardValue)})</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Button onClick={resetPortal} variant="outline" className="w-full text-xs">
              <LogOut className="w-3.5 h-3.5 mr-1" /> ออกจากหน้านี้
            </Button>
          </div>
        )}

        {/* State 3: Self Registration Form */}
        {showRegisterForm && !member && (
          <Card className="animate-slide-up shadow-card">
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
    </div>
  );
}

function PortalShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background flex items-center justify-center p-4">{children}</div>;
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
