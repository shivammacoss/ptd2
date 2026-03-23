'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from './AdminSidebar';
import { useAuthStore } from '@/stores/authStore';
import { Search, User, LogOut, Loader2 } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuthRehydrated } from '@/hooks/useAuthRehydrated';

type Gate = 'boot' | 'ready' | 'redirect';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const admin = useAuthStore((s) => s.admin);
  const token = useAuthStore((s) => s.token);
  const authRehydrated = useAuthRehydrated();
  const [mounted, setMounted] = useState(false);
  const [gate, setGate] = useState<Gate>('boot');
  const runId = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !authRehydrated) {
      setGate('boot');
      return;
    }

    const id = ++runId.current;

    const finish = (next: Gate) => {
      if (runId.current !== id) return;
      setGate(next);
    };

    const run = async () => {
      const { checkAuth, refreshAdminProfile } = useAuthStore.getState();

      if (!checkAuth()) {
        finish('redirect');
        router.replace('/login');
        return;
      }

      if (useAuthStore.getState().admin) {
        finish('ready');
        return;
      }

      const ok = await Promise.race([
        refreshAdminProfile(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15000)),
      ]);

      if (runId.current !== id) return;

      if (!ok) {
        finish('redirect');
        router.replace('/login');
        return;
      }
      finish('ready');
    };

    void run();

    return () => {
      runId.current += 1;
    };
  }, [mounted, authRehydrated, admin, token, router]);

  if (!mounted || !authRehydrated || gate !== 'ready') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-primary">
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center h-12 px-4 bg-bg-secondary border-b border-border-primary">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search users, trades..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg-input border border-border-primary rounded-sm"
            />
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary">
              <User size={14} />
              <span>{admin?.full_name || 'Admin'}</span>
              <span className="text-xxs text-text-tertiary px-1.5 py-0.5 bg-bg-tertiary rounded-sm">
                {admin?.role || 'admin'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => useAuthStore.getState().logout()}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-tertiary hover:text-sell transition-fast rounded-sm hover:bg-bg-hover"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
