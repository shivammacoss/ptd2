'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { wsManager, ConnectionStatus } from '@/lib/ws/wsManager';
import { useAuthStore } from '@/stores/authStore';
import { NotificationBell } from '@/components/NotificationListener';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Trading', href: '/trading' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'Wallet', href: '/wallet' },
  { label: 'Social', href: '/social' },
  { label: 'Business', href: '/business' },
];

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('disconnected');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = wsManager.onStatusChange(setWsStatus);
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    if (showMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  const initials = user
    ? (user.first_name?.[0] && user.last_name?.[0]
      ? `${user.first_name[0]}${user.last_name[0]}`
      : user.first_name?.[0] || user.email?.[0] || 'U'
    ).toUpperCase()
    : 'U';

  const statusColor = wsStatus === 'connected' ? 'bg-success' : wsStatus === 'connecting' ? 'bg-warning' : 'bg-sell';

  return (
    <div className="h-20 flex items-center px-5 select-none shrink-0 relative bg-bg-primary border-b border-border-glass">
      {/* Left — Brand logo, wide wordmark, big and proud */}
      <Link href="/dashboard" className="shrink-0 z-10">
        <Image
          src="/logo.png"
          alt="Logo"
          width={360}
          height={100}
          className="object-contain"
          style={{ height: 70, width: 'auto' }}
          priority
        />
      </Link>

      {/* Center — Curved pill nav */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <nav className="flex items-center gap-0.5 glass-card rounded-full px-1.5 py-1">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                pathname === item.href || (item.href === '/trading' && pathname === '/trading')
                  ? 'skeu-btn-buy text-text-inverse'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/60'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Right — Toggle + Status + Profile */}
      <div className="ml-auto flex items-center gap-3 shrink-0 z-10">
        <ThemeToggle compact />
        <div className={`w-2 h-2 rounded-full ${statusColor}`} title={wsStatus} />
        <NotificationBell />
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(v => !v)}
            className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-xs font-bold text-text-secondary hover:text-text-primary transition-fast"
          >
            {initials}
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 py-1 rounded-lg border border-border-glass bg-bg-secondary shadow-lg z-50">
              {user && (
                <div className="px-3 py-2 border-b border-border-glass">
                  <p className="text-xs font-medium text-text-primary truncate">{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-text-tertiary truncate">{user.email}</p>
                </div>
              )}
              <Link
                href="/profile"
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Profile
              </Link>
              <Link
                href="/wallet"
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>
                Wallet
              </Link>
              <div className="border-t border-border-glass my-1" />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-sell hover:bg-sell/10 transition-fast"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
