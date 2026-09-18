import {
  LayoutDashboard,
  ShoppingCart,
  ChefHat,
  Grid3X3,
  Receipt,
  Package,
  Boxes,
  UserCircle,
  Stamp,
  Users,
  BarChart3,
  History,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import type { Role } from '@/stores/auth.store';

export interface NavItem {
  key: string;
  /** Route path — (app)/(tabs) are layout-only groups, stripped from the URL */
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** true = lives in the bottom tab bar, false = reachable from the "More" screen */
  tab: boolean;
}

// Mirrors apps/web/src/components/layout/Sidebar.tsx's NAV_ITEMS — same
// destinations, same role gating, so parity with the web dashboard is a
// straight lookup rather than a redesign.
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['OWNER', 'ADMIN'], tab: true },
  { key: 'pos', href: '/pos', label: 'POS', icon: ShoppingCart, roles: ['OWNER', 'ADMIN', 'CASHIER'], tab: true },
  { key: 'kds', href: '/kds', label: 'Kitchen', icon: ChefHat, roles: ['OWNER', 'ADMIN', 'KITCHEN'], tab: true },
  { key: 'tables', href: '/tables', label: 'Tables', icon: Grid3X3, roles: ['OWNER', 'ADMIN', 'CASHIER'], tab: true },
  { key: 'orders', href: '/orders', label: 'Orders', icon: Receipt, roles: ['OWNER', 'ADMIN', 'CASHIER'], tab: false },
  { key: 'products', href: '/products', label: 'Products', icon: Package, roles: ['OWNER', 'ADMIN'], tab: false },
  { key: 'inventory', href: '/inventory', label: 'Inventory', icon: Boxes, roles: ['OWNER', 'ADMIN'], tab: false },
  { key: 'customers', href: '/customers', label: 'Customers', icon: UserCircle, roles: ['OWNER', 'ADMIN', 'CASHIER'], tab: false },
  { key: 'loyalty', href: '/loyalty', label: 'Loyalty', icon: Stamp, roles: ['OWNER', 'ADMIN'], tab: false },
  { key: 'employees', href: '/employees', label: 'Staff', icon: Users, roles: ['OWNER', 'ADMIN'], tab: false },
  { key: 'reports', href: '/reports', label: 'Reports', icon: BarChart3, roles: ['OWNER', 'ADMIN'], tab: false },
  { key: 'activity', href: '/activity', label: 'Activity', icon: History, roles: ['OWNER', 'ADMIN'], tab: false },
  { key: 'settings', href: '/settings', label: 'Settings', icon: Settings, roles: ['OWNER', 'ADMIN'], tab: false },
];

// Landing tab per role, matching (dashboard)/dashboard/page.tsx's redirect
// (non-owner/admin bounce to /pos) plus kitchen's single-purpose KDS role.
export const DEFAULT_ROUTE: Record<Role, string> = {
  OWNER: '/dashboard',
  ADMIN: '/dashboard',
  CASHIER: '/pos',
  KITCHEN: '/kds',
};

export function visibleNavItems(role: Role | undefined) {
  return NAV_ITEMS.filter((item) => !!role && item.roles.includes(role));
}
