'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Theme = 'light' | 'dark';

/** Read the theme the inline bootstrap script (in RootLayout) already applied. */
function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeToggle() {
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

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors active:scale-95"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      {/* Avoid a hydration mismatch flash: render neutral until mounted */}
      <span className="block w-4 h-4" aria-hidden>
        {mounted && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isDark ? 'moon' : 'sun'}
              initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="block"
            >
              {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </motion.span>
          </AnimatePresence>
        )}
      </span>
    </button>
  );
}
