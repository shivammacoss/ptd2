'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import TopBar from '@/components/layout/TopBar';
import api, { ApiRequestCancelledError } from '@/lib/api/client';

interface Account {
  id: string;
  account_number: string;
  balance: number;
  credit: number;
  equity: number;
  margin_used: number;
  free_margin: number;
  margin_level: number;
  leverage: number;
  currency: string;
  is_demo: boolean;
}

interface PortfolioSummary {
  total_balance: number;
  total_credit: number;
  total_equity: number;
  total_unrealized_pnl: number;
  pnl_breakdown: {
    today: number;
    this_week: number;
    this_month: number;
    all_time: number;
  };
  holdings: Array<{
    symbol: string;
    side: string;
    lots: number;
    entry_price: number;
    current_price: number;
    pnl: number;
  }>;
  open_positions_count: number;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  position: string;
}

const QUICK_ACTIONS = [
  { label: 'Open Trading', href: '/trading', color: 'skeu-btn-buy text-text-inverse', icon: '▶' },
  { label: 'Deposit Funds', href: '/wallet', color: 'bg-success/20 text-success border border-success/30', icon: '+' },
  { label: 'Portfolio', href: '/portfolio', color: 'bg-info/20 text-info border border-info/30', icon: '◈' },
  { label: 'Copy Trading', href: '/social', color: 'bg-accent/20 text-accent border border-accent/30', icon: '⊕' },
  { label: 'Business / IB', href: '/business', color: 'bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30', icon: '⊗' },
  { label: 'Support', href: '/support', color: 'bg-text-tertiary/20 text-text-secondary border border-text-tertiary/30', icon: '?' },
];

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function emptyPortfolio(): PortfolioSummary {
  return {
    total_balance: 0,
    total_credit: 0,
    total_equity: 0,
    total_unrealized_pnl: 0,
    pnl_breakdown: { today: 0, this_week: 0, this_month: 0, all_time: 0 },
    holdings: [],
    open_positions_count: 0,
  };
}

/** Core dashboard — fail fast enough to show errors; cold Docker still gets 30s. */
const CORE_TIMEOUT_MS = 30_000;
const EXTRAS_TIMEOUT_MS = 20_000;

export default function DashboardPage() {
  const [greeting] = useState(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const loadGen = useRef(0);

  const fetchExtras = useCallback((generation: number, signal?: AbortSignal) => {
    setExtrasLoading(true);
    Promise.allSettled([
      api.get<{ items: Notification[] }>('/notifications', { per_page: '5' }, { timeoutMs: EXTRAS_TIMEOUT_MS, signal }),
      api.get<{ banners: Banner[] }>('/banners', { page: 'dashboard' }, { timeoutMs: EXTRAS_TIMEOUT_MS, signal }),
    ])
      .then((settled) => {
        if (generation !== loadGen.current) return;
        if (settled[0].status === 'fulfilled') {
          setNotifications(settled[0].value.items ?? []);
        }
        if (settled[1].status === 'fulfilled') {
          setBanners(settled[1].value.banners ?? []);
        }
      })
      .finally(() => {
        if (generation === loadGen.current) setExtrasLoading(false);
      });
  }, []);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    const id = ++loadGen.current;
    setLoading(true);
    setError(null);
    setNotifications([]);
    setBanners([]);

    const core = await Promise.allSettled([
      api.get<any>('/accounts', undefined, { timeoutMs: CORE_TIMEOUT_MS, signal }),
      api.get<PortfolioSummary>('/portfolio/summary', undefined, { timeoutMs: CORE_TIMEOUT_MS, signal }),
    ]);

    if (id !== loadGen.current) return;

    const errs: string[] = [];
    let accts: Account[] = [];
    let port: PortfolioSummary | null = null;

    if (core[0].status === 'fulfilled') {
      const acctsRes = core[0].value;
      accts = Array.isArray(acctsRes) ? acctsRes : (acctsRes?.items ?? []);
    } else if (core[0].status === 'rejected' && !(core[0].reason instanceof ApiRequestCancelledError)) {
      errs.push(core[0].reason instanceof Error ? core[0].reason.message : 'Accounts failed');
    }

    if (core[1].status === 'fulfilled') {
      port = core[1].value;
    } else if (core[1].status === 'rejected' && !(core[1].reason instanceof ApiRequestCancelledError)) {
      errs.push(core[1].reason instanceof Error ? core[1].reason.message : 'Portfolio failed');
      port = emptyPortfolio();
    } else if (core[1].status === 'rejected') {
      port = emptyPortfolio();
    }

    setAccounts(accts);
    setPortfolio(port);

    if (errs.length === 2) {
      const msg = errs[0] || 'Failed to load dashboard';
      setError(msg);
      toast.error(msg, { id: 'dashboard-load' });
      setLoading(false);
      return;
    }

    setLoading(false);
    fetchExtras(id, signal);
  }, [fetchExtras]);

  useEffect(() => {
    const ac = new AbortController();
    void fetchData(ac.signal);
    return () => {
      ac.abort();
      loadGen.current += 1;
    };
  }, [fetchData]);

  const primaryAccount = accounts[0];
  const pnlToday = portfolio?.pnl_breakdown?.today ?? 0;

  if (loading) {
    return (
      <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">
        <TopBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-buy border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-text-tertiary">Loading dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">
        <TopBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-sell text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">
      <TopBar />

      <div className="page-main space-y-4 sm:space-y-6">
        {/* Welcome */}
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-text-primary">{greeting}, Trader</h2>
          <p className="text-xs sm:text-sm text-text-tertiary mt-0.5">Here&apos;s your account overview</p>
        </div>

        {/* Banners */}
        {banners.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {banners.map((b) => (
              <a
                key={b.id}
                href={b.link_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 rounded-xl overflow-hidden border border-border-glass hover:border-buy/40 transition-all"
              >
                <img src={b.image_url} alt={b.title} className="h-28 w-auto object-cover" />
              </a>
            ))}
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            label="Balance"
            value={primaryAccount ? fmt(primaryAccount.balance, primaryAccount.currency) : '$0.00'}
            subValue={primaryAccount ? `${primaryAccount.is_demo ? 'Demo' : 'Live'} • ${primaryAccount.account_number}` : '—'}
          />
          <StatCard
            label="Equity"
            value={portfolio ? fmt(portfolio.total_equity) : '$0.00'}
            trend={portfolio && portfolio.total_equity >= (portfolio.total_balance ?? 0) ? 'up' : 'down'}
            subValue={portfolio ? `${((portfolio.total_equity / (portfolio.total_balance || 1) - 1) * 100).toFixed(2)}%` : '—'}
          />
          <StatCard
            label="Free Margin"
            value={primaryAccount ? fmt(primaryAccount.free_margin, primaryAccount.currency) : '$0.00'}
            subValue={primaryAccount ? `Leverage ${primaryAccount.leverage}:1` : '—'}
          />
          <StatCard
            label="P&L Today"
            value={`${pnlToday >= 0 ? '+' : ''}${fmt(pnlToday)}`}
            trend={pnlToday >= 0 ? 'up' : 'down'}
          />
        </div>

        <div className="emboss-divider" />

        {/* Two Column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Open Positions */}
          <div className="glass-card rounded-xl overflow-hidden min-w-0">
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border-glass flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-md font-semibold text-text-primary">
                Open Positions
                {portfolio && portfolio.open_positions_count > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-bg-hover rounded-sm tabular-nums">
                    {portfolio.open_positions_count}
                  </span>
                )}
              </h3>
              <Link href="/portfolio" className="text-xs text-buy hover:underline shrink-0">View All</Link>
            </div>
            <div className="p-3 sm:p-4">
              {!portfolio?.holdings?.length ? (
                <p className="text-sm text-text-tertiary text-center py-4">No open positions</p>
              ) : (
                <div className="space-y-2">
                  {portfolio.holdings.slice(0, 5).map((pos, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-border-glass/50">
                      <div>
                        <span className="text-sm font-medium text-text-primary">{pos.symbol}</span>
                        <span className={clsx('ml-2 text-xs font-medium', pos.side?.toLowerCase() === 'buy' ? 'text-buy' : 'text-sell')}>
                          {pos.side?.toUpperCase()} {pos.lots}
                        </span>
                      </div>
                      <span className={clsx('text-sm font-mono tabular-nums', pos.pnl >= 0 ? 'text-buy' : 'text-sell')}>
                        {pos.pnl >= 0 ? '+' : ''}{fmt(pos.pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="glass-card rounded-xl overflow-hidden min-w-0">
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border-glass">
              <h3 className="text-sm sm:text-md font-semibold text-text-primary">Quick Actions</h3>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-2 gap-2 sm:gap-3">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  prefetch={false}
                  className={clsx(
                    action.color,
                    'text-xs sm:text-sm font-medium py-2.5 sm:py-3 px-2 sm:px-4 rounded-lg text-center hover:opacity-90 transition-all flex items-center justify-center gap-1.5 sm:gap-2 leading-snug min-h-[44px]',
                  )}
                >
                  <span>{action.icon}</span>
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card rounded-xl overflow-hidden min-w-0">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border-glass flex items-center justify-between gap-2">
            <h3 className="text-sm sm:text-md font-semibold text-text-primary">Recent Notifications</h3>
            <Button variant="ghost" size="sm" onClick={() => void fetchData()}>Refresh</Button>
          </div>
          <div className="divide-y divide-border-glass/50">
            {extrasLoading && notifications.length === 0 ? (
              <div className="px-4 py-6 flex flex-col items-center gap-2 text-sm text-text-tertiary">
                <div className="w-5 h-5 border-2 border-buy border-t-transparent rounded-full animate-spin" />
                <span>Loading notifications…</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-tertiary">No recent notifications</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={clsx('px-4 py-3 flex items-center justify-between', !n.is_read && 'bg-buy/5')}>
                  <div>
                    <span className="text-sm text-text-primary font-medium">{n.title}</span>
                    <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">{n.message}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <span className={clsx(
                      'inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-sm mb-0.5',
                      n.type === 'success' ? 'bg-success/15 text-success'
                        : n.type === 'warning' ? 'bg-warning/15 text-warning'
                        : n.type === 'error' ? 'bg-sell/15 text-sell'
                        : 'bg-info/15 text-info'
                    )}>
                      {n.type}
                    </span>
                    <div className="text-[10px] text-text-tertiary">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
