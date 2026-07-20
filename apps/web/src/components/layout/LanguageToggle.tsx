'use client';
import { Languages } from 'lucide-react';
import { useLangStore, useT } from '@/lib/i18n';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

/** Row inside the Topbar user menu — switches ภาษาไทย / English. */
export function LanguageToggle() {
  const lang = useLangStore((s) => s.lang);
  const toggle = useLangStore((s) => s.toggle);
  const t = useT();

  return (
    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
      <Languages className="w-4 h-4 shrink-0" />
      <span className="flex-1">{t('topbar.language')}</span>
      <span className="text-xs font-semibold tabular-nums text-muted-foreground">
        {lang === 'th' ? 'ไทย' : 'EN'}
      </span>
    </DropdownMenuItem>
  );
}
