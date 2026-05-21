'use client';
import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { useRequireAuth } from '@/hooks/useAuth';
import { useOrderRealtime } from '@/hooks/useSocket';
import { Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pos': 'Point of Sale',
  '/orders': 'Orders',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/employees': 'Staff',
  '/reports': 'Reports',
  '/kds': 'Kitchen Display',
  '/tables': 'Tables',
  '/customers': 'Customers',
  '/activity': 'Activity Log',
  '/settings': 'Settings',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth();
  useOrderRealtime();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pathname = usePathname();
  const title = TITLES[pathname || ''] || 'POS';

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar title={title} onMenuClick={() => setMobileOpen(true)} />
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
