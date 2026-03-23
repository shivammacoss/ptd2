# Layout Components (Trader App)

## Root Layout

**File:** `frontend/trader/src/app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'ProTrader — Forex CFD Trading Platform',
  description: 'Professional forex and CFD trading platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e2130',
              color: '#e4e4e7',
              border: '1px solid #2a2d3e',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  )
}
```

## Dashboard Header (inline in dashboard/page.tsx)

No separate header component. The dashboard page has an inline header:

```tsx
<header className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg-secondary">
  <div className="flex items-center gap-4">
    <h1 className="text-xl font-bold text-text-primary">ProTrader</h1>
    <nav className="flex gap-1 ml-6">
      {[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Trading', href: '/trading' },
        { label: 'Wallet', href: '/wallet' },
        { label: 'Portfolio', href: '/portfolio' },
        { label: 'Social', href: '/social' },
        { label: 'Algo', href: '/algo' },
      ].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  </div>
  <div className="flex items-center gap-3">
    <span className="text-sm text-text-muted">{user?.email || 'demo@protrader.com'}</span>
    <Link
      href="/profile"
      className="px-3 py-1.5 text-sm bg-bg-tertiary text-text-primary rounded hover:bg-bg-hover transition"
    >
      Profile
    </Link>
  </div>
</header>
```

## AccountBar (Trading Page Top Bar)

**File:** `frontend/trader/src/components/trading/AccountBar.tsx`

```tsx
'use client';

import { useTradingStore } from '@/stores/tradingStore';

export default function AccountBar() {
  const { activeAccount, positions } = useTradingStore();

  if (!activeAccount) {
    return (
      <div className="flex items-center h-8 px-4 bg-bg-secondary border-b border-border text-xs text-text-muted">
        No account selected
      </div>
    );
  }

  const totalPnl = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
  const equity = activeAccount.balance + activeAccount.credit + totalPnl;

  const items = [
    { label: 'Balance', value: `$${activeAccount.balance.toFixed(2)}` },
    { label: 'Equity', value: `$${equity.toFixed(2)}`, color: equity >= activeAccount.balance ? 'text-buy' : 'text-sell' },
    { label: 'Margin', value: `$${activeAccount.margin_used.toFixed(2)}` },
    { label: 'Free Margin', value: `$${(equity - activeAccount.margin_used).toFixed(2)}` },
    { label: 'Margin Level', value: activeAccount.margin_used > 0 ? `${((equity / activeAccount.margin_used) * 100).toFixed(1)}%` : '--' },
    { label: 'P&L', value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? 'text-buy' : 'text-sell' },
    { label: 'Leverage', value: `1:${activeAccount.leverage}` },
  ];

  return (
    <div className="flex items-center h-8 px-4 bg-bg-secondary border-b border-border gap-6">
      <div className="flex items-center gap-1">
        <span className="text-xs text-text-muted">Account:</span>
        <span className="text-xs font-medium text-text-primary">{activeAccount.account_number}</span>
        {activeAccount.is_demo && (
          <span className="px-1.5 py-0.5 text-[9px] bg-accent/20 text-accent rounded">DEMO</span>
        )}
      </div>

      {items.map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">{label}:</span>
          <span className={`text-xs font-mono ${color || 'text-text-primary'}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}
```

## Notes

- No shared sidebar, footer, or nav component
- Dashboard has inline header with top nav
- Trading page has AccountBar as top bar (thin 32px strip)
- No app-wide layout wrapper — each page manages its own layout
