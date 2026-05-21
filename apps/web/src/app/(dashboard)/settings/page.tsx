'use client';
import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useAuth } from '@/stores/auth.store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StoreSettingsForm } from '@/components/settings/StoreSettingsForm';
import { CategoriesManager } from '@/components/settings/CategoriesManager';
import { PromotionsManager } from '@/components/settings/PromotionsManager';
import { SmsWebhookSetup } from '@/components/settings/SmsWebhookSetup';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const canEditStore = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg sm:text-xl font-bold">Settings</h2>
        {canEditStore && (
          <Button onClick={() => setWizardOpen(true)} variant="outline">
            <Wand2 className="w-4 h-4 mr-1" /> Setup Wizard
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{user?.name}</span>
          </div>
          <div className="flex justify-between py-2 border-t border-border">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between py-2 border-t border-border">
            <span className="text-muted-foreground">Role</span>
            <Badge>{user?.role}</Badge>
          </div>
        </CardContent>
      </Card>

      {canEditStore && <CategoriesManager />}
      {canEditStore && <PromotionsManager />}
      {canEditStore && <SmsWebhookSetup />}

      {canEditStore ? (
        <StoreSettingsForm />
      ) : (
        <Card>
          <CardContent className="text-muted-foreground text-sm py-6">
            * Only OWNER or ADMIN can edit store information
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>System</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div>Version: 1.2.0</div>
          <div>API: {process.env.NEXT_PUBLIC_API_URL}</div>
        </CardContent>
      </Card>

      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
