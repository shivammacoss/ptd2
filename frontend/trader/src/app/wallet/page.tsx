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

const RECENT_LIMIT = 8;

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllTx, setShowAllTx] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('bank_transfer');
  const [withdrawing, setWithdrawing] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const loadGen = useRef(0);
  const fundingRef = useRef<HTMLDivElement>(null);

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
        api.get<{ items?: Array<{ id?: string; currency?: string; is_demo?: boolean; balance?: number; margin_used?: number }> }>('/accounts'),
      ]);

      if (id !== loadGen.current) return;

      let currency = 'USD';
      let balance = 0;
      let totalDeposited = 0;
      let totalWithdrawn = 0;

      if (accountsRes.status === 'fulfilled') {
        const items = accountsRes.value?.items || [];
        setAccounts(items.filter((a) => !a.is_demo));
        const live = items.find((a) => a.is_demo === false) || items[0];
        currency = live?.currency || 'USD';
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

  const visibleTx = showAllTx ? transactions : transactions.slice(0, RECENT_LIMIT);

  const scrollToFunding = () => {
    fundingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const liveAccount = accounts.find((a) => !a.is_demo);
    if (!liveAccount) {
      toast.error('No live account found');
      return;
    }

    setWithdrawing(true);
    try {
      await api.post('/wallet/withdraw', {
        account_id: liveAccount.id,
        amount: parseFloat(withdrawAmount),
        method: withdrawMethod,
      });
      
      toast.success('Withdrawal request submitted successfully!');
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      void fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to submit withdrawal');
    } finally {
      setWithdrawing(false);
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
                  onClick={scrollToFunding}
                  className="flex-1 md:flex-none h-11 md:h-12 px-5 md:px-8 bg-white text-[#2563EB] hover:bg-white/90 font-bold rounded-xl gap-2 shadow-xl shadow-black/10 active:scale-95 transition-transform"
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5" /> Deposit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowWithdrawModal(true)}
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
              onClick={() => toast.success('Submit a deposit from the app or contact support for card deposits.')}
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
              onClick={() => toast.success('Crypto deposits: use USDT / BTC / ETH — details from your broker.')}
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
            <div className="flex items-center justify-between">
              <h3 className="text-base md:text-lg font-bold text-text-primary flex items-center gap-2">
                <History className="w-5 h-5 text-buy" />
                Recent History
              </h3>
              {transactions.length > RECENT_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllTx((v) => !v)}
                  className="text-buy text-xs md:text-sm font-semibold hover:underline px-2 py-1 rounded hover:bg-buy/5 transition-colors"
                >
                  {showAllTx ? 'Show less' : 'View all'}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {!transactions.length ? (
                <div className="glass-card py-12 text-center border-dashed border-border-glass/40">
                  <div className="w-12 h-12 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-text-tertiary opacity-30" />
                  </div>
                  <p className="text-text-tertiary text-sm">No recent transactions</p>
                </div>
              ) : (
                visibleTx.map((tx) => (
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

      {/* Withdrawal Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowWithdrawModal(false)}>
          <div className="w-full max-w-md bg-bg-secondary border border-border-glass rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-glass bg-bg-tertiary/50">
              <h3 className="text-lg font-bold text-text-primary">Withdraw Funds</h3>
              <button onClick={() => setShowWithdrawModal(false)} className="p-2 rounded-lg hover:bg-bg-hover transition-colors">
                <svg className="w-5 h-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Amount</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-4 py-3 bg-bg-tertiary border border-border-glass rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-buy/50"
                />
                <p className="text-xs text-text-tertiary mt-1">Available: {fmt(wallet?.balance || 0)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Withdrawal Method</label>
                <select
                  value={withdrawMethod}
                  onChange={(e) => setWithdrawMethod(e.target.value)}
                  className="w-full px-4 py-3 bg-bg-tertiary border border-border-glass rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-buy/50"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="crypto_usdt">USDT (Crypto)</option>
                  <option value="crypto_btc">Bitcoin</option>
                  <option value="crypto_eth">Ethereum</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-border-glass text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawing}
                  className="flex-1 px-4 py-3 rounded-xl bg-buy text-white font-semibold hover:bg-buy/90 disabled:opacity-50 transition-colors"
                >
                  {withdrawing ? 'Processing...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
