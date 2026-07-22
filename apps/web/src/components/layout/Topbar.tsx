'use client';
import { Menu, Volume2, VolumeX, Monitor, Link2, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { ShiftButton } from '@/components/shifts/ShiftButton';
import { StoreSwitcher } from '@/components/layout/StoreSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { BillCallBell } from '@/components/layout/BillCallBell';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
    <header className="h-[58px] bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate tracking-tight">{title}</h1>
          {(!online || pending > 0) && (
            <div className="text-[11px] text-muted-foreground truncate">
              {!online && `⚠ ${t('topbar.offline')} · `}
              {pending > 0 && `${pending} ${t('topbar.pendingSync')} · `}
              {now}
            </div>
          )}
        </div>
        <ShiftButton />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <StoreSwitcher />

        <BillCallBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 pl-1 pr-1.5 sm:pl-2.5 sm:pr-2 py-1 rounded-lg sm:border sm:border-border hover:bg-muted transition-colors">
              <div className="hidden sm:block text-right leading-tight">
                <div className="text-xs font-semibold">{user?.name}</div>
                <div className="text-[10px] text-muted-foreground">{user?.role}</div>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {user?.name?.[0] || '?'}
              </div>
              <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{t('topbar.account')}</DropdownMenuLabel>
            <div className="px-2.5 pb-1.5 sm:hidden">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-muted-foreground">{user?.role}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={openCustomerDisplay}>
              <Monitor className="w-4 h-4 shrink-0" />
              <span className="flex-1">{t('pay.openCustomerDisplay')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={copyDisplayLink}>
              <Link2 className="w-4 h-4 shrink-0" />
              <span className="flex-1">{t('pay.copyDisplayLink')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ThemeToggle />
            <LanguageToggle />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); togglePaymentSound(); }}>
              {paymentMuted ? <VolumeX className="w-4 h-4 shrink-0" /> : <Volume2 className="w-4 h-4 shrink-0" />}
              <span className="flex-1">{paymentMuted ? t('topbar.sound.unmute') : t('topbar.sound.mute')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
