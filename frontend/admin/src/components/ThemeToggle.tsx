'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/stores/themeStore';
import { useEffect, useState } from 'react';

export default function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  /** Mirrors <html class="dark"> after ThemeInitScript + zustand rehydrate */
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const sync = () => setIsDark(document.documentElement.classList.contains('dark'));
    sync();
    const unsub = useThemeStore.subscribe((s) => {
      setIsDark(s.theme === 'dark');
    });
    return unsub;
  }, []);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      suppressHydrationWarning
      className={cn(
        'flex items-center justify-center w-9 h-9 rounded-md border transition-fast shrink-0',
        'border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-hover',
        className,
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
