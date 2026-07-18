'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, UtensilsCrossed, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocketUrl } from '@/lib/socket';

interface ReadyOrder {
  id: string;
  orderNumber: string;
  type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  createdAt: string;
  table: { number: string } | null;
  items: { quantity: number; product: { name: string } }[];
}

/** Short, easy-to-call-out label: table number for dine-in, last 4 digits of
 *  the order number for takeaway/delivery (matches what's printed on receipts). */
function pickupLabel(o: ReadyOrder): string {
  if (o.table) return `โต๊ะ ${o.table.number}`;
  const tail = o.orderNumber.split('-').pop() || o.orderNumber;
  return `#${tail}`;
}

function ReadyBoardContent() {
  const storeId = useSearchParams().get('store') || undefined;
  const [now, setNow] = useState('');

  const { data: orders = [], refetch } = useQuery<ReadyOrder[]>({
    queryKey: ['ready-board', storeId],
    queryFn: () => api.get(`/display/store/${storeId}/ready-board`).then((r) => r.data),
    enabled: !!storeId,
    refetchInterval: 15_000, // fallback poll in case the socket drops
  });

  // Live push: the API pings this event whenever an order becomes ready or
  // leaves the board, so the screen updates within a second — no login,
  // same unauthenticated /display namespace the customer-display page uses.
  useEffect(() => {
    if (!storeId) return;
    const socket: Socket = io(`${getSocketUrl()}/display`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socket.on('connect', () => socket.emit('join', { storeId }));
    socket.on('ready-board:update', () => refetch());
    return () => {
      socket.disconnect();
    };
  }, [storeId, refetch]);

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!storeId) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-warning" />
          <h1 className="text-lg font-semibold">ไม่พบลิงก์ของร้านค้า</h1>
          <p className="text-sm text-muted-foreground">
            เปิดจากปุ่ม “เปิดจอออเดอร์พร้อมรับ” ในหน้าครัว (KDS) ของร้าน
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col p-6 sm:p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <Bell className="w-8 h-8 text-success" />
          ออเดอร์พร้อมแล้ว
        </h1>
        <span className="text-lg text-muted-foreground tabular-nums">{now}</span>
      </div>

      {orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <UtensilsCrossed className="w-16 h-16 opacity-40" />
          <p className="text-xl">ยังไม่มีออเดอร์ที่พร้อมส่ง</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <AnimatePresence>
            {orders.map((o) => (
              <motion.div
                key={o.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="bg-success/10 border-4 border-success rounded-3xl p-6 flex flex-col items-center text-center shadow-lg"
              >
                <div className="text-4xl sm:text-5xl font-black tabular-nums text-success tracking-tight">
                  {pickupLabel(o)}
                </div>
                <div className="mt-3 text-sm text-muted-foreground line-clamp-2">
                  {o.items.map((i) => `${i.product.name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join(', ')}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default function ReadyBoardPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-background" />}>
      <ReadyBoardContent />
    </Suspense>
  );
}
