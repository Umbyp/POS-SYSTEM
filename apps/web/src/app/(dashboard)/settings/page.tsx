'use client';
import { useState } from 'react';
import {
  Wand2,
  User,
  Building2,
  Receipt,
  Wallet,
  FolderTree,
  Tag,
  Target,
  Info,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/stores/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StoreSettingsForm } from '@/components/settings/StoreSettingsForm';
import { CategoriesManager } from '@/components/settings/CategoriesManager';
import { OptionGroupsManager } from '@/components/settings/OptionGroupsManager';
import { PromotionsManager } from '@/components/settings/PromotionsManager';
import { SmsWebhookSetup } from '@/components/settings/SmsWebhookSetup';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useT } from '@/lib/i18n';

type SectionKey =
  | 'profile'
  | 'store'
  | 'tax'
  | 'payment'
  | 'categories'
  | 'options'
  | 'promotions'
  | 'goals'
  | 'system';

interface SectionDef {
  key: SectionKey;
  labelKey: string;
  descKey: string;
  icon: any;
  ownerOnly?: boolean;
}

const SECTIONS: SectionDef[] = [
  { key: 'profile', labelKey: 'settings.section.profile.label', descKey: 'settings.section.profile.desc', icon: User },
  { key: 'store', labelKey: 'settings.section.store.label', descKey: 'settings.section.store.desc', icon: Building2, ownerOnly: true },
  { key: 'tax', labelKey: 'settings.section.tax.label', descKey: 'settings.section.tax.desc', icon: Receipt, ownerOnly: true },
  { key: 'payment', labelKey: 'settings.section.payment.label', descKey: 'settings.section.payment.desc', icon: Wallet, ownerOnly: true },
  { key: 'categories', labelKey: 'settings.section.categories.label', descKey: 'settings.section.categories.desc', icon: FolderTree, ownerOnly: true },
  { key: 'options', labelKey: 'settings.section.options.label', descKey: 'settings.section.options.desc', icon: SlidersHorizontal, ownerOnly: true },
  { key: 'promotions', labelKey: 'settings.section.promotions.label', descKey: 'settings.section.promotions.desc', icon: Tag, ownerOnly: true },
  { key: 'goals', labelKey: 'settings.section.goals.label', descKey: 'settings.section.goals.desc', icon: Target, ownerOnly: true },
  { key: 'system', labelKey: 'settings.section.system.label', descKey: 'settings.section.system.desc', icon: Info },
];

export default function SettingsPage() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const canEditStore = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [section, setSection] = useState<SectionKey>('profile');
  const [wizardOpen, setWizardOpen] = useState(false);

  const visibleSections = SECTIONS.filter((s) => !s.ownerOnly || canEditStore);

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold">{t('settings.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('settings.subtitle')}
          </p>
        </div>
        {canEditStore && (
          <Button onClick={() => setWizardOpen(true)} variant="outline" size="sm">
            <Wand2 className="w-4 h-4 mr-1" /> {t('settings.setupWizard')}
          </Button>
        )}
      </div>

      {/* Mobile section selector */}
      <div className="lg:hidden border-b border-border bg-card">
        <div className="flex gap-1 px-2 py-2 overflow-x-auto scrollbar-thin">
          {visibleSections.map((s) => {
            const Icon = s.icon;
            const active = s.key === section;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(s.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr] overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block border-r border-border bg-muted/20 overflow-y-auto scrollbar-thin">
          <nav className="p-3 space-y-0.5">
            {visibleSections.map((s) => {
              const Icon = s.icon;
              const active = s.key === section;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors group ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-card-hover'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground group-hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className={`font-medium ${active ? 'text-primary' : ''}`}>
                      {t(s.labelKey)}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {t(s.descKey)}
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                      active ? 'translate-x-0.5 text-primary' : 'text-muted-foreground opacity-50'
                    }`}
                  />
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right content */}
        <div className="overflow-y-auto scrollbar-thin">
          <div className="p-4 sm:p-6 max-w-3xl">
            {section === 'profile' && <ProfileSection />}
            {section === 'store' && canEditStore && <StoreSettingsForm sections={['store']} />}
            {section === 'tax' && canEditStore && <StoreSettingsForm sections={['tax']} />}
            {section === 'payment' && canEditStore && (
              <div className="space-y-4">
                <StoreSettingsForm sections={['promptpay']} />
                <SmsWebhookSetup />
              </div>
            )}
            {section === 'categories' && canEditStore && <CategoriesManager />}
            {section === 'options' && canEditStore && <OptionGroupsManager />}
            {section === 'promotions' && canEditStore && <PromotionsManager />}
            {section === 'goals' && canEditStore && <StoreSettingsForm sections={['goals']} />}
            {section === 'system' && <SystemSection />}
            {!canEditStore && SECTIONS.find((s) => s.key === section)?.ownerOnly && (
              <Card>
                <CardContent className="text-muted-foreground text-sm py-6 text-center">
                  {t('settings.ownerOnly')}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function ProfileSection() {
  const t = useT();
  const user = useAuth((s) => s.user);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.myProfile')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between py-2">
          <span className="text-muted-foreground">{t('settings.name')}</span>
          <span className="font-medium">{user?.name}</span>
        </div>
        <div className="flex justify-between py-2 border-t border-border">
          <span className="text-muted-foreground">{t('settings.email')}</span>
          <span className="font-medium">{user?.email}</span>
        </div>
        <div className="flex justify-between py-2 border-t border-border">
          <span className="text-muted-foreground">{t('settings.role')}</span>
          <Badge>{user?.role}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemSection() {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.section.system.label')}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <div className="flex justify-between py-1">
          <span>{t('settings.version')}</span>
          <span className="font-mono text-foreground">1.2.0</span>
        </div>
        <div className="flex justify-between py-1 border-t border-border">
          <span>{t('settings.apiEndpoint')}</span>
          <span className="font-mono text-[11px] text-foreground truncate max-w-[60%]">
            {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}
          </span>
        </div>
        <div className="flex justify-between py-1 border-t border-border">
          <span>{t('settings.analyticsEndpoint')}</span>
          <span className="font-mono text-[11px] text-foreground truncate max-w-[60%]">
            {process.env.NEXT_PUBLIC_ANALYTICS_API || 'http://localhost:8000'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
