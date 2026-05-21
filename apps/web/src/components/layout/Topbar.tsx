'use client';
import { Menu, Volume2, VolumeX, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { ShiftButton } from '@/components/shifts/ShiftButton';
import { StoreSwitcher } from '@/components/layout/StoreSwitcher';
import { getMuted, setMuted, playCashRegister } from '@/lib/sounds';
import { useAuth } from '@/stores/auth.store';

interface TopbarProps {
  title?: string;
  onMenuClick?: () => void;
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  const { pending, online } = useOfflineQueue();
  const { user } = useAuth();
  const [now, setNow] = useState('');
  const [paymentMuted, setPaymentMuted] = useState(() => getMuted('payment-muted'));

  const togglePaymentSound = () => {
    const next = !paymentMuted;
    setPaymentMuted(next);
    setMuted(next, 'payment-muted');
    if (!next) playCashRegister(true);
  };

  useEffect(() => {
    const update = () =>
      setNow(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate tracking-tight">{title}</h1>
          <div className="text-[11px] text-muted-foreground">
            {!online && '⚠ Offline · '}
            {pending > 0 && `${pending} pending sync · `}
            {now}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <StoreSwitcher />

        <ShiftButton />

        <button
          onClick={togglePaymentSound}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          title={paymentMuted ? 'Enable payment sound' : 'Mute payment sound'}
        >
          {paymentMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Status dot */}
        <div
          className={`w-2 h-2 rounded-full ${online ? 'bg-success' : 'bg-danger'}`}
          title={online ? 'Online' : 'Offline'}
        />

        {/* Avatar */}
        <div className="hidden sm:flex items-center gap-2.5 ml-2 pl-3 border-l border-border">
          <div className="text-right">
            <div className="text-xs font-medium leading-tight">{user?.name}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">{user?.role}</div>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
            {user?.name?.[0] || '?'}
          </div>
        </div>
      </div>
    </header>
  );
}
