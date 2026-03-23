'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [need2FA, setNeed2FA] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please fill all fields'); return; }
    try {
      await login(email, password, totpCode || undefined);
      toast.success('Welcome back!');
      router.push('/trading');
    } catch (err: any) {
      if (err.message?.includes('2FA')) {
        setNeed2FA(true);
      } else {
        toast.error(err.message || 'Login failed');
      }
    }
  };

  return (
    <div className="auth-page min-h-screen relative overflow-hidden bg-bg-primary">
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[300px] -left-[200px] w-[600px] h-[600px] rounded-full bg-buy/[0.04] blur-[120px] animate-float" />
        <div className="absolute -bottom-[200px] -right-[300px] w-[700px] h-[700px] rounded-full bg-sell/[0.03] blur-[120px] animate-float" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent/[0.02] blur-[100px] animate-float" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">
        {/* Left Panel — Brand showcase (hidden on mobile) */}
        <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center p-12">
          <div className="max-w-xl w-full">
            {/* Logo */}
            <div className="mb-12">
              <Image src="/logo.png" alt="Logo" width={160} height={160} priority className="rounded-2xl"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>

            <h1 className="text-3xl font-extrabold text-text-primary mb-4 leading-tight">
              Trade Global Markets<br />
              <span className="text-buy">With Precision</span>
            </h1>
            <p className="text-md text-text-secondary mb-10 leading-relaxed max-w-md">
              Access forex, commodities, indices, and crypto CFDs with ultra-fast execution and professional tools.
            </p>

            {/* Glass stat cards */}
            <div className="grid grid-cols-3 gap-4 mb-10">
              {[
                { value: '200+', label: 'Instruments', icon: '◈' },
                { value: '1:500', label: 'Leverage', icon: '⚡' },
                { value: '<50ms', label: 'Execution', icon: '◉' },
              ].map((s) => (
                <div key={s.label} className="glass-card rounded-2xl p-4 noise-texture overflow-hidden group hover:border-buy/20 transition-all duration-300">
                  <div className="relative z-10">
                    <div className="text-xxs text-text-tertiary mb-2">{s.icon}</div>
                    <div className="text-lg font-bold text-text-primary tabular-nums">{s.value}</div>
                    <div className="text-xxs text-text-tertiary mt-0.5">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Decorative glass chart widget */}
            <div className="glass-panel rounded-2xl p-5 noise-texture overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-buy animate-pulse" />
                    <span className="text-xs text-text-secondary">EURUSD</span>
                  </div>
                  <span className="text-xs text-buy font-mono tabular-nums">1.08465</span>
                </div>
                <svg viewBox="0 0 400 80" className="w-full" fill="none">
                  <path d="M0 65 Q30 50 60 55 Q90 60 120 40 Q150 20 180 35 Q210 50 240 30 Q270 10 300 25 Q330 40 360 20 Q390 5 400 15"
                    stroke="#2962FF" strokeWidth="2" strokeLinecap="round" />
                  <path d="M0 65 Q30 50 60 55 Q90 60 120 40 Q150 20 180 35 Q210 50 240 30 Q270 10 300 25 Q330 40 360 20 Q390 5 400 15 V80 H0 Z"
                    fill="url(#chartGrad)" />
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2962FF" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#2962FF" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="flex justify-between mt-2 text-xxs text-text-tertiary font-mono">
                  <span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>21:00</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel — Login Form */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 lg:px-12">
          <div className="w-full max-w-[400px]">
            {/* Mobile logo */}
          <div className="lg:hidden mb-10">
            <Image src="/logo.png" alt="Logo" width={120} height={120} className="rounded-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>

            {/* Glass form card */}
            <div className="glass-panel rounded-3xl p-8 noise-texture overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">Sign in</h2>
                    <p className="text-xs text-text-tertiary mt-1">Access your trading account</p>
                  </div>
                  <Link
                    href="/auth/register"
                    className="text-xxs text-buy hover:text-buy-light transition-fast px-3 py-1.5 rounded-lg glass-light"
                  >
                    Create account
                  </Link>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <Input
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    icon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    }
                  />

                  <div>
                    <Input
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      }
                      suffix={
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-text-tertiary hover:text-text-secondary transition-fast">
                          {showPassword ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          )}
                        </button>
                      }
                    />
                    <div className="flex justify-end mt-1.5">
                      <button type="button" className="text-xxs text-text-tertiary hover:text-buy transition-fast">
                        Forgot password?
                      </button>
                    </div>
                  </div>

                  {need2FA && (
                    <Input
                      label="2FA Code"
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="000000"
                      maxLength={6}
                      className="tracking-[0.5em] text-center font-mono text-lg"
                    />
                  )}

                  <Button type="submit" variant="primary" size="xl" fullWidth loading={isLoading}>
                    Start trading
                  </Button>
                </form>

                {/* Divider */}
                <div className="emboss-divider my-6" />

                {/* Demo account */}
                <button
                  onClick={() => { setEmail('demo@protrader.com'); setPassword('demo123'); }}
                  className="w-full py-3 text-xs text-text-tertiary hover:text-text-secondary glass-light rounded-xl transition-all duration-150 hover:border-border-glass-bright skeu-btn"
                >
                  Try with Demo Account
                </button>
              </div>
            </div>

            <p className="text-center text-xxs text-text-tertiary mt-6 px-4">
              By signing in you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
