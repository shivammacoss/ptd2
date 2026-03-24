'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import TopBar from '@/components/layout/TopBar';
import api, { getApiBase } from '@/lib/api/client';

const TEAL = '#14B8A6';

type TabId = 'leaderboard' | 'my-copies' | 'mamm-pamm' | 'become-provider' | 'my-dashboard';
type SortBy = 'total_return_pct' | 'sharpe_ratio' | 'followers_count';

interface Provider {
  id: string;
  provider_name: string;
  total_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  followers_count: number;
  performance_fee_pct: number;
  min_investment: number;
  description: string;
  created_at: string;
}

interface ProviderDetail extends Provider {
  active_investors: number;
  total_trades: number;
  total_profit: number;
  win_rate: number;
  monthly_breakdown: { month: string; profit: number }[];
  is_copying: boolean;
}

interface CopySubscription {
  id: string;
  master_id: string;
  provider_name: string;
  allocation_amount: number;
  total_profit: number;
  total_return_pct: number;
  status: string;
  created_at: string;
}

interface MammPammAccount {
  id: string;
  manager_name: string;
  master_type: string;
  total_return_pct: number;
  max_drawdown_pct: number;
  performance_fee_pct: number;
  min_investment: number;
  active_investors: number;
  slots_available: number;
  description: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'my-copies', label: 'My Copies' },
  { id: 'mamm-pamm', label: 'MAM/PAMM' },
  { id: 'become-provider', label: 'Become Provider' },
  { id: 'my-dashboard', label: 'My Dashboard' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'total_return_pct', label: 'Return' },
  { value: 'sharpe_ratio', label: 'Sharpe' },
  { value: 'followers_count', label: 'Followers' },
];

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-[#14B8A6] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
      <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 11.625l2.25-2.25M12 11.625l-2.25 2.25" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-sell/10 border border-sell/30 text-sell text-sm mb-4">
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="shrink-0 px-3 py-1 rounded text-xs font-medium border border-sell/40 hover:bg-sell/20 transition-colors">
        Retry
      </button>
    </div>
  );
}

/* ─── Mini bar chart for monthly breakdown ─── */
function MonthlyChart({ data }: { data: { month: string; profit: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => Math.abs(d.profit)), 1);
  return (
    <div className="mt-4">
      <div className="text-xs text-text-tertiary mb-2">Monthly Breakdown</div>
      <div className="flex items-end gap-1 h-24">
        {data.map((d) => {
          const pct = (Math.abs(d.profit) / max) * 100;
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={clsx('w-full rounded-t', d.profit >= 0 ? 'bg-buy' : 'bg-sell')}
                style={{ height: `${Math.max(pct, 4)}%` }}
                title={`${d.month}: ${d.profit >= 0 ? '+' : ''}${d.profit.toFixed(2)}`}
              />
              <span className="text-[9px] text-text-tertiary truncate w-full text-center">{d.month.slice(-3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Provider Card (TraderCard pattern) ─── */
function TraderCard({
  provider,
  onClick,
  onCopy,
}: {
  provider: Provider;
  onClick: () => void;
  onCopy: (e: React.MouseEvent) => void;
}) {
  const initials = provider.provider_name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      onClick={onClick}
      className={clsx(
        'relative rounded-xl overflow-hidden border transition-all min-h-[200px] flex flex-col cursor-pointer group',
        'bg-bg-secondary border-border-glass hover:border-[#14B8A6]/50',
        '[data-theme="light"]:bg-bg-tertiary [data-theme="light"]:border-black'
      )}
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
        <svg className="absolute bottom-0 left-0 w-full h-20" viewBox="0 0 400 80" preserveAspectRatio="none">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            d="M0 40 Q100 10 200 40 T400 40 L400 80 L0 80 Z"
            className="text-[var(--text-tertiary)]"
          />
        </svg>
      </div>

      <div className="relative z-10 p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-bg-tertiary border border-border-glass flex items-center justify-center text-sm font-bold text-text-primary shrink-0 [data-theme='light']:border-black">
              {initials}
            </div>
            <div className="min-w-0">
              <span className="text-sm font-semibold text-text-primary truncate block">{provider.provider_name}</span>
              <div className="text-xxs text-text-tertiary mt-0.5">Fee: {provider.performance_fee_pct}%</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={clsx(
              'shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all',
              'border-[#14B8A6] text-[#14B8A6] hover:bg-[#14B8A6] hover:text-white',
              '[data-theme="light"]:border-black [data-theme="light"]:text-black [data-theme="light"]:hover:bg-black [data-theme="light"]:hover:text-[#F2EFE9]'
            )}
          >
            Copy
          </button>
        </div>

        <div className="mb-4">
          <div className="text-xxs text-text-tertiary mb-0.5">Total ROI</div>
          <div className={clsx('text-xl sm:text-2xl font-bold tabular-nums font-mono', provider.total_return_pct >= 0 ? 'text-buy' : 'text-sell')}>
            {provider.total_return_pct >= 0 ? '+' : ''}{provider.total_return_pct.toFixed(2)}%
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-auto pt-3 border-t border-border-glass [data-theme='light']:border-black">
          <div>
            <div className="text-xxs text-text-tertiary">Drawdown</div>
            <div className="text-xs font-semibold tabular-nums text-sell">{provider.max_drawdown_pct.toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-xxs text-text-tertiary">Sharpe</div>
            <div className="text-xs font-semibold tabular-nums text-text-primary">{provider.sharpe_ratio.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xxs text-text-tertiary">Followers</div>
            <div className="text-xs font-semibold tabular-nums text-text-primary">{provider.followers_count.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail Modal ─── */
function DetailModal({
  detail,
  loading,
  onClose,
  onCopy,
}: {
  detail: ProviderDetail | null;
  loading: boolean;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl bg-bg-secondary border border-border-glass p-6 overflow-y-auto max-h-[90vh] [data-theme='light']:bg-bg-tertiary [data-theme='light']:border-black"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-text-tertiary hover:text-text-primary text-lg">✕</button>

        {loading ? (
          <Spinner />
        ) : detail ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-bg-tertiary border border-border-glass flex items-center justify-center text-sm font-bold text-text-primary">
                {detail.provider_name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold text-text-primary">{detail.provider_name}</div>
                <div className="text-xxs text-text-tertiary">Since {new Date(detail.created_at).toLocaleDateString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Total ROI', value: `${detail.total_return_pct >= 0 ? '+' : ''}${detail.total_return_pct.toFixed(2)}%`, color: detail.total_return_pct >= 0 ? 'text-buy' : 'text-sell' },
                { label: 'Max DD', value: `${detail.max_drawdown_pct.toFixed(2)}%`, color: 'text-sell' },
                { label: 'Sharpe', value: detail.sharpe_ratio.toFixed(2), color: 'text-text-primary' },
                { label: 'Win Rate', value: `${detail.win_rate.toFixed(1)}%`, color: 'text-text-primary' },
                { label: 'Total Trades', value: detail.total_trades.toLocaleString(), color: 'text-text-primary' },
                { label: 'Total Profit', value: `$${detail.total_profit.toLocaleString()}`, color: detail.total_profit >= 0 ? 'text-buy' : 'text-sell' },
                { label: 'Followers', value: detail.followers_count.toLocaleString(), color: 'text-text-primary' },
                { label: 'Investors', value: detail.active_investors.toLocaleString(), color: 'text-text-primary' },
                { label: 'Fee', value: `${detail.performance_fee_pct}%`, color: 'text-text-primary' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-bg-primary/50 p-2">
                  <div className="text-xxs text-text-tertiary">{s.label}</div>
                  <div className={clsx('text-sm font-semibold tabular-nums', s.color)}>{s.value}</div>
                </div>
              ))}
            </div>

            {detail.description && (
              <p className="text-xs text-text-secondary mb-4">{detail.description}</p>
            )}

            <MonthlyChart data={detail.monthly_breakdown} />

            <button
              type="button"
              onClick={onCopy}
              disabled={detail.is_copying}
              className={clsx(
                'w-full mt-5 py-2.5 rounded-lg text-sm font-semibold transition-all',
                detail.is_copying
                  ? 'bg-bg-tertiary text-text-tertiary cursor-not-allowed'
                  : 'bg-[#14B8A6] text-white hover:bg-[#0D9488]'
              )}
            >
              {detail.is_copying ? 'Already Copying' : 'Copy This Trader'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Copy Modal ─── */
interface TradingAccount {
  id: string;
  account_number: string;
  balance: number;
}

function CopyModal({
  provider,
  onClose,
  onSuccess,
}: {
  provider: Provider | ProviderDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingAccounts(true);
        const res = await api.get<{ items: TradingAccount[] }>('/accounts');
        if (cancelled) return;
        const items = res.items ?? [];
        setAccounts(items);
        if (items.length > 0) setAccountId(items[0].id);
      } catch {
        // non-critical, user can still type manually
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!accountId.trim()) { toast.error('Select a trading account'); return; }
    setSubmitting(true);
    try {
      const copyResp = await fetch(`${getApiBase()}/social/copy?master_id=${provider.id}&account_id=${accountId}&amount=${amt}`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${api.getToken()}`, 'Content-Type': 'application/json' },
      });
      if (!copyResp.ok) { const err = await copyResp.json().catch(() => ({})); throw new Error(err.detail || 'Failed'); }
      toast.success(`Now copying ${provider.provider_name}`);
      onSuccess();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to start copy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-bg-secondary border border-border-glass p-6 [data-theme='light']:bg-bg-tertiary [data-theme='light']:border-black"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-text-tertiary hover:text-text-primary text-lg">✕</button>
        <h3 className="text-sm font-semibold text-text-primary mb-1">Copy {provider.provider_name}</h3>
        <p className="text-xxs text-text-tertiary mb-4">Performance fee: {provider.performance_fee_pct}% · Min: ${provider.min_investment}</p>

        <label className="block text-xs text-text-secondary mb-1">Trading Account</label>
        {loadingAccounts ? (
          <div className="w-full mb-3 px-3 py-2 rounded-lg bg-bg-primary border border-border-glass text-sm text-text-tertiary">
            Loading accounts...
          </div>
        ) : accounts.length > 0 ? (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-bg-primary border border-border-glass text-sm text-text-primary focus:outline-none focus:border-[#14B8A6] [data-theme='light']:border-black"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.account_number} — ${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </option>
            ))}
          </select>
        ) : (
          <div className="w-full mb-3 px-3 py-2 rounded-lg bg-bg-primary border border-border-glass text-sm text-text-tertiary">
            No accounts found
          </div>
        )}

        <label className="block text-xs text-text-secondary mb-1">Investment Amount (USD)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={provider.min_investment}
          placeholder={`Min $${provider.min_investment}`}
          className="w-full mb-4 px-3 py-2 rounded-lg bg-bg-primary border border-border-glass text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-[#14B8A6] [data-theme='light']:border-black"
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || accounts.length === 0}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-[#14B8A6] text-white hover:bg-[#0D9488] disabled:opacity-50 transition-all"
        >
          {submitting ? 'Processing…' : 'Start Copying'}
        </button>
      </div>
    </div>
  );
}

/* ─── Leaderboard Tab ─── */
function LeaderboardTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('total_return_pct');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [copyTarget, setCopyTarget] = useState<Provider | ProviderDetail | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedResponse<Provider>>('/social/leaderboard', {
        sort_by: sortBy,
        page: String(page),
        per_page: '20',
      });
      setProviders(res.items);
      setTotalPages(res.pages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [sortBy, page]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await api.get<ProviderDetail>(`/social/providers/${id}`);
      setDetail(d);
    } catch {
      toast.error('Failed to load provider details');
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <>
      {/* Sort bar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-xs text-text-tertiary mr-1">Sort by:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => { setSortBy(opt.value); setPage(1); }}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              sortBy === opt.value
                ? 'border-[#14B8A6] bg-[#14B8A6]/20 text-[#14B8A6]'
                : 'border-border-glass text-text-secondary hover:text-text-primary'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchLeaderboard} />}
      {loading ? <Spinner /> : providers.length === 0 ? (
        <EmptyState message="No providers found" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {providers.map((p) => (
              <TraderCard
                key={p.id}
                provider={p}
                onClick={() => openDetail(p.id)}
                onCopy={(e) => { e.stopPropagation(); setCopyTarget(p); }}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs border border-border-glass text-text-secondary disabled:opacity-30 hover:text-text-primary transition-all"
              >
                ← Prev
              </button>
              <span className="text-xs text-text-tertiary tabular-nums">{page} / {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs border border-border-glass text-text-secondary disabled:opacity-30 hover:text-text-primary transition-all"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {selectedId && (
        <DetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setSelectedId(null)}
          onCopy={() => { setSelectedId(null); setCopyTarget(detail); }}
        />
      )}

      {/* Copy modal */}
      {copyTarget && (
        <CopyModal
          provider={copyTarget}
          onClose={() => setCopyTarget(null)}
          onSuccess={() => { setCopyTarget(null); fetchLeaderboard(); }}
        />
      )}
    </>
  );
}

/* ─── My Copies Tab ─── */
function MyCopiesTab() {
  const [copies, setCopies] = useState<CopySubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const fetchCopies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: CopySubscription[]; total: number }>('/social/my-copies');
      setCopies(res.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load copies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCopies(); }, [fetchCopies]);

  const stopCopy = async (id: string, name: string) => {
    setStoppingId(id);
    try {
      await api.delete(`/social/copy/${id}`);
      toast.success(`Stopped copying ${name}`);
      setCopies((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop copy');
    } finally {
      setStoppingId(null);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchCopies} />;
  if (copies.length === 0) return <EmptyState message="You are not copying anyone yet" />;

  return (
    <div className="space-y-3">
      {copies.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between gap-4 p-4 rounded-xl bg-bg-secondary border border-border-glass [data-theme='light']:bg-bg-tertiary [data-theme='light']:border-black"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-text-primary truncate">{c.provider_name}</span>
              <span className={clsx(
                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                c.status === 'active' ? 'bg-buy/20 text-buy' : 'bg-text-tertiary/20 text-text-tertiary'
              )}>
                {c.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-text-secondary">
              <span>Allocated: <span className="text-text-primary font-medium">${c.allocation_amount.toLocaleString()}</span></span>
              <span>PnL: <span className={clsx('font-medium', c.total_profit >= 0 ? 'text-buy' : 'text-sell')}>{c.total_profit >= 0 ? '+' : ''}${c.total_profit.toLocaleString()}</span></span>
              <span>ROI: <span className={clsx('font-medium', c.total_return_pct >= 0 ? 'text-buy' : 'text-sell')}>{c.total_return_pct >= 0 ? '+' : ''}{c.total_return_pct.toFixed(2)}%</span></span>
            </div>
          </div>
          <button
            type="button"
            disabled={stoppingId === c.id}
            onClick={() => stopCopy(c.id, c.provider_name)}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-sell text-sell hover:bg-sell hover:text-white disabled:opacity-50 transition-all"
          >
            {stoppingId === c.id ? 'Stopping…' : 'Stop'}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── MAM/PAMM Tab ─── */
function MammPammTab() {
  const [accounts, setAccounts] = useState<MammPammAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: MammPammAccount[]; total: number }>('/social/mamm-pamm');
      setAccounts(res.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load managed accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchAccounts} />;
  if (accounts.length === 0) return <EmptyState message="No managed accounts available" />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {accounts.map((a) => (
        <div
          key={a.id}
          className="rounded-xl overflow-hidden border bg-bg-secondary border-border-glass p-4 flex flex-col [data-theme='light']:bg-bg-tertiary [data-theme='light']:border-black"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary truncate">{a.manager_name}</div>
              <span className="text-xxs px-1.5 py-0.5 rounded bg-[#14B8A6]/20 text-[#14B8A6] font-medium">{a.master_type}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const acctRes = await api.get<{ items: any[] }>('/accounts');
                  const live = (acctRes.items || []).find((x: any) => !x.is_demo);
                  if (!live) { toast.error('No live account'); return; }
                  const amount = prompt(`Invest in ${a.manager_name}\nMin: $${a.min_investment}\n\nEnter amount:`);
                  if (!amount || parseFloat(amount) <= 0) return;
                  const investResp = await fetch(`${getApiBase()}/social/mamm-pamm/${a.id}/invest?account_id=${live.id}&amount=${amount}`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${api.getToken()}`, 'Content-Type': 'application/json' },
                  });
                  if (!investResp.ok) { const err = await investResp.json().catch(() => ({})); throw new Error(err.detail || 'Failed'); }
                  toast.success('Investment started!');
                } catch (e: any) { toast.error(e.message || 'Failed'); }
              }}
              className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#14B8A6] text-[#14B8A6] hover:bg-[#14B8A6] hover:text-white transition-all"
            >
              Invest
            </button>
          </div>

          <div className="mb-3">
            <div className="text-xxs text-text-tertiary mb-0.5">Total ROI</div>
            <div className={clsx('text-xl font-bold tabular-nums font-mono', a.total_return_pct >= 0 ? 'text-buy' : 'text-sell')}>
              {a.total_return_pct >= 0 ? '+' : ''}{a.total_return_pct.toFixed(2)}%
            </div>
          </div>

          {a.description && <p className="text-xxs text-text-tertiary mb-3 line-clamp-2">{a.description}</p>}

          <div className="grid grid-cols-3 gap-2 mt-auto pt-3 border-t border-border-glass [data-theme='light']:border-black">
            <div>
              <div className="text-xxs text-text-tertiary">Drawdown</div>
              <div className="text-xs font-semibold tabular-nums text-sell">{a.max_drawdown_pct.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-xxs text-text-tertiary">Investors</div>
              <div className="text-xs font-semibold tabular-nums text-text-primary">{a.active_investors}</div>
            </div>
            <div>
              <div className="text-xxs text-text-tertiary">Slots</div>
              <div className="text-xs font-semibold tabular-nums text-text-primary">{a.slots_available}</div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 text-xxs text-text-tertiary">
            <span>Fee: {a.performance_fee_pct}%</span>
            <span>Min: ${a.min_investment.toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ─── */
export default function SocialPage() {
  const [activeTab, setActiveTab] = useState<TabId>('leaderboard');

  return (
    <div className="flex flex-col min-h-[100dvh] pb-16 md:pb-0 bg-bg-primary min-w-0 overflow-x-hidden">
      <TopBar />

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {/* Hero */}
        <section
          className={clsx(
            'relative overflow-hidden rounded-none sm:rounded-b-2xl',
            'bg-gradient-to-br from-[#0D9488] via-[#0F766E] to-[#115E59]',
            '[data-theme="light"]:from-[#99F6E4] [data-theme="light"]:via-[#5EEAD4] [data-theme="light"]:to-[#2DD4BF]'
          )}
        >
          <div className="relative z-10 px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
            <h1 className="text-xl sm:text-3xl font-bold text-white [data-theme='light']:text-black mb-2 leading-tight">
              Copy Global Elite Traders
            </h1>
            <p className="text-sm text-white/80 [data-theme='light']:text-black/70">
              Follow top performers and replicate their strategies automatically
            </p>
          </div>
        </section>

        <div className="px-3 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-7xl mx-auto w-full">
          {/* Tab bar */}
          <div className="flex items-center gap-0.5 sm:gap-1 mb-4 sm:mb-6 p-1 rounded-xl bg-bg-secondary border border-border-glass w-full sm:w-fit overflow-x-auto scrollbar-none [data-theme='light']:bg-bg-tertiary [data-theme='light']:border-black">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'shrink-0 min-h-[40px] px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-medium transition-all',
                  activeTab === tab.id
                    ? 'bg-[#14B8A6] text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'leaderboard' && <LeaderboardTab />}
          {activeTab === 'my-copies' && <MyCopiesTab />}
          {activeTab === 'mamm-pamm' && <MammPammTab />}
          {activeTab === 'become-provider' && <BecomeProviderTab />}
          {activeTab === 'my-dashboard' && <MyDashboardTab />}
        </div>
      </main>
    </div>
  );
}


function BecomeProviderTab() {
  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState<any>(null);
  const [accounts, setAccounts] = useState<{ id: string; account_number: string; balance: number; is_demo: boolean }[]>([]);
  const [accountId, setAccountId] = useState('');
  const [masterType, setMasterType] = useState<'signal_provider' | 'pamm' | 'mamm'>('signal_provider');
  const [perfFee, setPerfFee] = useState('20');
  const [minInvest, setMinInvest] = useState('100');
  const [maxInvestors, setMaxInvestors] = useState('100');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let provRes = null;
        try { provRes = await api.get<any>('/social/my-provider'); } catch {}
        const acctRes = await api.get<{ items: any[] }>('/accounts');
        if (provRes) setExisting(provRes);
        const items = (acctRes?.items || []).filter((a: any) => !a.is_demo);
        setAccounts(items);
        if (items.length > 0) setAccountId(items[0].id);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!accountId) { toast.error('Select an account'); return; }
    setSubmitting(true);
    try {
      const params = new URLSearchParams({
        account_id: accountId,
        master_type: masterType,
        performance_fee_pct: perfFee,
        min_investment: minInvest,
        max_investors: maxInvestors,
        ...(description ? { description } : {}),
      });
      const resp = await fetch(`${getApiBase()}/social/become-provider?${params}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${api.getToken()}`, 'Content-Type': 'application/json' },
      });
      if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.detail || 'Failed'); }
      toast.success('Application submitted! Admin will review.');
      let res = null;
      try { res = await api.get<any>('/social/my-provider'); } catch {}
      if (res) setExisting(res);
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-buy border-t-transparent rounded-full animate-spin" /></div>;

  if (existing) {
    const statusColor = existing.status === 'approved' ? 'text-success bg-success/15' : existing.status === 'pending' ? 'text-warning bg-warning/15' : 'text-danger bg-danger/15';
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="glass-card rounded-xl p-5 noise-texture">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Your Provider Application</h3>
            <span className={clsx('px-2 py-0.5 rounded text-xxs font-semibold capitalize', statusColor)}>{existing.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-text-tertiary">Type</p><p className="text-text-primary capitalize">{existing.master_type?.replace('_', ' ')}</p></div>
            <div><p className="text-text-tertiary">Performance Fee</p><p className="text-text-primary">{existing.performance_fee_pct}%</p></div>
            <div><p className="text-text-tertiary">Min Investment</p><p className="text-text-primary font-mono">${existing.min_investment}</p></div>
            <div><p className="text-text-tertiary">Max Investors</p><p className="text-text-primary">{existing.max_investors}</p></div>
            <div><p className="text-text-tertiary">Followers</p><p className="text-text-primary">{existing.followers_count || 0}</p></div>
            <div><p className="text-text-tertiary">Total Trades</p><p className="text-text-primary">{existing.total_trades || 0}</p></div>
          </div>
          {existing.status === 'pending' && <p className="text-xxs text-warning mt-3">Your application is under review by the admin team.</p>}
          {existing.status === 'rejected' && <p className="text-xxs text-danger mt-3">Your application was rejected. Contact support for details.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="glass-card rounded-xl p-5 noise-texture space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Apply to Become a Provider</h3>
        <p className="text-xxs text-text-tertiary">Choose your provider type, set your fees, and start earning from followers.</p>

        {/* Provider Type */}
        <div>
          <label className="text-xxs text-text-secondary block mb-2">Provider Type</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'signal_provider' as const, label: 'Signal Provider', desc: 'Users copy your trades independently' },
              { id: 'pamm' as const, label: 'PAMM', desc: 'Proportional allocation based on equity' },
              { id: 'mamm' as const, label: 'MAMM', desc: 'Multi-account with custom allocations' },
            ]).map(t => (
              <button key={t.id} onClick={() => setMasterType(t.id)} className={clsx('p-3 rounded-xl border text-left transition-all', masterType === t.id ? 'border-buy bg-buy/5 ring-1 ring-buy/30' : 'border-border-glass bg-bg-secondary hover:border-text-tertiary')}>
                <p className={clsx('text-xs font-semibold', masterType === t.id ? 'text-buy' : 'text-text-primary')}>{t.label}</p>
                <p className="text-xxs text-text-tertiary mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xxs text-text-secondary block mb-1">Trading Account</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)} className="skeu-input w-full text-text-primary rounded-xl py-2.5 px-4 text-xs">
            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_number} — ${a.balance?.toLocaleString()}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xxs text-text-secondary block mb-1">Performance Fee %</label>
            <input type="number" min="0" max="50" value={perfFee} onChange={e => setPerfFee(e.target.value)} className="skeu-input w-full text-text-primary rounded-xl py-2.5 px-4 text-xs font-mono" />
          </div>
          <div>
            <label className="text-xxs text-text-secondary block mb-1">Min Investment ($)</label>
            <input type="number" min="1" value={minInvest} onChange={e => setMinInvest(e.target.value)} className="skeu-input w-full text-text-primary rounded-xl py-2.5 px-4 text-xs font-mono" />
          </div>
        </div>
        <div>
          <label className="text-xxs text-text-secondary block mb-1">Max Investors</label>
          <input type="number" min="1" max="1000" value={maxInvestors} onChange={e => setMaxInvestors(e.target.value)} className="skeu-input w-full text-text-primary rounded-xl py-2.5 px-4 text-xs font-mono" />
        </div>
        <div>
          <label className="text-xxs text-text-secondary block mb-1">Description / Strategy</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe your trading strategy..." className="skeu-input w-full text-text-primary rounded-xl py-2.5 px-4 text-xs resize-none" />
        </div>
        <button onClick={handleSubmit} disabled={submitting} className={clsx('w-full py-3 rounded-xl text-sm font-semibold text-white transition-all', submitting ? 'opacity-50' : 'skeu-btn-buy')}>
          {submitting ? 'Submitting...' : 'Submit Application'}
        </button>
      </div>
    </div>
  );
}


function MyDashboardTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let res = null;
      try { res = await api.get<any>('/social/my-provider'); } catch {}
      setData(res);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-buy border-t-transparent rounded-full animate-spin" /></div>;
  if (!data || data.status !== 'approved') return <div className="text-center py-16 text-xs text-text-tertiary">You are not an approved signal provider. Apply in the "Become Provider" tab.</div>;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Followers', value: String(data.followers_count || 0), color: 'text-buy' },
          { label: 'AUM', value: `$${fmt(data.total_aum || 0)}`, color: 'text-success' },
          { label: 'Your Earnings', value: `$${fmt(data.total_investor_profit ? data.total_investor_profit * (data.performance_fee_pct / 100) : 0)}`, color: 'text-warning' },
          { label: 'Total Trades', value: String(data.total_trades || 0), color: 'text-text-primary' },
        ].map(c => (
          <div key={c.label} className="glass-card rounded-xl p-3 noise-texture">
            <p className="text-xxs text-text-tertiary">{c.label}</p>
            <p className={clsx('text-lg font-bold font-mono tabular-nums mt-0.5', c.color)}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-xl p-4 noise-texture">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Performance Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><p className="text-text-tertiary">Total Return</p><p className={clsx('font-mono font-bold', data.total_return_pct >= 0 ? 'text-buy' : 'text-sell')}>{data.total_return_pct >= 0 ? '+' : ''}{data.total_return_pct?.toFixed(2)}%</p></div>
          <div><p className="text-text-tertiary">Max Drawdown</p><p className="text-sell font-mono font-bold">{data.max_drawdown_pct?.toFixed(2)}%</p></div>
          <div><p className="text-text-tertiary">Sharpe Ratio</p><p className="text-text-primary font-mono font-bold">{data.sharpe_ratio?.toFixed(2)}</p></div>
          <div><p className="text-text-tertiary">Total Profit</p><p className={clsx('font-mono font-bold', data.total_profit >= 0 ? 'text-buy' : 'text-sell')}>${fmt(data.total_profit || 0)}</p></div>
          <div><p className="text-text-tertiary">Performance Fee</p><p className="text-text-primary font-mono">{data.performance_fee_pct}%</p></div>
          <div><p className="text-text-tertiary">Active Investors</p><p className="text-text-primary">{data.active_investors} / {data.max_investors}</p></div>
          <div><p className="text-text-tertiary">Min Investment</p><p className="text-text-primary font-mono">${fmt(data.min_investment || 0)}</p></div>
          <div><p className="text-text-tertiary">Status</p><p className="text-success capitalize">{data.status}</p></div>
        </div>
      </div>
    </div>
  );
}
