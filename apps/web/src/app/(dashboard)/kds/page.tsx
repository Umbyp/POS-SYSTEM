'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, CheckCircle2, Volume2, VolumeX, Link2, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/stores/auth.store';
import { useT } from '@/lib/i18n';
import { playBeep } from '@/lib/sounds';

/**
 * Group order items by when they were fired. Items created within ~2s of
 * each other count as the same round (nested creates in one transaction
 * share nearly the same timestamp); a bigger gap means a later addRound()
 * call — i.e. the table ordered more after the ticket was already cooking.
 */
function groupByRound(items: any[]) {
  const sorted = [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const groups: { firedAt: string; items: any[] }[] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && new Date(item.createdAt).getTime() - new Date(last.firedAt).getTime() <= 2000) {
      last.items.push(item);
    } else {
      groups.push({ firedAt: item.createdAt, items: [item] });
    }
  }
  return groups;
}

function TicketItems({ items }: { items: any[] }) {
  return (
    <div className="space-y-1.5 mb-3 border-t border-border pt-2.5 text-[13.5px] leading-relaxed">
      {groupByRound(items).map((round, i) => (
        <div
          key={round.firedAt}
          className={i > 0 ? 'pt-2 mt-1 border-t border-dashed border-accent/40' : undefined}
        >
          {i > 0 && (
            <div className="text-[11px] font-bold text-accent mb-1">
              ⊕ เพิ่มรอบใหม่ · {Math.max(0, Math.floor((Date.now() - new Date(round.firedAt).getTime()) / 60000))} นาทีที่แล้ว
            </div>
          )}
          {round.items.map((item: any) => (
            <div key={item.id} className="flex gap-1.5 flex-wrap items-baseline">
              <span className="font-bold text-primary">{item.quantity}×</span>
              <span className="font-medium">{item.product.name}</span>
              {item.notes && (
                <span className="text-[11px] font-semibold text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                  {item.notes}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Order-level note from the customer (e.g. self-order checkout note) — distinct from per-item notes. */
function OrderNote({ notes }: { notes?: string | null }) {
  if (!notes) return null;
  return (
    <div className="mb-2 text-[12px] font-semibold text-warning bg-warning/10 px-2 py-1 rounded-lg whitespace-pre-line">
      📝 {notes}
    </div>
  );
}

/** Small square badge showing the table number, or the order's short tail for non-table tickets. */
function EntityBadge({ order, tone }: { order: any; tone: 'default' | 'danger' | 'success' }) {
  const label = order.table ? order.table.number : order.orderNumber?.slice(-2);
  const toneClass =
    tone === 'danger' ? 'bg-danger text-white' : tone === 'success' ? 'bg-success text-white' : 'bg-foreground text-background';
  return (
    <span className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[13px] font-extrabold ${toneClass}`}>
      {label}
    </span>
  );
}

function entityLabel(t: (k: string, f?: string) => string, order: any) {
  if (order.table) return `${t('cart.tableWord')} ${order.table.number}`;
  return order.type === 'TAKEAWAY' ? t('cart.takeaway') : t('cart.delivery');
}

export default function KDSPage() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('kds-muted') === '1';
  });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [tick, setTick] = useState(0);
  const [connected, setConnected] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['kds-board'] });
  };

  // Pending (not started) + preparing (cooking) + ready (done, awaiting
  // pickup/serve) in one request instead of three separate polls — split by
  // status client-side below.
  const { data: boardData, isLoading } = useQuery({
    queryKey: ['kds-board'],
    queryFn: () =>
      api.get('/orders', { params: { status: 'PENDING,PREPARING,READY', limit: 150 } }).then((r) => r.data),
    refetchInterval: 10_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }).then((r) => r.data),
    onSuccess: invalidateAll,
  });

  // re-render every 30s to update elapsed time
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Beep on new orders; refresh all queues on any status change from
  // elsewhere (another till marking something ready/picked up). Also track
  // live connection state for the header indicator.
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    setConnected(s.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNew = (order: any) => {
      invalidateAll();
      if (!mutedRef.current) {
        playBeep(true);
        toast.info(`🍽️ ${t('kds.newOrderToast')}: ${order.orderNumber}`, { duration: 5000 });
      }
    };
    const onStatus = () => invalidateAll();
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('kds:new', onNew);
    s.on('kds:status', onStatus);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('kds:new', onNew);
      s.off('kds:status', onStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('kds-muted', next ? '1' : '0');
    if (!next) playBeep(true);
  };

  const readyBoardUrl = () => `/ready-board${user?.storeId ? `?store=${user.storeId}` : ''}`;
  const openReadyBoard = () => {
    window.open(
      readyBoardUrl(),
      'pos-ready-board',
      'width=1100,height=700,menubar=no,toolbar=no,location=no,status=no'
    );
  };
  const copyReadyBoardLink = async () => {
    const url = `${window.location.origin}${readyBoardUrl()}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('kds.linkCopied'));
    } catch {
      toast.error(t('kds.linkCopyFailed'));
    }
  };

  const boardOrders = boardData?.data || [];
  const pendingOrders = boardOrders.filter((o: any) => o.status === 'PENDING');
  const preparingOrders = boardOrders.filter((o: any) => o.status === 'PREPARING');
  const readyOrders = boardOrders.filter((o: any) => o.status === 'READY');
  const isEmpty = pendingOrders.length === 0 && preparingOrders.length === 0 && readyOrders.length === 0;

  return (
    <div className="p-4 sm:p-6 h-full overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg sm:text-xl font-extrabold flex items-center gap-2">
          <ChefHat className="w-6 h-6 text-primary" /> {t('kds.title')}
        </h2>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`} />
            {connected ? t('kds.connected') : t('kds.disconnected')}
          </span>
          <button
            onClick={openReadyBoard}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            title={t('kds.openReadyBoard')}
          >
            <Tv className="w-4 h-4" />
          </button>
          <button
            onClick={copyReadyBoardLink}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            title={t('kds.copyReadyBoardLink')}
          >
            <Link2 className="w-4 h-4" />
          </button>
          <button
            onClick={toggleMute}
            className={`p-2 rounded-lg border transition-colors ${
              muted
                ? 'border-border text-muted-foreground hover:text-foreground'
                : 'border-success text-success bg-success/10'
            }`}
            title={muted ? t('kds.unmuteAlerts') : t('kds.muteAlerts')}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shimmer rounded-2xl" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <CheckCircle2 className="w-16 h-16 mb-4 text-success opacity-50" />
          <p className="text-lg font-semibold">{t('kds.empty')}</p>
          <p className="text-sm">{t('kds.emptyHint')}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Column: รอเริ่มทำ */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted mb-2.5 shrink-0">
              <span className="text-[13px] font-extrabold flex-1">{t('kds.col.pending')}</span>
              <span className="text-xs font-extrabold bg-card border border-border min-w-[22px] text-center px-1.5 py-0.5 rounded-full">
                {pendingOrders.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2.5 pr-0.5">
              <AnimatePresence>
                {pendingOrders.map((o: any) => (
                  <motion.div
                    key={o.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-card border border-border rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <EntityBadge order={o} tone="default" />
                        <span className="text-sm font-extrabold">{entityLabel(t, o)}</span>
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">{t('kds.justIn')}</span>
                    </div>
                    <OrderNote notes={o.notes} />
                    <TicketItems items={o.items} />
                    <button
                      onClick={() => updateStatus.mutate({ id: o.id, status: 'PREPARING' })}
                      disabled={updateStatus.isPending}
                      className="w-full h-11 rounded-lg bg-foreground text-background font-extrabold text-sm disabled:opacity-50"
                    >
                      {t('kds.startCooking')} ▸
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Column: กำลังทำ */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 mb-2.5 shrink-0">
              <span className="text-[13px] font-extrabold flex-1 text-primary-600">{t('kds.col.preparing')}</span>
              <span className="text-xs font-extrabold bg-primary text-white min-w-[22px] text-center px-1.5 py-0.5 rounded-full">
                {preparingOrders.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2.5 pr-0.5">
              <AnimatePresence>
                {preparingOrders.map((o: any) => {
                  const elapsed = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
                  const urgent = elapsed >= 15;
                  return (
                    <motion.div
                      key={o.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`relative bg-card rounded-xl p-3 border-2 ${
                        urgent ? 'border-danger' : 'border-border'
                      }`}
                    >
                      {urgent && (
                        <span className="absolute -top-2.5 right-2.5 bg-danger text-white text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full">
                          ⏱ {elapsed} {t('kds.minutes')} · {t('kds.overtime')}
                        </span>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <EntityBadge order={o} tone={urgent ? 'danger' : 'default'} />
                          <span className="text-sm font-extrabold">{entityLabel(t, o)}</span>
                        </div>
                        {!urgent && (
                          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                            ⏱ {elapsed} {t('kds.minutes')}
                          </span>
                        )}
                      </div>
                      <OrderNote notes={o.notes} />
                      <TicketItems items={o.items} />
                      <button
                        onClick={() => updateStatus.mutate({ id: o.id, status: 'READY' })}
                        disabled={updateStatus.isPending}
                        className="w-full h-11 rounded-lg bg-success text-white font-extrabold text-sm disabled:opacity-50"
                      >
                        {t('kds.doneNotify')} ▸
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Column: พร้อมเสิร์ฟ */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 mb-2.5 shrink-0">
              <span className="text-[13px] font-extrabold flex-1 text-success">{t('kds.col.ready')}</span>
              <span className="text-xs font-extrabold bg-success text-white min-w-[22px] text-center px-1.5 py-0.5 rounded-full">
                {readyOrders.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2.5 pr-0.5">
              <AnimatePresence>
                {readyOrders.map((o: any) => {
                  const isDineIn = !!o.table;
                  return (
                    <motion.div
                      key={o.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`rounded-xl p-3 border ${
                        isDineIn ? 'bg-card-hover border-border' : 'bg-card border-2 border-success/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <EntityBadge order={o} tone={isDineIn ? 'default' : 'success'} />
                        <span className="text-sm font-extrabold">{entityLabel(t, o)}</span>
                      </div>
                      <OrderNote notes={o.notes} />
                      <TicketItems items={o.items} />
                      {isDineIn ? (
                        <div className="flex items-center justify-center gap-1.5 h-[38px] rounded-lg bg-muted text-muted-foreground text-xs font-semibold text-center">
                          ⏳ {t('kds.waitingBillDineIn')}
                        </div>
                      ) : (
                        <button
                          onClick={() => updateStatus.mutate({ id: o.id, status: 'COMPLETED' })}
                          disabled={updateStatus.isPending}
                          className="w-full h-11 rounded-lg bg-primary text-white font-extrabold text-sm disabled:opacity-50"
                        >
                          {t('kds.customerReceived')} ✓
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
