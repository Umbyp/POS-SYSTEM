'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/auth.store';

// Analytics runs as a separate (read-only) app sharing the same database.
// Owners/admins just click through — no setup, no second login flow.
const ANALYTICS_URL =
  process.env.NEXT_PUBLIC_ANALYTICS_URL || 'http://localhost:3001';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['OWNER', 'ADMIN'] },
  { href: '/pos', label: 'POS', icon: ShoppingCart, roles: ['OWNER', 'ADMIN', 'CASHIER'] },
  { href: '/kds', label: 'Kitchen', icon: ChefHat, roles: ['OWNER', 'ADMIN', 'KITCHEN'] },
  { href: '/tables', label: 'Tables', icon: Grid3X3, roles: ['OWNER', 'ADMIN', 'CASHIER'] },
  { href: '/orders', label: 'Orders', icon: Receipt, roles: ['OWNER', 'ADMIN', 'CASHIER'] },
  { href: '/products', label: 'Products', icon: Package, roles: ['OWNER', 'ADMIN'] },
  { href: '/inventory', label: 'Inventory', icon: Boxes, roles: ['OWNER', 'ADMIN'] },
  { href: '/customers', label: 'Customers', icon: UserCircle, roles: ['OWNER', 'ADMIN', 'CASHIER'] },
  { href: '/employees', label: 'Staff', icon: Users, roles: ['OWNER', 'ADMIN'] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['OWNER', 'ADMIN'] },
  { href: '/activity', label: 'Activity', icon: History, roles: ['OWNER', 'ADMIN'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['OWNER', 'ADMIN'] },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const items = NAV.filter((n) => !user?.role || n.roles.includes(user.role));

  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
  }, [pathname]);

  const content = (
    <>
      {/* Logo */}
      <div className="px-5 py-5 flex items-center justify-between md:justify-start gap-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight">RestroPOS</div>
          </div>
        </div>
        <button
          onClick={onMobileClose}
          className="md:hidden p-2 rounded-md hover:bg-muted"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* User chip */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {user?.name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{user?.name || 'User'}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {user?.role}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-primary text-white font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Analytics — opens the read-only insights app (shared data, new tab) */}
        {(!user?.role || ['OWNER', 'ADMIN'].includes(user.role)) && (
          <a
            href={ANALYTICS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LineChart className="w-4 h-4 shrink-0" />
            <span className="flex-1">Analytics</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              ดูข้อมูล
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
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-danger hover:bg-danger/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop / iPad sidebar */}
      <aside className="hidden md:flex w-52 lg:w-56 bg-card border-r border-border flex-col h-full shrink-0">
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
