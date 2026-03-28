'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Impersonation landing page — opened by the admin panel in a new tab.
 *
 * Root cause of old bug:
 *   The page wrote to localStorage['token'] (the raw api-client key) but the
 *   Zustand authStore is persisted under localStorage['protrader-auth'].
 *   AuthProvider read the Zustand store (token: null) and redirected to /auth/login.
 *
 * Fix:
 *   1. Write the impersonation JWT directly into localStorage['protrader-auth']
 *      (the Zustand persist key) so it wins over any previous session.
 *   2. Force a full-page reload to /trading so Zustand rehydrates cleanly with
 *      the new token — eliminates any AuthProvider race with in-memory state.
 */
export default function ImpersonatePage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      window.location.replace('/auth/login');
      return;
    }

    try {
      // Overwrite the Zustand persisted state with the impersonation token.
      // Setting isAuthenticated: false + isInitialized: false ensures AuthProvider
      // will show the spinner and call loadUser(), which validates the token via
      // GET /auth/me and sets isAuthenticated: true before rendering the app.
      const freshState = {
        state: {
          user: null,
          token,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: false,
        },
        version: 0,
      };
      localStorage.setItem('protrader-auth', JSON.stringify(freshState));
    } catch {
      setError('Could not write session data. Check browser storage permissions.');
      return;
    }

    // Full-page replace — Zustand rehydrates from scratch with the new token.
    // client-side router.replace() would keep stale in-memory store state.
    window.location.replace('/trading');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <div className="text-center space-y-4">
        {error ? (
          <>
            <p className="text-sell text-sm font-medium">{error}</p>
            <button
              onClick={() => window.location.replace('/auth/login')}
              className="text-xs text-text-tertiary underline"
            >
              Go to Login
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-2 border-buy border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-text-tertiary text-sm">Logging in as user…</p>
          </>
        )}
      </div>
    </div>
  );
}
