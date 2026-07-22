'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import {
  Plus,
  Minus,
  ShoppingBag,
  Loader2,
  CheckCircle2,
  UtensilsCrossed,
  X,
  Search,
  Receipt,
  Check,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { resolveImageUrl } from '@/lib/imageUrl';
import { useT } from '@/lib/i18n';

interface Product {
  id: string;
  name: string;
  image: string | null;
  sellingPrice: number;
  categoryId: string;
}

interface Category {
  id: string;
  name: string;
  icon: string | null;
}

type Phase = 'menu' | 'cart' | 'approved';

/**
 * Customer's own phone, reached by scanning a table's QR code — no login.
 * Builds a cart locally and submits it; it's merged into the table's real
 * bill and hits the kitchen immediately, no staff approval step. See
 * self-order.service.ts on the API.
 *
 * Layout is capped at max-w-lg and centered — full-bleed on a phone, a
 * comfortable reading column if opened on a tablet/desktop browser instead.
 */
export default function SelfOrderPage() {
  const t = useT();
  const { code } = useParams<{ code: string }>();

  const { data: menu, isLoading, isError } = useQuery({
    queryKey: ['self-order-menu', code],
    queryFn: () => api.get(`/self-order/menu/${code}`).then((r) => r.data),
    retry: false,
  });

  const [cart, setCart] = useState<Record<string, number>>({});
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState<Phase>('menu');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [billCallState, setBillCallState] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Customer Loyalty member points states
  interface MemberInfo {
    id: string;
    name: string;
    phone: string;
    points: number;
    stamps?: number;
  }
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberPhone, setMemberPhone] = useState('');
  const [memberLookupError, setMemberLookupError] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');

  const products: Product[] = menu?.products || [];
  const categories: Category[] = menu?.categories || [];

  const visibleProducts = products.filter((p) => {
    if (categoryFilter && p.categoryId !== categoryFilter) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => ({ product: products.find((p) => p.id === productId)!, qty }))
        .filter((l) => l.product),
    [cart, products]
  );
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cartLines.reduce((s, l) => s + Number(l.product.sellingPrice) * l.qty, 0);

  const addOne = (productId: string) => setCart((c) => ({ ...c, [productId]: (c[productId] || 0) + 1 }));
  const removeOne = (productId: string) =>
    setCart((c) => ({ ...c, [productId]: Math.max(0, (c[productId] || 0) - 1) }));

  const submit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const items = cartLines.map((l) => ({ productId: l.product.id, quantity: l.qty }));
      const { data } = await api.post(`/self-order/${code}/submit`, {
        items,
        note: note.trim() || undefined,
        customerId: member?.id || undefined,
      });
      setRequestId(data.id);
      setOrderId(data.orderId || null);
      setPhase('approved');
    } catch (e: any) {
      setSubmitError(e.response?.data?.error || t('selfOrder.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  // "Call for the bill" — a plain notification, not a payment (see
  // self-order.service.ts callForBill). Cooldown just prevents accidental
  // double-taps; it resets on its own so the customer can call again if
  // staff genuinely hasn't come by yet.
  const callBill = async () => {
    setBillCallState('sending');
    try {
      await api.post(`/self-order/${code}/call-bill`);
      setBillCallState('sent');
      setTimeout(() => setBillCallState('idle'), 45_000);
    } catch {
      setBillCallState('idle');
    }
  };

  // Live kitchen status (PREPARING/READY/COMPLETED) via socket, with a light
  // polling fallback in case the socket never connects (some guest wifi
  // blocks websockets outright).
  useEffect(() => {
    if (!requestId || !orderId) return;
    const socketBase =
      process.env.NEXT_PUBLIC_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:4000`;
    const socket: Socket = io(`${socketBase}/self-order`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socket.on('connect', () => socket.emit('join', { orderId }));
    socket.on('order:status', (msg: { status: string }) => setOrderStatus(msg.status));

    const poll = setInterval(async () => {
      try {
        const { data } = await api.get(`/self-order/status/${requestId}`);
        if (data.orderStatus) setOrderStatus(data.orderStatus);
      } catch {
        /* keep polling */
      }
    }, 5000);

    return () => {
      socket.disconnect();
      clearInterval(poll);
    };
  }, [requestId, orderId]);

  const startOver = () => {
    setCart({});
    setNote('');
    setRequestId(null);
    setOrderId(null);
    setOrderStatus(null);
    setPhase('menu');
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-primary animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">{t('selfOrder.loading')}</p>
        </div>
      </div>
    );
  }

  if (isError || !menu) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background text-center p-6">
        <UtensilsCrossed className="w-12 h-12 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">{t('selfOrder.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <AnimatePresence mode="wait">
        {phase === 'approved' && (
          <motion.div
            key="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-[100dvh] flex flex-col items-center justify-center text-center p-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-6"
            >
              <CheckCircle2 className="w-11 h-11 text-success" />
            </motion.div>
            <h1 className="text-xl font-bold mb-2">{t('selfOrder.approvedTitle')}</h1>
            <p className="text-muted-foreground text-sm max-w-xs mb-2">
              {orderStatus === 'READY'
                ? t('selfOrder.readyHint')
                : orderStatus === 'COMPLETED'
                ? t('selfOrder.completedHint')
                : t('selfOrder.approvedHint')}
            </p>
            {orderStatus !== 'READY' && orderStatus !== 'COMPLETED' && (
              <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
                <UtensilsCrossed className="w-3.5 h-3.5 text-primary animate-pulse" />
                <span>{t('selfOrder.approvedDetail')}</span>
              </div>
            )}
            {orderStatus === 'READY' && (
              <span className="mb-4 px-3 py-1 rounded-full bg-success/15 text-success text-xs font-semibold">
                {t('selfOrder.readyBadge')}
              </span>
            )}
            <button
              onClick={startOver}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform"
            >
              {t('selfOrder.orderMore')}
            </button>
          </motion.div>
        )}

        {(phase === 'menu' || phase === 'cart') && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mx-auto max-w-lg">
              {/* Header + search + categories all scroll together as one sticky block */}
              <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {menu.store.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveImageUrl(menu.store.logo)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UtensilsCrossed className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate leading-tight">{menu.store.name}</div>
                    <div className="text-xs text-muted-foreground">{t('selfOrder.yourTable')}</div>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold tabular-nums">
                    {menu.table.number}
                  </span>
                  <button
                    onClick={callBill}
                    disabled={billCallState !== 'idle'}
                    title={billCallState === 'sent' ? t('selfOrder.callBillSent') : t('selfOrder.callBill')}
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      billCallState === 'sent'
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground active:scale-90'
                    }`}
                  >
                    {billCallState === 'sending' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : billCallState === 'sent' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Receipt className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {billCallState === 'sent' && (
                  <div className="px-4 pb-2 -mt-1">
                    <p className="text-xs text-success">{t('selfOrder.callBillSent')}</p>
                  </div>
                )}

                <div className="px-4 pb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('pos.searchPlaceholder')}
                      className="w-full h-10 pl-9 pr-3 rounded-xl bg-muted text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-thin">
                  <button
                    onClick={() => setCategoryFilter(null)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                      !categoryFilter
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {t('pos.all')}
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategoryFilter(c.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                        categoryFilter === c.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {c.icon} {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product grid */}
              {visibleProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <Search className="w-9 h-9 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">{t('pos.noProducts')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 pb-32">
                  {visibleProducts.map((p, i) => {
                    const qty = cart[p.id] || 0;
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.02 }}
                        className={`bg-card border rounded-2xl overflow-hidden shadow-card transition-colors ${
                          qty > 0 ? 'border-primary/50' : 'border-border'
                        }`}
                      >
                        <div className="relative aspect-square bg-muted">
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveImageUrl(p.image)}
                              alt={p.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <UtensilsCrossed className="w-8 h-8 text-muted-foreground/25" />
                            </div>
                          )}
                          {qty === 0 ? (
                            <button
                              onClick={() => addOne(p.id)}
                              aria-label={t('common.add')}
                              className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-pop flex items-center justify-center active:scale-90 transition-transform"
                            >
                              <Plus className="w-4.5 h-4.5" />
                            </button>
                          ) : (
                            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-card/95 backdrop-blur-sm rounded-full shadow-pop px-1 py-1">
                              <button
                                onClick={() => removeOne(p.id)}
                                aria-label={t('cart.aria.decreaseQty')}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-foreground active:scale-90 transition-transform"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-bold tabular-nums w-3 text-center">{qty}</span>
                              <button
                                onClick={() => addOne(p.id)}
                                aria-label={t('cart.aria.increaseQty')}
                                className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <div className="text-sm font-medium leading-snug line-clamp-2 min-h-[2.5em]">
                            {p.name}
                          </div>
                          <div className="text-sm text-primary font-bold tabular-nums mt-1">
                            {formatCurrency(p.sellingPrice)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sticky cart bar */}
            <AnimatePresence>
              {cartCount > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  onClick={() => setPhase('cart')}
                  className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
                >
                  <div className="bg-primary text-primary-foreground rounded-2xl shadow-pop py-3.5 px-4 flex items-center justify-between active:scale-[0.98] transition-transform">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="relative">
                        <ShoppingBag className="w-4 h-4" />
                        <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-background text-primary text-[10px] font-bold flex items-center justify-center tabular-nums">
                          {cartCount}
                        </span>
                      </span>
                      {t('selfOrder.viewCart')}
                    </span>
                    <span className="text-sm font-bold tabular-nums">{formatCurrency(cartTotal)}</span>
                  </div>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {phase === 'cart' && (
          // Outer motion element only animates opacity — a `transform` (which
          // is how framer-motion would animate `y`) on a `position: fixed`
          // element creates a new containing block and makes it stop being
          // viewport-relative, silently shifting the whole sheet (and its
          // buttons) offscreen. The slide-up motion lives on the inner div,
          // which has no positioning of its own to break.
          <motion.div
            key="cart-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={(e) => e.target === e.currentTarget && setPhase('menu')}
          >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="absolute inset-x-0 bottom-0 mx-auto max-w-lg max-h-[88dvh] bg-card rounded-t-3xl shadow-2xl flex flex-col"
          >
            <div className="pt-2.5 pb-1 flex justify-center shrink-0">
              <span className="w-10 h-1.5 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between px-4 pb-3 shrink-0">
              <h2 className="font-bold">{t('selfOrder.cartTitle')}</h2>
              <button onClick={() => setPhase('menu')} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 space-y-3">
              {cartLines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">{t('selfOrder.cartEmpty')}</p>
              ) : (
                cartLines.map((l) => (
                  <div key={l.product.id} className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                      {l.product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveImageUrl(l.product.image)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <UtensilsCrossed className="w-4 h-4 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.product.name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(l.product.sellingPrice)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-muted rounded-full">
                      <button
                        onClick={() => removeOne(l.product.id)}
                        aria-label={t('cart.aria.decreaseQty')}
                        className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-semibold tabular-nums w-4 text-center">{l.qty}</span>
                      <button
                        onClick={() => addOne(l.product.id)}
                        aria-label={t('cart.aria.increaseQty')}
                        className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              {cartLines.length > 0 && (
                <div className="border border-dashed border-border rounded-xl p-3 bg-muted/40 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                    <ShoppingBag className="w-4 h-4 text-primary" />
                    <span>สะสมแต้มสมาชิก POS Member 🎁</span>
                  </div>

                  {!member ? (
                    <button
                      type="button"
                      onClick={() => setShowMemberModal(true)}
                      className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-semibold active:scale-95 transition-all"
                    >
                      ค้นหาเบอร์โทรศัพท์ / สมัครสมาชิกใหม่
                    </button>
                  ) : (
                    <div className="space-y-3 bg-success/5 border border-success/20 rounded-lg p-3 text-left">
                      <div className="flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-success">
                            คุณ {member.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                            <span>เบอร์โทร: {member.phone}</span>
                            {menu?.store?.loyaltyMode !== 'STAMPS' && (
                              <span>• คะแนนสะสม: <strong className="text-success">{member.points ?? 0} แต้ม</strong></span>
                            )}
                            {(menu?.store?.loyaltyMode === 'STAMPS' || menu?.store?.loyaltyMode === 'BOTH') && (
                              <span>• ดวงสะสม: <strong className="text-indigo-600 dark:text-indigo-400">{member.stamps ?? 0} ดวง</strong></span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMember(null)}
                          className="text-danger hover:underline font-semibold text-[11px]"
                        >
                          ยกเลิก
                        </button>
                      </div>

                      {/* Visual Stamp Card Grid */}
                      {(menu?.store?.loyaltyMode === 'STAMPS' || menu?.store?.loyaltyMode === 'BOTH') && (
                        <div className="pt-2.5 border-t border-success/10">
                          <div className="text-[10px] text-muted-foreground mb-1.5 flex items-center justify-between">
                            <span>บัตรสะสมดวง (ครบ {menu.store.stampsPerReward || 10} ดวง รับรางวัล)</span>
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                              {(member.stamps ?? 0) % (menu.store.stampsPerReward || 10)} / {menu.store.stampsPerReward || 10} ดวง
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1 bg-card/60 p-2 rounded-lg border border-border">
                            {Array.from({ length: menu.store.stampsPerReward || 10 }).map((_, idx) => {
                              const isStamped = idx < ((member.stamps ?? 0) % (menu.store.stampsPerReward || 10));
                              return (
                                <div
                                  key={idx}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${
                                    isStamped
                                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm scale-105 animate-pulse'
                                      : 'bg-muted/40 border-dashed border-muted-foreground/30 text-muted-foreground/40'
                                  }`}
                                >
                                  {isStamped ? '⭐' : idx + 1}
                                </div>
                              );
                            })}
                          </div>
                          {menu.store.stampRewardName && (
                            <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                              <span>🎁 ของรางวัล:</span>
                              <span className="font-medium text-foreground">{menu.store.stampRewardName}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {cartLines.length > 0 && (
                <div className="pb-1">
                  <label className="text-xs text-muted-foreground mb-1 block">{t('selfOrder.noteLabel')}</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('selfOrder.notePlaceholder')}
                    rows={2}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              )}
            </div>

            {cartLines.length > 0 && (
              <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2 shrink-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('selfOrder.estimatedTotal')}</span>
                  <span className="font-bold tabular-nums text-lg">{formatCurrency(cartTotal)}</span>
                </div>
                {submitError && <p className="text-xs text-danger">{submitError}</p>}
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 shadow-[0_8px_18px_-6px_rgba(255,107,53,0.6)]"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('selfOrder.submit')}
                </button>
                <p className="text-center text-[10.5px] text-muted-foreground leading-relaxed">
                  {t('selfOrder.confirmHint')}
                  <br />
                  {t('selfOrder.noPaymentYetHint')}
                </p>
              </div>
            )}
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showMemberModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-xl overflow-hidden flex flex-col border border-border">
            <div className="px-4 py-3.5 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="font-bold text-sm text-foreground">สะสมแต้มสมาชิก (POS Member)</h3>
              <button
                type="button"
                onClick={() => {
                  setShowMemberModal(false);
                  setShowRegisterForm(false);
                  setMemberPhone('');
                  setMemberLookupError('');
                  setRegisterName('');
                  setRegisterEmail('');
                }}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              {!showRegisterForm ? (
                <div className="space-y-3 text-left">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">กรอกเบอร์โทรศัพท์ของสมาชิก</label>
                    <input
                      type="tel"
                      value={memberPhone}
                      onChange={(e) => {
                        setMemberPhone(e.target.value);
                        setMemberLookupError('');
                      }}
                      placeholder="เช่น 0812345678"
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                    />
                  </div>
                  {memberLookupError && <p className="text-xs text-danger">{memberLookupError}</p>}
                  <button
                    type="button"
                    disabled={memberLoading || !memberPhone}
                    onClick={async () => {
                      setMemberLoading(true);
                      setMemberLookupError('');
                      try {
                        const { data } = await api.get(`/self-order/${code}/customer/lookup?phone=${memberPhone}`);
                        if (data && data.id) {
                          setMember(data);
                          setShowMemberModal(false);
                          setMemberPhone('');
                        } else {
                          setMemberLookupError('ไม่พบเบอร์โทรศัพท์นี้ในระบบสมาชิก');
                          setShowRegisterForm(true);
                        }
                      } catch (e: any) {
                        setMemberLookupError(e.response?.data?.error || 'เกิดข้อผิดพลาดในการตรวจสอบ');
                      } finally {
                        setMemberLoading(false);
                      }
                    }}
                    className="w-full py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {memberLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'ตรวจสอบเบอร์โทรศัพท์'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-left">
                  <p className="text-xs text-warning bg-warning/15 border border-warning/20 rounded-lg p-2.5 leading-relaxed">
                    ไม่พบเบอร์โทรศัพท์ <strong>{memberPhone}</strong> ในระบบสมาชิก ท่านสามารถลงทะเบียนสมัครสมาชิกใหม่ได้ทันทีด้านล่างนี้
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">ชื่อ-นามสกุล สมาชิก *</label>
                    <input
                      type="text"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      placeholder="กรอกชื่อและนามสกุล"
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">เบอร์โทรศัพท์ *</label>
                    <input
                      type="tel"
                      value={memberPhone}
                      disabled
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none opacity-80 text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">อีเมล (ถ้ามี)</label>
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                    />
                  </div>

                  {memberLookupError && <p className="text-xs text-danger">{memberLookupError}</p>}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRegisterForm(false)}
                      className="flex-1 py-2 bg-muted hover:bg-muted/80 text-muted-foreground font-semibold text-xs rounded-lg active:scale-95 transition-all"
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      type="button"
                      disabled={memberLoading || !registerName}
                      onClick={async () => {
                        setMemberLoading(true);
                        setMemberLookupError('');
                        try {
                          const { data } = await api.post(`/self-order/${code}/customer/register`, {
                            name: registerName,
                            phone: memberPhone,
                            email: registerEmail || undefined,
                          });
                          setMember(data);
                          setShowMemberModal(false);
                          setShowRegisterForm(false);
                          setMemberPhone('');
                          setRegisterName('');
                          setRegisterEmail('');
                        } catch (e: any) {
                          setMemberLookupError(e.response?.data?.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
                        } finally {
                          setMemberLoading(false);
                        }
                      }}
                      className="flex-1 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {memberLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'สมัครสมาชิกและเชื่อมต่อ'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
