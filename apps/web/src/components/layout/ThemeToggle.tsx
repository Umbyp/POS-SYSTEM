'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

type Theme = 'light' | 'dark';

/** Read the theme the inline bootstrap script (in RootLayout) already applied. */
function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** Row inside the Topbar user menu — toggles the `.dark` class on <html> and persists it. */
export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Sync from the DOM after mount (the bootstrap script sets it pre-paint).
  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    // Enable transitions only for the flip, then remove so page loads stay snappy.
    root.classList.add('theme-transition');
    root.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode / storage blocked — ignore */
    }
    setTheme(next);
    window.setTimeout(() => root.classList.remove('theme-transition'), 300);
  };

  const isDark = mounted && theme === 'dark';

  return (
    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
      {isDark ? <Moon className="w-4 h-4 shrink-0" /> : <Sun className="w-4 h-4 shrink-0" />}
      <span className="flex-1">{isDark ? t('topbar.theme.light') : t('topbar.theme.dark')}</span>
    </DropdownMenuItem>
  );
}
