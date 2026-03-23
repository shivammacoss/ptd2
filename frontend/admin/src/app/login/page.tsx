'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuthRehydrated } from '@/hooks/useAuthRehydrated';

export default function LoginPage() {
  const router = useRouter();
  const { login, checkAuth } = useAuthStore();
  const authRehydrated = useAuthRehydrated();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authRehydrated) return;
    if (checkAuth()) router.replace('/dashboard');
  }, [authRehydrated, checkAuth, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err: any) {
      const msg = err?.message || 'Login failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!authRehydrated) {
    return (
      <div className="relative min-h-screen bg-bg-primary flex items-center justify-center p-4">
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-buy mb-4">
            <span className="text-white text-xl font-bold">P</span>
          </div>
          <h1 className="text-xl font-bold text-text-primary">ProTrader Admin</h1>
          <p className="text-xs text-text-tertiary mt-1">Broker Administration Panel</p>
        </div>

        {/* Login Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-bg-secondary border border-border-primary rounded-lg p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary font-medium">Email</label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@protrader.com"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-bg-input border border-border-primary rounded-md focus:border-buy transition-fast"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary font-medium">Password</label>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-bg-input border border-border-primary rounded-md focus:border-buy transition-fast"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-sell bg-sell/10 border border-sell/20 rounded-md px-3 py-2">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-2.5 text-sm font-medium rounded-md transition-fast',
              'bg-buy text-white hover:bg-buy-light disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="text-center text-xxs text-text-tertiary mt-6">
          ProTrader Admin v1.0 &middot; Secure Access Only
        </p>
      </div>
    </div>
  );
}
