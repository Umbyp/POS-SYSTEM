'use client';
import { Languages } from 'lucide-react';
import { useLangStore } from '@/lib/i18n';

export function LanguageToggle() {
  const lang = useLangStore((s) => s.lang);
  const toggle = useLangStore((s) => s.toggle);

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1 px-2 h-9 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors active:scale-95"
      title={lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
      aria-label="Toggle language"
    >
      <Languages className="w-4 h-4" />
      <span className="text-xs font-semibold tabular-nums">{lang === 'th' ? 'ไทย' : 'EN'}</span>
    </button>
  );
}
