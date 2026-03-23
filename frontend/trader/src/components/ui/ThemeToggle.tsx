'use client';

import { useUIStore } from '@/stores/uiStore';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useUIStore();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center gap-1.5 skeu-btn rounded-full transition-all duration-300"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{ padding: compact ? '4px' : '4px 8px' }}
    >
      {/* Sun */}
      <span className={`text-sm transition-all duration-300 ${isDark ? 'opacity-40 scale-75' : 'opacity-100 scale-100'}`}>
        ☀️
      </span>

      {/* Toggle track — light mode: thin black border */}
      <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${
        isDark ? 'bg-border-secondary border border-border-glass' : 'bg-black/10 border border-black'
      }`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-300 ${
          isDark ? 'left-0.5 bg-text-tertiary' : 'left-[18px] bg-black'
        }`} />
      </div>

      {/* Moon */}
      <span className={`text-sm transition-all duration-300 ${isDark ? 'opacity-100 scale-100' : 'opacity-40 scale-75'}`}>
        🌙
      </span>
    </button>
  );
}
