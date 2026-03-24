'use client';

import { useUIStore } from '@/stores/uiStore';

export function ThemeToggle({ compact: _compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useUIStore();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="relative flex items-center self-center gap-0.5 sm:gap-1.5 skeu-btn rounded-full transition-all duration-300 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 justify-center px-1 sm:px-2"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {/* Sun */}
      <span className={`text-xs sm:text-sm transition-all duration-300 shrink-0 ${isDark ? 'opacity-40 scale-75' : 'opacity-100 scale-100'}`}>
        ☀️
      </span>

      {/* Toggle track — light mode: thin black border */}
      <div className={`w-7 h-3.5 sm:w-8 sm:h-4 rounded-full relative transition-colors duration-300 shrink-0 ${
        isDark ? 'bg-border-secondary border border-border-glass' : 'bg-black/10 border border-black'
      }`}>
        <div className={`absolute top-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all duration-300 ${
          isDark ? 'left-0.5 bg-text-tertiary' : 'left-[16px] sm:left-[18px] bg-black'
        }`} />
      </div>

      {/* Moon */}
      <span className={`text-xs sm:text-sm transition-all duration-300 shrink-0 ${isDark ? 'opacity-100 scale-100' : 'opacity-40 scale-75'}`}>
        🌙
      </span>
    </button>
  );
}
