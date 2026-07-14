'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Stamp, 
  Coins, 
  Search, 
  Loader2, 
  Sparkles, 
  ArrowLeft, 
  LogOut, 
  UserPlus, 
  Gift, 
  Phone, 
  Mail, 
  User, 
  AlertCircle
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

  const [phone, setPhone] = useState('');
  const [member, setMember] = useState<any>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');

  // Fetch Store Public Info
  const { data: store, isLoading: storeLoading, isError: storeError } = useQuery({
    queryKey: ['public-store', storeId],
    queryFn: () => api.get(`/self-order/store/${storeId}`).then((r) => r.data),
    enabled: !!storeId,
    retry: false,
  });

  // Automatically reset lookup states when storeId changes
  useEffect(() => {
    setMember(null);
    setPhone('');
    setLookupError('');
    setShowRegisterForm(false);
    setRegisterName('');
    setRegisterEmail('');
  }, [storeId]);

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
  };

  if (!storeId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-950/80 backdrop-blur-md shadow-2xl text-center">
          <CardHeader className="space-y-2">
            <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto text-primary animate-pulse">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <CardTitle className="text-xl font-bold text-slate-100 mt-2">ไม่พบลิงก์ของร้านค้า</CardTitle>
            <CardDescription className="text-slate-400">
              กรุณาสแกน QR Code สมาชิกที่ตั้งอยู่หน้าร้านค้า หรือใช้ลิงก์ที่ถูกต้องเพื่อเข้าสู่ระบบสมาชิก
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-slate-400">กำลังโหลดข้อมูลร้านค้า...</p>
        </div>
      </div>
    );
  }

  if (storeError || !store) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-950/80 backdrop-blur-md shadow-2xl text-center">
          <CardHeader className="space-y-2">
            <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto text-danger">
              <AlertCircle className="w-8 h-8 text-rose-500" />
            </div>
            <CardTitle className="text-xl font-bold text-slate-100">โหลดข้อมูลไม่สำเร็จ</CardTitle>
            <CardDescription className="text-slate-400">
              ไม่พบข้อมูลร้านค้านี้ในระบบ หรือร้านค้าปิดการใช้งานแล้ว
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-slate-100 flex flex-col items-center justify-center p-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header - Brand info */}
        <div className="text-center space-y-2">
          {store.logo ? (
            <img 
              src={store.logo.startsWith('http') ? store.logo : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${store.logo}`} 
              alt={store.name} 
              className="w-16 h-16 rounded-full mx-auto object-cover border border-slate-800 shadow-lg"
            />
          ) : (
            <div className="w-16 h-16 rounded-full mx-auto bg-primary/20 flex items-center justify-center text-primary border border-primary/30 shadow-lg">
              <span className="text-2xl font-bold">{store.name.substring(0, 1)}</span>
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tight text-white">{store.name}</h1>
          <p className="text-xs text-slate-400">ระบบสมาชิกดิจิทัลสะสมแต้ม & ดวง</p>
        </div>

        {/* State 1: Enter Phone Number */}
        {!member && !showRegisterForm && (
          <Card className="border-slate-800 bg-slate-950/75 backdrop-blur-md shadow-xl">
            <CardHeader>
              <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" /> ค้นหาข้อมูลสมาชิก
              </CardTitle>
              <CardDescription className="text-slate-400">
                กรอกเบอร์โทรศัพท์มือถือของคุณเพื่อดูคะแนนสะสมและบัตรสมาชิก
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLookup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">เบอร์โทรศัพท์ของคุณ</Label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="เช่น 0812345678"
                      className="pl-10 bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-primary focus-visible:border-primary"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {lookupError && (
                  <p className="text-xs text-rose-500 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {lookupError}
                  </p>
                )}

                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-xl transition-all"
                  disabled={lookupLoading || !phone}
                >
                  {lookupLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'ตรวจสอบข้อมูล / ค้นหา'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* State 2: Member Info Details Dashboard (Member card) */}
        {member && (
          <div className="space-y-5 animate-fade-in">
            {/* Digital Membership Card (Premium Glassmorphism layout) */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-700 via-indigo-800 to-purple-800 p-6 shadow-2xl text-white border border-indigo-600/30">
              {/* Backlight shine effect */}
              <div className="absolute -right-12 -top-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex justify-between items-start mb-6">
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-widest text-indigo-200 font-bold">บัตรสมาชิกออนไลน์</p>
                  <h2 className="text-lg font-bold truncate max-w-[200px]">{store.name}</h2>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-indigo-200">ชื่อลูกค้า</p>
                  <p className="text-base font-semibold truncate">{member.name}</p>
                </div>

                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] text-indigo-200">เบอร์โทรศัพท์</p>
                    <p className="text-sm font-mono tracking-wider">{member.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-indigo-200">รหัสสมาชิก</p>
                    <p className="text-xs font-mono opacity-80">{member.id.substring(member.id.length - 8)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scoreboard Cards */}
            <div className="grid grid-cols-2 gap-4">
              {showPoints && (
                <Card className="border-slate-800 bg-slate-950/75 backdrop-blur-md shadow-lg">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Coins className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">คะแนนสะสม</p>
                      <p className="text-xl font-bold text-amber-500 tabular-nums truncate">{member.points ?? 0} แต้ม</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {showStamps && (
                <Card className="border-slate-800 bg-slate-950/75 backdrop-blur-md shadow-lg">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                      <Stamp className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">ดวงบัตรสะสม</p>
                      <p className="text-xl font-bold text-indigo-400 tabular-nums truncate">{member.stamps ?? 0} ดวง</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Visual Stamp Card Progress Card */}
            {showStamps && (
              <Card className="border-slate-800 bg-slate-950/75 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Gift className="w-4 h-4 text-indigo-400" /> บัตรสะสมดวงของคุณ
                    </CardTitle>
                    <CardDescription className="text-[11px] text-slate-400">
                      ครบ {stampsPerReward} ดวง รับรางวัลฟรี!
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">
                      {currentStampsProgress} / {stampsPerReward} ดวง
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Grid layout for Stamp items */}
                  <div className="grid grid-cols-5 gap-2.5 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                    {Array.from({ length: stampsPerReward }).map((_, idx) => {
                      const isStamped = idx < currentStampsProgress;
                      return (
                        <div
                          key={idx}
                          className={`aspect-square rounded-full flex items-center justify-center text-xs font-bold border transition-all duration-300 relative ${
                            isStamped
                              ? 'bg-gradient-to-br from-indigo-600 to-purple-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30 scale-105 animate-pulse'
                              : 'bg-slate-950 border-slate-800 text-slate-600 border-dashed'
                          }`}
                        >
                          {isStamped ? (
                            <span className="text-sm">⭐</span>
                          ) : (
                            <span className="text-[10px] font-mono">{idx + 1}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Rewards ready indicator */}
                  {cardsReady > 0 && (
                    <div className="flex items-center gap-2.5 bg-indigo-950/50 border border-indigo-500/30 rounded-xl p-3 text-indigo-200">
                      <Gift className="w-5 h-5 text-indigo-400 animate-bounce flex-shrink-0" />
                      <div className="text-xs leading-relaxed">
                        <span className="font-semibold text-white">ยินดีด้วยครับ!</span> คุณมีของรางวัลรอแลกอยู่{' '}
                        <strong className="text-white bg-indigo-600 px-1.5 py-0.5 rounded text-[10px]">{cardsReady} รางวัล</strong>{' '}
                        แจ้งพนักงานเมื่อคิดเงินเพื่อกดแลกใช้สิทธิ์
                      </div>
                    </div>
                  )}

                  {/* Reward name configuration */}
                  {store.stampRewardName && (
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      <span>ของรางวัล: <strong className="text-slate-200">{store.stampRewardName}</strong></span>
                      {Number(store.stampRewardValue) > 0 && (
                        <span className="text-indigo-400">(มูลค่าส่วนลด {formatCurrency(store.stampRewardValue)})</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Actions button */}
            <div className="flex gap-3">
              <Button 
                onClick={resetPortal}
                variant="outline"
                className="flex-1 border-slate-800 bg-slate-950 hover:bg-slate-900 hover:text-white rounded-xl text-xs py-2"
              >
                <LogOut className="w-3.5 h-3.5 mr-1 text-slate-400" /> ออกจากหน้านี้
              </Button>
            </div>
          </div>
        )}

        {/* State 3: Self Registration Form */}
        {showRegisterForm && !member && (
          <Card className="border-slate-800 bg-slate-950/75 backdrop-blur-md shadow-xl animate-fade-in">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 leading-relaxed mb-1">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <div>
                  ไม่พบเบอร์โทรศัพท์ <strong>{phone}</strong> ในระบบสมาชิก สมัครสมาชิกฟรีได้ทันทีด้านล่างนี้
                </div>
              </div>
              <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" /> สมัครสมาชิกใหม่
              </CardTitle>
              <CardDescription className="text-slate-400">
                กรุณาระบุชื่อของคุณเพื่อเริ่มสะสมแต้มและรับสิทธิ์แลกของรางวัล
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">ชื่อ-นามสกุลของคุณ *</Label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="reg-name"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      placeholder="กรอกชื่อและนามสกุล"
                      className="pl-10 bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-primary focus-visible:border-primary"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">เบอร์โทรศัพท์มือถือ *</Label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="reg-phone"
                      value={phone}
                      disabled
                      className="pl-10 bg-slate-900/50 border-slate-850 text-slate-400 cursor-not-allowed opacity-80"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">อีเมลของคุณ (ถ้ามี)</Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="reg-email"
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="pl-10 bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-primary focus-visible:border-primary"
                    />
                  </div>
                </div>

                {register.isError && (
                  <p className="text-xs text-rose-500 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {(register.error as any)?.response?.data?.error || 'เกิดข้อผิดพลาดในการลงทะเบียน'}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <Button 
                    type="button" 
                    onClick={() => setShowRegisterForm(false)}
                    variant="outline"
                    className="flex-1 border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-xl"
                  >
                    ย้อนกลับ
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl"
                    disabled={register.isPending || !registerName}
                  >
                    {register.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'ยืนยันการสมัครสมาชิก'
                    )}
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

export default function MemberPortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-slate-100 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <MemberPortalContent />
    </Suspense>
  );
}
