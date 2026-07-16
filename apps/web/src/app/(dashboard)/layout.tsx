'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useRequireAuth } from '@/hooks/useAuth';
import { useOrderRealtime } from '@/hooks/useSocket';
import { api } from '@/lib/api';
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
  // Instant local dismiss so the wizard closes immediately on skip/finish —
  // the wizard also persists via PATCH /stores/me (see OnboardingWizard),
  // this just avoids waiting on that request/refetch to close the dialog.
  const [dismissedLocally, setDismissedLocally] = useState(false);

  const pathname = usePathname();
  const title = TITLES[pathname || ''] || 'POS';

  // Only OWNER/ADMIN can complete setup (PATCH /stores/me is rbac-gated to
  // them) — a cashier/kitchen login on a fresh store shouldn't be shown a
  // wizard they can't actually finish.
  const canOnboard = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
    enabled: !!user && canOnboard,
  });
  const showOnboarding = canOnboard && !!store && !store.onboardingCompletedAt && !dismissedLocally;

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
      <OnboardingWizard open={showOnboarding} onClose={() => setDismissedLocally(true)} />
    </div>
  );
}
