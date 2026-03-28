'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useUIStore } from '@/stores/uiStore';

const NAV_ITEMS = [
  {
    label: 'Home',
    href: '/',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: 'Market',
    href: '/trading?view=watchlist',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
  },
  {
    label: 'Trade',
    href: '/trading?view=order',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    label: 'Chart',
    href: '/trading?view=chart',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 12l4-4 4 4 6-6" />
      </svg>
    ),
  },
];

const MORE_MENU_ITEMS = [
  { 
    name: 'Wallet', 
    path: '/wallet',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
  },
  { 
    name: 'Copy Trade', 
    path: '/social',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
  },
  { 
    name: 'IB Program', 
    path: '/business',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  },
  { 
    name: 'Profile', 
    path: '/profile',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  },
  { 
    name: 'Support', 
    path: '/support',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, toggleTheme } = useUIStore();
  const [showMore, setShowMore] = useState(false);

  // Hide on auth and public landing/legal pages
  const isPublicPage = pathname === '/' || pathname === '/privacy' || pathname === '/terms' || pathname === '/risk' || pathname === '/about' || pathname === '/contact' || pathname === '/platforms' || pathname === '/white-label';
  if (pathname?.startsWith('/auth') || isPublicPage) return null;

  const handleLogout = () => {
    toast.success('Logged out successfully!');
    setShowMore(false);
  };

  const currentView = searchParams.get('view') || (pathname === '/trading' ? 'watchlist' : '');

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-bg-primary border-t border-border-glass pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] transition-colors duration-300">
        <div className="flex items-stretch justify-around h-14">
          {NAV_ITEMS.map((item) => {
            const itemUrl = new URL(item.href, 'http://localhost');
            const itemView = itemUrl.searchParams.get('view');
            const isActive = itemView 
              ? (pathname === '/trading' && currentView === itemView)
              : (pathname === item.href);

            return (
              <Link
                key={item.label}
                href={item.href}
                className={clsx(
                  'flex flex-1 flex-col items-center justify-center gap-1 transition-all duration-200 outline-none',
                  isActive ? 'text-primary' : 'text-text-tertiary hover:text-text-primary'
                )}
              >
                <div className={clsx('transition-all duration-300', isActive && 'scale-110 -translate-y-0.5')}>
                  {item.icon}
                </div>
                <span className={clsx(
                  'text-[10px] font-bold tracking-tight transition-colors',
                  isActive ? 'text-primary font-extrabold' : 'text-text-tertiary'
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          
          <button
            onClick={() => setShowMore(true)}
            className={clsx(
              'flex flex-1 flex-col items-center justify-center gap-1 transition-all duration-200 outline-none',
              showMore ? 'text-primary' : 'text-text-tertiary hover:text-text-primary'
            )}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
            <span className="text-[10px] font-bold tracking-tight">More</span>
          </button>
        </div>
      </nav>

      {/* More Menu Overlay */}
      {showMore && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setShowMore(false)}
          />
          
          <div className="absolute bottom-0 left-0 right-0 bg-bg-secondary rounded-t-[32px] border-t border-border-glass animate-in slide-in-from-bottom duration-300 shadow-2xl">
            {/* Header with Exit Cross */}
            <div className="flex items-center justify-between px-6 pt-3 pb-4">
              <div className="w-8 h-1.5 bg-border-glass rounded-full opacity-10 absolute left-1/2 -translate-x-1/2 top-3" />
              <div className="w-10" /> {/* Spacer */}
              <h3 className="text-text-primary font-extrabold text-xl tracking-tight">Features</h3>
              <button 
                onClick={() => setShowMore(false)}
                className="w-10 h-10 flex items-center justify-center bg-bg-primary/50 border border-border-glass rounded-full text-text-primary hover:bg-buy/20 transition-all active:scale-90"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="px-6 pb-12 overflow-y-auto max-h-[85vh]">
              {/* Feature Grid */}
              <div className="grid gap-2 mb-3">
                {MORE_MENU_ITEMS.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      router.push(item.path);
                      setShowMore(false);
                    }}
                    className="flex items-center justify-between p-4 rounded-2xl bg-bg-primary/40 hover:bg-bg-primary/60 border border-border-glass transition-all group active:scale-[0.98] outline-none"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#2563EB]/10 rounded-full flex items-center justify-center text-[#2563EB] group-hover:scale-110 transition-transform">
                        {item.icon}
                      </div>
                      <span className="text-text-primary font-bold">{item.name}</span>
                    </div>
                    <svg className="text-text-tertiary/40 group-hover:text-text-primary transition-colors" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                ))}
              </div>

              {/* Theme Toggle - NEW POSITION (LAST BEFORE LOGOUT) */}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-between w-full p-4 mb-3 rounded-2xl bg-bg-primary border border-border-glass active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                    {theme === 'dark' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m0-12.728.707.707m11.314 11.314.707.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    )}
                  </div>
                  <div className="text-left">
                    <span className="text-text-primary font-bold block">Theme Mode</span>
                    <span className="text-text-tertiary text-[10px] sm:text-xs">Switch to {theme === 'dark' ? 'Light' : 'Dark'} mode</span>
                  </div>
                </div>
                <div className={clsx(
                  'w-12 h-6 rounded-full p-1 transition-colors duration-300',
                  theme === 'dark' ? 'bg-primary' : 'bg-text-tertiary/20'
                )}>
                  <div className={clsx(
                    'w-4 h-4 bg-white rounded-full transition-transform duration-300',
                    theme === 'dark' ? 'translate-x-6' : 'translate-x-0'
                  )} />
                </div>
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center justify-between w-full p-4 rounded-2xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-all group active:scale-[0.98] outline-none mb-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  </div>
                  <span className="text-red-500 font-bold">Log Out</span>
                </div>
              </button>

              <button
                onClick={() => setShowMore(false)}
                className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-bg-primary border border-border-glass text-text-primary font-black shadow-sm transition-all group active:scale-[0.95] outline-none"
              >
                <span>BACK TO TRADING</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
