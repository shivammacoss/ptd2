'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, usePathname } from 'next/navigation';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isInitialized, isAuthenticated, loadUser, token } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const hasLoaded = useRef(false);

  useEffect(() => {
    // Only load the user once on startup
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      loadUser();
    }
  }, [loadUser]);

  useEffect(() => {
    // Once auth is checked/initialized, handle redirects
    if (isInitialized) {
      const isAuthPage = pathname?.startsWith('/auth');
      const isPublic = pathname === '/' || pathname === '/privacy' || pathname === '/terms' || pathname === '/risk' || pathname === '/about' || pathname === '/contact' || pathname === '/platforms' || pathname === '/white-label';

      if (!isAuthenticated && !isAuthPage && !isPublic) {
        router.push('/auth/login');
      } else if (isAuthenticated && (isAuthPage || pathname === '/')) {
        router.push('/trading');
      }
    }
  }, [isInitialized, isAuthenticated, pathname, router]);

  // Optionally: show a loading screen while initializing to avoid UI flickering
  if (!isInitialized) {
    return (
      <div className="flex flex-col h-[100dvh] items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-text-tertiary uppercase tracking-widest">Initializing...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
