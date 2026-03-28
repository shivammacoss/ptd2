'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import TopBar from '@/components/layout/TopBar';
import api from '@/lib/api/client';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Wallet as WalletIcon,
  Plus,
  Minus,
  Clock,
  ChevronRight,
  History,
  CreditCard,
  RefreshCcw,
  X,
  Banknote,
  Bitcoin,
  Filter,
  ChevronLeft,
  Calendar,
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'bonus' | 'correction';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  method: string;
  created_at: string;
  tx_hash?: string;
}

interface AccountItem {
  id: string;
  currency?: string;
  is_demo?: boolean;
  balance?: number;
}

interface WalletData {
  balance: number;
  currency: string;
  total_deposited: number;
  total_withdrawn: number;
  pending_withdrawals: number;
}

interface WalletSummaryResponse {
  balance?: number;
  credit?: number;
  equity?: number;
  total_deposited?: number;
  total_withdrawn?: number;
}

interface WalletListItem {
  id: string;
  created_at: string | null;
  type: string;
  method: string;
  amount: number;
  status: string;
  currency: string;
}

function formatMethod(method: string): string {
  const m = (method || '').toLowerCase().replace(/-/g, '_');
  const labels: Record<string, string> = {
    bank_transfer: 'Bank transfer',
    bank: 'Bank transfer',
    upi: 'UPI',
    qr: 'QR code',
    crypto_btc: 'Bitcoin',
    crypto_eth: 'Ethereum',
    crypto_usdt: 'USDT',
    metamask: 'MetaMask',
    card: 'Card',
  };
  if (labels[m]) return labels[m];
  return method
    ? method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—';
}

function normalizeStatus(raw: string): Transaction['status'] {
  const s = (raw || '').toLowerCase();
  if (['approved', 'auto_approved', 'completed'].includes(s)) return 'completed';
  if (s === 'pending') return 'pending';
  if (['rejected', 'failed'].includes(s)) return 'failed';
  if (['cancelled', 'canceled'].includes(s)) return 'cancelled';
  return 'pending';
}

function mergeWalletHistory(
  deposits: WalletListItem[],
  withdrawals: WalletListItem[],
): Transaction[] {
  const mapRow = (row: WalletListItem, kind: 'deposit' | 'withdrawal'): Transaction => ({
    id: `${kind}-${row.id}`,
    type: kind,
    amount: Number(row.amount) || 0,
    currency: row.currency || 'USD',
    status: normalizeStatus(row.status),
    method: formatMethod(row.method),
    created_at: row.created_at || new Date(0).toISOString(),
  });

  const merged = [
    ...deposits.map((d) => mapRow(d, 'deposit')),
    ...withdrawals.map((w) => mapRow(w, 'withdrawal')),
  ];
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return merged;
}

const PAGE_SIZES = [10, 25, 50];

const DEPOSIT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Banknote },
  { value: 'card', label: 'Credit / Debit Card', icon: CreditCard },
  { value: 'crypto_usdt', label: 'Crypto — USDT', icon: Bitcoin },
  { value: 'crypto_btc', label: 'Crypto — BTC', icon: Bitcoin },
  { value: 'crypto_eth', label: 'Crypto — ETH', icon: Bitcoin },
];

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters & pagination
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [typeFilter, setTypeFilter]     = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [accountId, setAccountId] = useState<string | null>(null);
  const loadGen = useRef(0);
  const fundingRef = useRef<HTMLDivElement>(null);

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositMethod, setDepositMethod] = useState('bank_transfer');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositTxId, setDepositTxId] = useState('');
  const [depositSubmitting, setDepositSubmitting] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    const id = ++loadGen.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const [summaryRes, depRes, wdRes, accountsRes] = await Promise.allSettled([
        api.get<WalletSummaryResponse>('/wallet/summary'),
        api.get<{ items?: WalletListItem[] }>('/wallet/deposits'),
        api.get<{ items?: WalletListItem[] }>('/wallet/withdrawals'),
        api.get<{ items?: Array<{ currency?: string; is_demo?: boolean; balance?: number }> }>('/accounts'),
      ]);

      if (id !== loadGen.current) return;

      let currency = 'USD';
      let balance = 0;
      let totalDeposited = 0;
      let totalWithdrawn = 0;

      if (accountsRes.status === 'fulfilled') {
        const items = (accountsRes.value?.items || []) as AccountItem[];
        const live = items.find((a) => a.is_demo === false) || items[0];
        if (live?.currency) currency = live.currency;
        if (live?.id) setAccountId(live.id);
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value) {
        const s = summaryRes.value;
        balance = Number(s.balance) || 0;
        totalDeposited = Number(s.total_deposited) || 0;
        totalWithdrawn = Number(s.total_withdrawn) || 0;
      } else if (accountsRes.status === 'fulfilled') {
        const items = accountsRes.value?.items || [];
        const live = items.find((a) => a.is_demo === false) || items[0];
        if (live && typeof live.balance === 'number') balance = live.balance;
        if (summaryRes.status === 'rejected') {
          setLoadError('Wallet summary unavailable — balance from account only.');
          toast.error('Could not load wallet summary (totals may be incomplete).');
        }
      } else {
        const msg =
          summaryRes.status === 'rejected' && summaryRes.reason instanceof Error
            ? summaryRes.reason.message
            : 'Failed to load wallet';
        setLoadError(msg);
        toast.error(msg);
      }

      const depItems =
        depRes.status === 'fulfilled' ? depRes.value?.items || [] : [];
      const wdItems =
        wdRes.status === 'fulfilled' ? wdRes.value?.items || [] : [];

      if (depRes.status === 'rejected' || wdRes.status === 'rejected') {
        toast.error('Some transaction history could not be loaded.');
      }

      const pendingWd = wdItems.filter(
        (w) => (w.status || '').toLowerCase() === 'pending',
      ).length;

      setWallet({
        balance,
        currency,
        total_deposited: totalDeposited,
        total_withdrawn: totalWithdrawn,
        pending_withdrawals: pendingWd,
      });

      setTransactions(mergeWalletHistory(depItems, wdItems));
    } catch (err) {
      if (id !== loadGen.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load wallet';
      setLoadError(message);
      toast.error(message);
      setWallet({
        balance: 0,
        currency: 'USD',
        total_deposited: 0,
        total_withdrawn: 0,
        pending_withdrawals: 0,
      });
      setTransactions([]);
    } finally {
      if (id === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: wallet?.currency || 'USD',
    }).format(n);

  const filteredTx = transactions.filter((tx) => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (new Date(tx.created_at) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(tx.created_at) > to) return false;
    }
    return true;
  });

  const totalPages  = Math.max(1, Math.ceil(filteredTx.length / pageSize));
  const safePage    = Math.min(page, totalPages);
  const pagedTx     = filteredTx.slice((safePage - 1) * pageSize, safePage * pageSize);

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTypeFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const openDepositModal = () => {
    setDepositAmount('');
    setDepositTxId('');
    setDepositMethod('bank_transfer');
    setShowDepositModal(true);
  };

  const submitDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!accountId) { toast.error('Account not found'); return; }
    setDepositSubmitting(true);
    try {
      await api.post('/wallet/deposit', {
        account_id: accountId,
        amount: amt,
        method: depositMethod,
        transaction_id: depositTxId || undefined,
      });
      toast.success(`Deposit of $${amt.toLocaleString()} submitted — pending approval`);
      setShowDepositModal(false);
      void fetchData(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deposit failed';
      toast.error(msg);
    } finally {
      setDepositSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">
        <TopBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-buy border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-text-tertiary">Loading wallet...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary overflow-hidden">
      <TopBar />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full pb-24">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-text-primary flex items-center gap-2">
                <WalletIcon className="w-6 h-6 text-buy shrink-0" />
                Wallet
              </h1>
              <p className="text-text-tertiary text-xs md:text-sm truncate">
                Manage your funds and transactions
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchData(true)}
              disabled={refreshing}
              className={clsx(
                'p-2 rounded-full bg-bg-secondary border border-border-glass hover:bg-bg-hover transition-all active:scale-95',
                refreshing && 'animate-spin cursor-not-allowed opacity-50',
              )}
            >
              <RefreshCcw className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          {loadError && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text-primary">
              {loadError}
            </div>
          )}

          <div className="relative overflow-hidden rounded-[20px] md:rounded-[24px] p-6 md:p-8 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white shadow-lg shadow-buy/20">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <p className="text-white/70 text-xs md:text-sm font-medium uppercase tracking-wider">
                  Total Balance
                </p>
                <div className="text-3xl md:text-5xl font-bold tracking-tight tabular-nums font-mono">
                  {fmt(wallet?.balance || 0)}
                </div>
                {(wallet?.pending_withdrawals ?? 0) > 0 && (
                  <p className="text-white/80 text-[11px] md:text-xs">
                    {wallet?.pending_withdrawals} pending withdrawal
                    {(wallet?.pending_withdrawals ?? 0) > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <div className="flex gap-2 sm:gap-3">
                <Button
                  type="button"
                  onClick={openDepositModal}
                  className="flex-1 md:flex-none h-11 md:h-12 px-5 md:px-8 bg-white text-[#2563EB] hover:bg-white/90 font-bold rounded-xl gap-2 shadow-xl shadow-black/10 active:scale-95 transition-transform"
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5" /> Deposit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fundingRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex-1 md:flex-none h-11 md:h-12 px-5 md:px-8 border-white/20 text-white hover:bg-white/10 font-bold rounded-xl gap-2 active:scale-95 transition-transform backdrop-blur-sm"
                >
                  <Minus className="w-4 h-4 md:w-5 md:h-5" /> Withdraw
                </Button>
              </div>
            </div>

            <div className="absolute top-[-40px] right-[-40px] w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-20px] left-[-20px] w-48 h-48 bg-black/10 rounded-full blur-2xl pointer-events-none" />
          </div>

          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <Card variant="glass" className="flex flex-col gap-1 border-border-glass/30 relative overflow-hidden group">
              <div className="flex items-center gap-2 text-success text-[10px] md:text-xs font-bold uppercase tracking-wider">
                <ArrowDownLeft className="w-3 h-3" /> Total Deposits
              </div>
              <div className="text-base md:text-xl font-bold text-text-primary tabular-nums font-mono">
                {fmt(wallet?.total_deposited || 0)}
              </div>
              <div className="absolute top-0 right-0 w-12 h-12 bg-success/5 rounded-bl-full group-hover:bg-success/10 transition-colors" />
            </Card>
            <Card variant="glass" className="flex flex-col gap-1 border-border-glass/30 relative overflow-hidden group">
              <div className="flex items-center gap-2 text-buy text-[10px] md:text-xs font-bold uppercase tracking-wider">
                <ArrowUpRight className="w-3 h-3" /> Total Withdrawals
              </div>
              <div className="text-base md:text-xl font-bold text-text-primary tabular-nums font-mono">
                {fmt(wallet?.total_withdrawn || 0)}
              </div>
              <div className="absolute top-0 right-0 w-12 h-12 bg-buy/5 rounded-bl-full group-hover:bg-buy/10 transition-colors" />
            </Card>
          </div>

          <div
            ref={fundingRef}
            id="wallet-funding-options"
            className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 scroll-mt-24"
          >
            <button
              type="button"
              onClick={() => { setDepositMethod('card'); openDepositModal(); }}
              className="glass-card p-4 flex items-center gap-4 text-left transition-all border-border-glass/30 hover:border-buy/20 hover:bg-bg-hover group active:scale-[0.98]"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-buy/10 flex items-center justify-center text-buy group-hover:scale-110 transition-transform">
                <CreditCard className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-text-primary font-bold text-sm md:text-base">Credit/Debit Card</h4>
                <p className="text-text-tertiary text-[10px] md:text-xs truncate">
                  Instant deposit using Visa or Mastercard
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-buy transition-colors" />
            </button>

            <button
              type="button"
              onClick={() => { setDepositMethod('crypto_usdt'); openDepositModal(); }}
              className="glass-card p-4 flex items-center gap-4 text-left transition-all border-border-glass/30 hover:border-[#F6AD55]/20 hover:bg-bg-hover group active:scale-[0.98]"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#F6AD55]/10 flex items-center justify-center text-[#F6AD55] group-hover:scale-110 transition-transform">
                <div className="font-bold text-lg md:text-xl">₿</div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-text-primary font-bold text-sm md:text-base">Cryptocurrency</h4>
                <p className="text-text-tertiary text-[10px] md:text-xs truncate">
                  USDT, BTC, ETH with fast confirmation
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-[#F6AD55] transition-colors" />
            </button>
          </div>

          <div className="emboss-divider my-2" />

          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-base md:text-lg font-bold text-text-primary flex items-center gap-2">
                <History className="w-5 h-5 text-buy" />
                Transaction History
              </h3>
              <span className="text-xs text-text-tertiary">{filteredTx.length} record{filteredTx.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Filters */}
            <div className="bg-bg-secondary border border-border-primary rounded-xl p-3 md:p-4 space-y-3">
              {/* Date range */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="w-full px-3 py-2 rounded-lg border border-border-primary bg-bg-primary text-text-primary text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="w-full px-3 py-2 rounded-lg border border-border-primary bg-bg-primary text-text-primary text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Type + Status filters */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 mr-1">
                  <Filter className="w-3 h-3 text-text-tertiary" />
                </div>
                {(['all', 'deposit', 'withdrawal'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTypeFilter(t); setPage(1); }}
                    className={clsx(
                      'px-3 py-1 text-xs font-semibold rounded-full border transition-all',
                      typeFilter === t
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-border-primary bg-bg-primary text-text-secondary hover:border-blue-500/50',
                    )}
                  >
                    {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1) + 's'}
                  </button>
                ))}
                <div className="w-px bg-border-primary mx-1 self-stretch" />
                {(['all', 'completed', 'pending', 'failed'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setStatusFilter(s); setPage(1); }}
                    className={clsx(
                      'px-3 py-1 text-xs font-semibold rounded-full border transition-all',
                      statusFilter === s
                        ? s === 'completed' ? 'bg-green-600 text-white border-green-600'
                          : s === 'pending' ? 'bg-yellow-500 text-white border-yellow-500'
                          : s === 'failed'  ? 'bg-red-600 text-white border-red-600'
                          : 'bg-blue-600 text-white border-blue-600'
                        : 'border-border-primary bg-bg-primary text-text-secondary hover:border-blue-500/50',
                    )}
                  >
                    {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                {(dateFrom || dateTo || typeFilter !== 'all' || statusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-3 py-1 text-xs font-semibold rounded-full border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-all ml-auto"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {!pagedTx.length ? (
                <div className="glass-card py-12 text-center border-dashed border-border-glass/40">
                  <div className="w-12 h-12 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-text-tertiary opacity-30" />
                  </div>
                  <p className="text-text-tertiary text-sm">
                    {filteredTx.length === 0 && transactions.length > 0 ? 'No transactions match filters' : 'No transactions yet'}
                  </p>
                </div>
              ) : (
                pagedTx.map((tx) => (
                  <div
                    key={tx.id}
                    className="glass-card p-3 md:p-4 flex items-center gap-3 md:gap-4 group hover:bg-black/20 border-border-glass/30 transition-all active:bg-black/30"
                  >
                    <div
                      className={clsx(
                        'w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 border border-white/5',
                        tx.type === 'deposit'
                          ? 'bg-success/10 text-success'
                          : 'bg-buy/10 text-buy',
                      )}
                    >
                      {tx.type === 'deposit' ? (
                        <ArrowDownLeft className="w-4 h-4 md:w-5 md:h-5" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="text-text-primary font-semibold text-sm truncate capitalize">
                          {tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}{' '}
                          <span className="text-text-tertiary font-normal text-xs md:text-sm">
                            via {tx.method}
                          </span>
                        </h5>
                        <div
                          className={clsx(
                            'text-sm md:text-base font-bold tabular-nums font-mono shrink-0',
                            tx.type === 'deposit' ? 'text-success' : 'text-sell',
                          )}
                        >
                          {tx.type === 'deposit' ? '+' : '-'}
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: tx.currency,
                          }).format(tx.amount)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] md:text-xs mt-0.5">
                        <span className="text-text-tertiary">
                          {new Date(tx.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span
                          className={clsx(
                            'px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-tighter text-[9px] md:text-[10px]',
                            tx.status === 'completed'
                              ? 'bg-success/10 text-success'
                              : tx.status === 'pending'
                                ? 'bg-warning/10 text-warning'
                                : tx.status === 'failed'
                                  ? 'bg-sell/10 text-sell'
                                  : 'bg-text-tertiary/10 text-text-tertiary',
                          )}
                        >
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {filteredTx.length > 0 && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="text-xs border border-border-primary bg-bg-secondary text-text-primary rounded-lg px-2 py-1.5 outline-none focus:border-blue-500"
                  >
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={safePage === 1}
                    className="p-1.5 rounded-lg border border-border-primary bg-bg-secondary text-text-secondary disabled:opacity-30 hover:border-blue-500 hover:text-blue-500 transition-all"
                    title="First page"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="p-1.5 rounded-lg border border-border-primary bg-bg-secondary text-text-secondary disabled:opacity-30 hover:border-blue-500 hover:text-blue-500 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Page number pills */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === 'ellipsis' ? (
                        <span key={`e${idx}`} className="px-1 text-text-tertiary text-xs">…</span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setPage(item as number)}
                          className={clsx(
                            'min-w-[28px] h-7 px-1 rounded-lg text-xs font-bold border transition-all',
                            safePage === item
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-border-primary bg-bg-secondary text-text-secondary hover:border-blue-500 hover:text-blue-500',
                          )}
                        >
                          {item}
                        </button>
                      )
                    )}

                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="p-1.5 rounded-lg border border-border-primary bg-bg-secondary text-text-secondary disabled:opacity-30 hover:border-blue-500 hover:text-blue-500 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={safePage === totalPages}
                    className="p-1.5 rounded-lg border border-border-primary bg-bg-secondary text-text-secondary disabled:opacity-30 hover:border-blue-500 hover:text-blue-500 transition-all"
                    title="Last page"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                <span className="text-xs text-text-tertiary whitespace-nowrap">
                  {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredTx.length)} of {filteredTx.length}
                </span>
              </div>
            )}
          </div>

          <div className="bg-bg-secondary/50 border border-border-glass/20 rounded-xl p-4 flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-buy/10 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-buy" />
            </div>
            <div>
              <h5 className="text-text-primary font-bold text-xs uppercase tracking-wide">Processing Time</h5>
              <p className="text-text-tertiary text-[10px] leading-relaxed mt-0.5">
                Withdrawals are typically processed within 24 hours. Most deposits are instant but some bank transfers
                may take up to 3 business days.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowDepositModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-md bg-bg-primary border border-border-primary rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">Make a Deposit</h2>
              <button type="button" onClick={() => setShowDepositModal(false)} className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors">
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary font-bold">$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-4 py-3 rounded-xl border border-border-primary bg-bg-secondary text-text-primary placeholder:text-text-tertiary outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-lg font-mono font-bold"
                />
              </div>
              <div className="flex gap-2 pt-1">
                {[100, 500, 1000, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDepositAmount(String(amt))}
                    className="flex-1 py-1 text-xs font-semibold rounded-lg border border-border-primary bg-bg-secondary text-text-secondary hover:border-blue-500 hover:text-blue-500 transition-colors"
                  >
                    ${amt >= 1000 ? `${amt / 1000}k` : amt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Payment Method</label>
              <div className="grid grid-cols-1 gap-2">
                {DEPOSIT_METHODS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDepositMethod(value)}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                      depositMethod === value
                        ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                        : 'border-border-primary bg-bg-secondary text-text-primary hover:border-blue-500/40',
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-semibold">{label}</span>
                    {depositMethod === value && <span className="ml-auto w-2 h-2 rounded-full bg-blue-500" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {depositMethod.startsWith('crypto') ? 'TX Hash (optional)' : 'Transaction / Reference ID (optional)'}
              </label>
              <input
                type="text"
                value={depositTxId}
                onChange={(e) => setDepositTxId(e.target.value)}
                placeholder={depositMethod.startsWith('crypto') ? '0x...' : 'REF123456'}
                className="w-full px-4 py-3 rounded-xl border border-border-primary bg-bg-secondary text-text-primary placeholder:text-text-tertiary outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 font-mono text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => void submitDeposit()}
              disabled={depositSubmitting || !depositAmount}
              className={clsx(
                'w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-[0.98]',
                depositSubmitting || !depositAmount
                  ? 'bg-bg-secondary text-text-tertiary cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20',
              )}
            >
              {depositSubmitting ? 'Submitting…' : `Submit Deposit${depositAmount ? ` — $${parseFloat(depositAmount || '0').toLocaleString()}` : ''}`}
            </button>

            <p className="text-center text-[11px] text-text-tertiary">
              Deposits are reviewed and typically approved within 24 hours.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
