'use client';

import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'glass' | 'skeu' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const cardVariants = {
  glass: 'glass-card rounded-xl',
  skeu: 'skeu-surface rounded-xl',
  flat: 'bg-bg-secondary border border-border-primary rounded-xl',
};

const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' };

export function Card({ children, className, variant = 'glass', padding = 'md' }: CardProps) {
  return (
    <div className={clsx(cardVariants[variant], paddings[padding], 'relative', className)}>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function StatCard({ label, value, subValue, trend, className }: StatCardProps) {
  return (
    <Card variant="glass" className={clsx('noise-texture overflow-hidden', className)}>
      <div className="relative z-10">
        <div className="text-xs text-text-secondary mb-1.5">{label}</div>
        <div className={clsx(
          'text-xl font-bold tabular-nums font-mono',
          trend === 'up' ? 'text-buy' : trend === 'down' ? 'text-sell' : 'text-text-primary'
        )}>
          {value}
        </div>
        {subValue && <div className="text-xxs text-text-tertiary mt-1">{subValue}</div>}
      </div>
    </Card>
  );
}
