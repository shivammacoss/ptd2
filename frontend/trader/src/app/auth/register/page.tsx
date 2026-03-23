'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isLoading } = useAuthStore();
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    first_name: '', last_name: '', phone: '', referral_code: '',
  });

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setForm(prev => ({ ...prev, referral_code: ref }));
  }, [searchParams]);
  const [step, setStep] = useState(1);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 1) {
      if (!form.first_name || !form.last_name || !form.email) {
        toast.error('Please fill all required fields');
        return;
      }
      setStep(2);
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    try {
      await register({
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || undefined,
        referral_code: form.referral_code || undefined,
      });
      toast.success('Account created successfully!');
      router.push('/trading');
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    }
  };

  return (
    <div className="auth-page min-h-screen relative overflow-hidden bg-bg-primary">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[200px] -right-[300px] w-[600px] h-[600px] rounded-full bg-buy/[0.04] blur-[120px] animate-float" />
        <div className="absolute -bottom-[300px] -left-[200px] w-[700px] h-[700px] rounded-full bg-accent/[0.03] blur-[120px] animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-sell/[0.02] blur-[100px] animate-float" style={{ animationDelay: '4s' }} />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[440px]">
          {/* Logo */}
          <div className="mb-8">
            <Image src="/logo.png" alt="Logo" width={48} height={48} className="rounded-xl" />
          </div>

          {/* Glass form card */}
          <div className="glass-panel rounded-3xl p-8 noise-texture overflow-hidden">
            <div className="relative z-10">
              {/* Step indicator */}
              <div className="flex items-center gap-3 mb-8">
                <div className="flex items-center gap-2 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    step >= 1 ? 'skeu-btn-buy text-text-inverse' : 'glass-light text-text-tertiary'
                  }`}>1</div>
                  <div className={`h-[2px] flex-1 rounded ${step >= 2 ? 'bg-buy' : 'bg-border-primary'}`} />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    step >= 2 ? 'skeu-btn-buy text-text-inverse' : 'glass-light text-text-tertiary'
                  }`}>2</div>
                </div>
              </div>

              <div className="mb-6">
                <h2 className="text-xl font-bold text-text-primary">
                  {step === 1 ? 'Personal Details' : 'Set Password'}
                </h2>
                <p className="text-xs text-text-tertiary mt-1">
                  {step === 1 ? 'Tell us about yourself' : 'Secure your account'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {step === 1 ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="First Name"
                        type="text"
                        required
                        value={form.first_name}
                        onChange={(e) => update('first_name', e.target.value)}
                        placeholder="John"
                      />
                      <Input
                        label="Last Name"
                        type="text"
                        required
                        value={form.last_name}
                        onChange={(e) => update('last_name', e.target.value)}
                        placeholder="Doe"
                      />
                    </div>

                    <Input
                      label="Email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      placeholder="you@example.com"
                      icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      }
                    />

                    <Input
                      label="Phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      placeholder="+91 9876543210 (optional)"
                    />

                    <Input
                      label="Referral Code"
                      type="text"
                      value={form.referral_code}
                      onChange={(e) => update('referral_code', e.target.value)}
                      placeholder="Optional"
                    />

                    <Button type="submit" variant="primary" size="xl" fullWidth>
                      Continue
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      label="Password"
                      type="password"
                      required
                      value={form.password}
                      onChange={(e) => update('password', e.target.value)}
                      placeholder="Min 8 characters"
                      icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      }
                    />

                    {/* Password strength indicator */}
                    {form.password && (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => {
                          const strength = form.password.length >= 12 ? 4 : form.password.length >= 10 ? 3 : form.password.length >= 8 ? 2 : 1;
                          const colors = ['bg-sell', 'bg-warning', 'bg-buy', 'bg-success'];
                          return (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                              i <= strength ? colors[strength - 1] : 'bg-border-primary'
                            }`} />
                          );
                        })}
                      </div>
                    )}

                    <Input
                      label="Confirm Password"
                      type="password"
                      required
                      value={form.confirmPassword}
                      onChange={(e) => update('confirmPassword', e.target.value)}
                      placeholder="Re-enter password"
                      error={form.confirmPassword && form.password !== form.confirmPassword ? 'Passwords do not match' : undefined}
                    />

                    <div className="flex gap-3">
                      <Button type="button" variant="outline" size="xl" onClick={() => setStep(1)} className="flex-1">
                        Back
                      </Button>
                      <Button type="submit" variant="primary" size="xl" loading={isLoading} className="flex-[2]">
                        Create Account
                      </Button>
                    </div>
                  </>
                )}
              </form>

              <div className="emboss-divider my-6" />

              <p className="text-center text-xs text-text-tertiary">
                Already have an account?{' '}
                <Link href="/auth/login" className="text-buy hover:text-buy-light transition-fast font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xxs text-text-tertiary mt-6 px-4">
            By creating an account you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
