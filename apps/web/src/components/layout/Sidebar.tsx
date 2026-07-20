'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  Package,
  Boxes,
  Receipt,
  Users,
  UserCircle,
  BarChart3,
  Settings,
  ChefHat,
  Grid3X3,
  Store,
  LogOut,
  X,
  History,
  LayoutDashboard,
  LineChart,
  Stamp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/auth.store';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';

// Analytics runs as a separate (read-only) app sharing the same database.
// Owners/admins just click through — no setup, no second login flow.
const ANALYTICS_URL =
  process.env.NEXT_PUBLIC_ANALYTICS_URL || 'http://localhost:3001';

type Role = 'OWNER' | 'ADMIN' | 'CASHIER' | 'KITCHEN';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  group: string | null;
}

// Grouped by role of use (matches the redesigned App Shell): sell → manage →
// owner-only tools. Dashboard sits ungrouped up top since it's the home page
// for OWNER/ADMIN, and Analytics stays ungrouped at the bottom (external app).
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'nav.dashboard', icon: LayoutDashboard, roles: ['OWNER', 'ADMIN'], group: null },
  { href: '/pos', label: 'nav.pos', icon: ShoppingCart, roles: ['OWNER', 'ADMIN', 'CASHIER'], group: 'nav.group.sales' },
  { href: '/kds', label: 'nav.kitchen', icon: ChefHat, roles: ['OWNER', 'ADMIN', 'KITCHEN'], group: 'nav.group.sales' },
  { href: '/tables', label: 'nav.tables', icon: Grid3X3, roles: ['OWNER', 'ADMIN', 'CASHIER'], group: 'nav.group.sales' },
  { href: '/orders', label: 'nav.orders', icon: Receipt, roles: ['OWNER', 'ADMIN', 'CASHIER'], group: 'nav.group.manage' },
  { href: '/products', label: 'nav.products', icon: Package, roles: ['OWNER', 'ADMIN'], group: 'nav.group.manage' },
  { href: '/inventory', label: 'nav.inventory', icon: Boxes, roles: ['OWNER', 'ADMIN'], group: 'nav.group.manage' },
  { href: '/customers', label: 'nav.customers', icon: UserCircle, roles: ['OWNER', 'ADMIN', 'CASHIER'], group: 'nav.group.manage' },
  { href: '/loyalty', label: 'nav.loyalty', icon: Stamp, roles: ['OWNER', 'ADMIN'], group: 'nav.group.manage' },
  { href: '/employees', label: 'nav.staff', icon: Users, roles: ['OWNER', 'ADMIN'], group: 'nav.group.owner' },
  { href: '/reports', label: 'nav.reports', icon: BarChart3, roles: ['OWNER', 'ADMIN'], group: 'nav.group.owner' },
  { href: '/activity', label: 'nav.activity', icon: History, roles: ['OWNER', 'ADMIN'], group: 'nav.group.owner' },
  { href: '/settings', label: 'nav.settings', icon: Settings, roles: ['OWNER', 'ADMIN'], group: 'nav.group.owner' },
];

// Preserve declaration order while grouping: null-group items first (as-is),
// then each labeled group in first-seen order.
function groupNav(items: NavItem[]) {
  const groups: { label: string | null; items: NavItem[] }[] = [];
  for (const item of items) {
    let bucket = groups.find((g) => g.label === item.group);
    if (!bucket) {
      bucket = { label: item.group, items: [] };
      groups.push(bucket);
    }
    bucket.items.push(item);
  }
  return groups;
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const t = useT();

  // Shares the 'my-stores' query cache with StoreSwitcher — no extra request.
  const { data: stores = [] } = useQuery({
    queryKey: ['my-stores'],
    queryFn: () => api.get('/stores/mine').then((r) => r.data),
    enabled: !!user,
  });
  const currentStoreName = stores.find((s: any) => s.isCurrent)?.name;

  const visibleItems = NAV_ITEMS.filter((n) => !user?.role || n.roles.includes(user.role));
  const groups = groupNav(visibleItems);

  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
  }, [pathname]);

  const content = (
    <>
      {/* Logo */}
      <div className="px-3.5 py-3.5 flex items-center justify-between md:justify-start gap-2.5 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm shrink-0">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-[13px] tracking-tight truncate">RestroPOS</div>
            {currentStoreName && (
              <div className="text-[10px] text-muted-foreground truncate">{currentStoreName}</div>
            )}
          </div>
        </div>
        <button
          onClick={onMobileClose}
          className="md:hidden p-2 rounded-md hover:bg-muted shrink-0"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-2.5 py-2.5 overflow-y-auto scrollbar-thin">
        {groups.map((group, gi) => (
          <div key={group.label ?? `ungrouped-${gi}`} className={gi > 0 ? 'mt-3' : undefined}>
            {group.label && (
              <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80">
                {t(group.label)}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors',
                      active
                        ? 'bg-primary text-white font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{t(item.label)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Analytics — opens the read-only insights app (shared data, new tab) */}
        {(!user?.role || ['OWNER', 'ADMIN'].includes(user.role)) && (
          <a
            href={ANALYTICS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LineChart className="w-4 h-4 shrink-0" />
            <span className="flex-1">{t('nav.analytics')}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              ↗
            </span>
          </a>
        )}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={() => {
            logout();
            window.location.href = '/login';
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-danger hover:bg-danger/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t('nav.logout')}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop / iPad sidebar */}
      <aside className="hidden md:flex w-[186px] lg:w-[200px] bg-card-hover border-r border-border flex-col h-full shrink-0">
        {content}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="md:hidden fixed inset-0 bg-black/50 z-40"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="md:hidden fixed top-0 left-0 bottom-0 w-64 bg-card border-r border-border flex flex-col z-50"
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
