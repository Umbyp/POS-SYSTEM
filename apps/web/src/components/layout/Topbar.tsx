'use client';
import { Menu, Volume2, VolumeX, Bell, Monitor, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { ShiftButton } from '@/components/shifts/ShiftButton';
import { StoreSwitcher } from '@/components/layout/StoreSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { PendingSelfOrders } from '@/components/layout/PendingSelfOrders';
import { getMuted, setMuted, playCashRegister } from '@/lib/sounds';
import { useAuth } from '@/stores/auth.store';
import { useT } from '@/lib/i18n';

interface TopbarProps {
  title?: string;
  onMenuClick?: () => void;
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  const { pending, online } = useOfflineQueue();
  const { user } = useAuth();
  const t = useT();
  const [now, setNow] = useState('');
  const [paymentMuted, setPaymentMuted] = useState(() => getMuted('payment-muted'));

  const togglePaymentSound = () => {
    const next = !paymentMuted;
    setPaymentMuted(next);
    setMuted(next, 'payment-muted');
    if (!next) playCashRegister(true);
  };

  // Opens as a separate window (not just a tab) so the cashier can drag it
  // onto a second, customer-facing monitor. Includes ?store= so it also
  // connects over the network — same-machine mode still works instantly via
  // BroadcastChannel regardless.
  const displayUrl = () => `/customer-display${user?.storeId ? `?store=${user.storeId}` : ''}`;

  const openCustomerDisplay = () => {
    window.open(
      displayUrl(),
      'pos-customer-display',
      'width=900,height=700,menubar=no,toolbar=no,location=no,status=no'
    );
  };

  // For a display on a *separate* device (tablet/phone on the same network)
  // — the browser can't detect this machine's LAN IP itself, so if the POS
  // is currently open via "localhost" the copied link needs manual editing.
  const copyDisplayLink = async () => {
    const url = `${window.location.origin}${displayUrl()}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      toast.error(t('pay.copyLinkFailed'));
      return;
    }
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    toast.success(isLocalhost ? t('pay.linkCopiedLocalhostHint') : t('pay.linkCopied'));
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

        <PendingSelfOrders />

        <button
          onClick={openCustomerDisplay}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          title={t('pay.openCustomerDisplay')}
        >
          <Monitor className="w-4 h-4" />
        </button>

        <button
          onClick={copyDisplayLink}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          title={t('pay.copyDisplayLink')}
        >
          <Link2 className="w-4 h-4" />
        </button>

        <LanguageToggle />

        <ThemeToggle />

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
