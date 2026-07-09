'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChefHat, CheckCircle2, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export default function KDSPage() {
  const qc = useQueryClient();
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('kds-muted') === '1';
  });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [tick, setTick] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['kds-orders'],
    queryFn: () =>
      api.get('/orders', { params: { status: 'PENDING', limit: 50 } }).then((r) => r.data),
    refetchInterval: 10_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-orders'] }),
  });

  // re-render every 30s to update elapsed time
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Beep on new orders
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onNew = (order: any) => {
      qc.invalidateQueries({ queryKey: ['kds-orders'] });
      if (!mutedRef.current) {
        playBeep(true); // force play (already gated by mutedRef)
        toast.info(`🍽️ New order: ${order.orderNumber}`, { duration: 5000 });
      }
    };
    s.on('kds:new', onNew);
    return () => {
      s.off('kds:new', onNew);
    };
  }, [qc]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('kds-muted', next ? '1' : '0');
    if (!next) playBeep(true); // test sound when unmuting
  };

  const orders = data?.data || [];

  return (
    <div className="p-4 sm:p-6 h-full overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <ChefHat className="w-6 h-6 text-primary" /> Kitchen Display
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-lg border transition-colors ${
              muted
                ? 'border-border text-muted-foreground hover:text-foreground'
                : 'border-success text-success bg-success/10'
            }`}
            title={muted ? 'Unmute alerts' : 'Mute alerts'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <Badge variant="accent">{orders.length} orders pending</Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 flex-1">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer rounded-2xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <CheckCircle2 className="w-16 h-16 mb-4 text-success opacity-50" />
          <p className="text-lg">No pending orders</p>
          <p className="text-sm">Waiting for new orders...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto scrollbar-thin pb-2">
          <AnimatePresence>
            {orders.map((o: any) => {
              const elapsed = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
              const urgent = elapsed >= 15;
              return (
                <motion.div
                  key={o.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`bg-card border-2 rounded-2xl p-4 ${
                    urgent ? 'border-danger animate-pulse' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-mono text-sm text-muted-foreground">{o.orderNumber}</div>
                      <div className="font-bold">
                        {o.table ? `Table ${o.table.number}` : o.type === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1 text-sm tabular-nums ${
                        urgent ? 'text-danger' : 'text-muted-foreground'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      {elapsed} min
                    </div>
                  </div>

                  <div className="space-y-2 mb-3 border-y border-border py-2">
                    {groupByRound(o.items).map((round, i) => (
                      <div
                        key={round.firedAt}
                        className={i > 0 ? 'pt-2 mt-1 border-t border-dashed border-accent/40' : undefined}
                      >
                        {i > 0 && (
                          <div className="text-[10px] font-semibold text-accent uppercase tracking-wide mb-1">
                            + เพิ่มรอบใหม่ · {Math.max(0, Math.floor((Date.now() - new Date(round.firedAt).getTime()) / 60000))} นาทีที่แล้ว
                          </div>
                        )}
                        {round.items.map((item: any) => (
                          <div key={item.id} className="flex gap-2">
                            <span className="font-bold text-accent w-8 text-center">
                              {item.quantity}×
                            </span>
                            <div className="flex-1">
                              <div className="font-medium">{item.product.name}</div>
                              {item.notes && (
                                <div className="text-xs text-warning italic">↪ {item.notes}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  <Button
                    size="lg"
                    variant="success"
                    className="w-full"
                    onClick={() => updateStatus.mutate({ id: o.id, status: 'COMPLETED' })}
                    disabled={updateStatus.isPending}
                  >
                    Mark done
                  </Button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
