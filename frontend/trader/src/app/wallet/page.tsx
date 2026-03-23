'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card, StatCard } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import TopBar from '@/components/layout/TopBar';
import api from '@/lib/api/client';

type Tab = 'deposit' | 'withdraw' | 'history';
type Method = 'bank' | 'upi' | 'crypto' | 'card';

interface Transaction {
  id: string;
  created_at: string;
  type: string;
  method: string;
  amount: number;
  status: string;
  currency?: string;
}

interface BankDetails {
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  account_holder: string;
  [key: string]: string;
}

const METHODS: { id: Method; label: string; icon: string }[] = [
  { id: 'bank', label: 'Bank Transfer', icon: '🏦' },
  { id: 'upi', label: 'UPI', icon: '📱' },
  { id: 'crypto', label: 'Crypto', icon: '₿' },
  { id: 'card', label: 'Card', icon: '💳' },
];

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

export default function WalletPage() {
  const [tab, setTab] = useState<Tab>('deposit');
  const [method, setMethod] = useState<Method>('bank');
  const [amount, setAmount] = useState('');
  const [txId, setTxId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [deposits, setDeposits] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Transaction[]>([]);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Receipt file
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Account balance from API
  const [accountBalance, setAccountBalance] = useState<number | null>(null);
  const [primaryAccountId, setPrimaryAccountId] = useState<string | null>(null);
  const [walletSummary, setWalletSummary] = useState<{ balance: number; credit: number; equity: number; total_deposited: number; total_withdrawn: number } | null>(null);

  // Bank details for withdraw
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');

  const fetchAccountBalance = useCallback(async () => {
    try {
      const [acctRes, summaryRes] = await Promise.all([
        api.get<{ items: Array<{ id: string; balance: number; equity: number; is_demo?: boolean }> }>('/accounts'),
        api.get<{ balance: number; equity: number; total_deposited: number; total_withdrawn: number }>('/wallet/summary'),
      ]);
      const items = acctRes.items ?? [];
      if (items.length > 0) {
        const live = items.find((a: any) => !a.is_demo) || items[0];
        setAccountBalance(live.balance);
        setPrimaryAccountId(live.id);
      }
      setWalletSummary(summaryRes);
    } catch {
      try {
        const res = await api.get<{ items: Array<{ id: string; balance: number; equity: number }> }>('/accounts');
        const items = res.items ?? [];
        if (items.length > 0) {
          const live = items.find((a: any) => !a.is_demo) || items[0];
          setAccountBalance(live.balance);
          setPrimaryAccountId(live.id);
        }
      } catch {}
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [depRes, withRes, txRes] = await Promise.all([
        api.get<{ items: Transaction[] }>('/wallet/deposits'),
        api.get<{ items: Transaction[] }>('/wallet/withdrawals'),
        api.get<{ items: Transaction[] }>('/wallet/transactions'),
      ]);
      setDeposits(depRes.items ?? []);
      setWithdrawals(withRes.items ?? []);
      setTransactions(txRes.items ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to load wallet data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBankDetails = useCallback(async () => {
    try {
      const details = await api.post<BankDetails>('/wallet/deposit/bank-details');
      setBankDetails(details);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => { fetchData(); fetchAccountBalance(); }, [fetchData, fetchAccountBalance]);

  useEffect(() => {
    if (tab === 'deposit' && method === 'bank' && !bankDetails) {
      fetchBankDetails();
    }
  }, [tab, method, bankDetails, fetchBankDetails]);

  const totalDeposited = walletSummary?.total_deposited ?? 0;
  const totalWithdrawn = walletSummary?.total_withdrawn ?? 0;

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    try {
      setSubmitting(true);
      if (!primaryAccountId) {
        toast.error('No trading account found');
        return;
      }
      if (tab === 'deposit') {
        await api.post('/wallet/deposit', {
          account_id: primaryAccountId,
          amount: parseFloat(amount),
          method,
          transaction_id: txId || undefined,
          screenshot_url: receiptFile?.name || undefined,
        });
        toast.success(`Deposit request submitted for $${amount}`);
      } else {
        await api.post('/wallet/withdraw', {
          account_id: primaryAccountId,
          amount: parseFloat(amount),
          method,
          bank_details: bankName ? { bank_name: bankName, account_number: accountNumber, ifsc_code: ifscCode } : undefined,
        });
        toast.success(`Withdrawal request submitted for $${amount}`);
      }
      setAmount('');
      setTxId('');
      setReceiptFile(null);
      setBankName('');
      setAccountNumber('');
      setIfscCode('');
      fetchData();
      fetchAccountBalance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs = [
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdraw', label: 'Withdraw' },
    { id: 'history', label: 'History' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-bg-primary">
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
    <div className="flex flex-col h-screen bg-bg-primary">
      <TopBar />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
          <h2 className="text-lg font-semibold text-text-primary">Wallet</h2>

          {error && (
            <div className="bg-sell/10 border border-sell/20 rounded-lg px-4 py-2 text-sm text-sell flex items-center justify-between">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={fetchData}>Retry</Button>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Available Balance" value={fmt(walletSummary?.balance ?? accountBalance ?? 0)} trend={((walletSummary?.balance ?? accountBalance ?? 0) >= 0) ? "up" : "down"} />
            <StatCard label="Credit / Bonus" value={fmt(walletSummary?.credit ?? 0)} />
            <StatCard label="Total Deposits" value={fmt(totalDeposited)} />
            <StatCard label="Total Withdrawals" value={fmt(totalWithdrawn)} />
          </div>

          <Tabs tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} className="mb-2" />

          {tab === 'deposit' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={clsx(
                      'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
                      method === m.id
                        ? 'border-buy bg-buy/5 text-buy glass-light'
                        : 'border-border-glass bg-bg-secondary text-text-secondary hover:border-text-tertiary',
                    )}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className="text-xs font-medium">{m.label}</span>
                  </button>
                ))}
              </div>

              <Card variant="glass" padding="lg">
                {method === 'bank' && bankDetails && (
                  <div className="bg-bg-tertiary rounded-lg p-3 text-xs space-y-2 mb-4 border border-border-glass">
                    {bankDetails.qr_code_url && (
                      <div className="flex justify-center mb-3">
                        <img
                          src={bankDetails.qr_code_url.startsWith('http') ? bankDetails.qr_code_url : `http://localhost:8001${bankDetails.qr_code_url}`}
                          alt="Payment QR"
                          className="w-40 h-40 rounded-lg border border-border-glass object-contain bg-white p-1"
                        />
                      </div>
                    )}
                    {Object.entries(bankDetails)
                      .filter(([key]) => key !== 'qr_code_url' && typeof bankDetails[key] === 'string')
                      .map(([key, val]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-text-tertiary capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-text-primary font-mono">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-text-secondary block mb-1.5 font-medium">Amount (USD)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="skeu-input w-full text-text-primary rounded-xl py-3 px-4"
                    />
                  </div>

                  {method === 'bank' && (
                    <div>
                      <label className="text-xs text-text-secondary block mb-1.5 font-medium">Transaction ID</label>
                      <input
                        type="text"
                        value={txId}
                        onChange={(e) => setTxId(e.target.value)}
                        placeholder="Enter transaction reference"
                        className="skeu-input w-full text-text-primary rounded-xl py-3 px-4"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-text-secondary block mb-1.5 font-medium">Upload Receipt</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setReceiptFile(file);
                      }}
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border-glass rounded-xl p-6 text-center hover:border-buy/40 transition-all cursor-pointer"
                    >
                      {receiptFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm text-buy">✓</span>
                          <span className="text-xs text-text-primary truncate max-w-[200px]">{receiptFile.name}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setReceiptFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                            className="text-xs text-text-tertiary hover:text-sell ml-1"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="text-2xl text-text-tertiary mb-2">↑</div>
                          <p className="text-xs text-text-tertiary">Click to upload receipt</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {['100', '500', '1000', '5000'].map((v) => (
                      <button
                        key={v}
                        onClick={() => setAmount(v)}
                        className="flex-1 py-2 text-xs font-medium rounded-lg border border-border-glass text-text-secondary hover:text-buy hover:border-buy/40 transition-all"
                      >
                        ${v}
                      </button>
                    ))}
                  </div>

                  <Button variant="primary" fullWidth size="lg" onClick={handleSubmit} loading={submitting}>
                    Submit Deposit Request
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {tab === 'withdraw' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={clsx(
                      'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
                      method === m.id
                        ? 'border-buy bg-buy/5 text-buy glass-light'
                        : 'border-border-glass bg-bg-secondary text-text-secondary hover:border-text-tertiary',
                    )}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className="text-xs font-medium">{m.label}</span>
                  </button>
                ))}
              </div>

              <Card variant="glass" padding="lg">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-text-secondary block mb-1.5 font-medium">Amount (USD)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="skeu-input w-full text-text-primary rounded-xl py-3 px-4"
                    />
                  </div>

                  {method === 'bank' && (
                    <>
                      <div>
                        <label className="text-xs text-text-secondary block mb-1.5 font-medium">Bank Name</label>
                        <input
                          type="text"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          placeholder="Enter bank name"
                          className="skeu-input w-full text-text-primary rounded-xl py-3 px-4"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary block mb-1.5 font-medium">Account Number</label>
                        <input
                          type="text"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          placeholder="Enter account number"
                          className="skeu-input w-full text-text-primary rounded-xl py-3 px-4"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary block mb-1.5 font-medium">IFSC Code</label>
                        <input
                          type="text"
                          value={ifscCode}
                          onChange={(e) => setIfscCode(e.target.value)}
                          placeholder="Enter IFSC code"
                          className="skeu-input w-full text-text-primary rounded-xl py-3 px-4"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex gap-3">
                    {['100', '500', '1000', '5000'].map((v) => (
                      <button
                        key={v}
                        onClick={() => setAmount(v)}
                        className="flex-1 py-2 text-xs font-medium rounded-lg border border-border-glass text-text-secondary hover:text-buy hover:border-buy/40 transition-all"
                      >
                        ${v}
                      </button>
                    ))}
                  </div>

                  <Button variant="primary" fullWidth size="lg" onClick={handleSubmit} loading={submitting}>
                    Submit Withdrawal Request
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {tab === 'history' && (() => {
            const allHistory: Transaction[] = [
              ...deposits.map((d) => ({ ...d, _src: 'deposit' as const })),
              ...withdrawals.map((w) => ({ ...w, amount: -Math.abs(w.amount), _src: 'withdrawal' as const })),
              ...transactions.map((t) => ({ ...t, _src: 'transaction' as const })),
            ]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .filter((item, idx, arr) => {
                if ((item as any)._src === 'transaction') {
                  const matchesDeposit = arr.some(
                    (other) => (other as any)._src === 'deposit' && other.type === 'deposit'
                      && Math.abs(other.amount) === Math.abs(item.amount)
                      && Math.abs(new Date(other.created_at).getTime() - new Date(item.created_at).getTime()) < 60000,
                  );
                  const matchesWithdrawal = arr.some(
                    (other) => (other as any)._src === 'withdrawal' && other.type === 'withdrawal'
                      && Math.abs(other.amount) === Math.abs(item.amount)
                      && Math.abs(new Date(other.created_at).getTime() - new Date(item.created_at).getTime()) < 60000,
                  );
                  if ((item.type === 'deposit' && matchesDeposit) || (item.type === 'withdrawal' && matchesWithdrawal)) return false;
                }
                return true;
              });

            function typeLabel(tx: Transaction) {
              const t = tx.type;
              if (t === 'deposit') return 'Deposit';
              if (t === 'withdrawal') return 'Withdrawal';
              if (t === 'adjustment') return tx.amount >= 0 ? 'Fund Added' : 'Fund Deducted';
              if (t === 'credit') return tx.amount >= 0 ? 'Credit Added' : 'Credit Removed';
              if (t === 'commission') return 'Commission';
              if (t === 'swap') return 'Swap';
              if (t === 'bonus') return 'Bonus';
              return t;
            }

            return (
              <Card variant="glass" padding="none">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-glass">
                        <th className="px-4 py-3 text-left text-xs text-text-tertiary font-medium">Date</th>
                        <th className="px-4 py-3 text-left text-xs text-text-tertiary font-medium">Type</th>
                        <th className="px-4 py-3 text-left text-xs text-text-tertiary font-medium">Method</th>
                        <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">Amount</th>
                        <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-tertiary">
                            No transactions yet
                          </td>
                        </tr>
                      ) : (
                        allHistory.map((tx) => (
                          <tr key={`${(tx as any)._src}-${tx.id}`} className="border-b border-border-glass/50 hover:bg-bg-hover/30 transition-all">
                            <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                              {new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-3 text-text-primary text-xs">
                              {typeLabel(tx)}
                            </td>
                            <td className="px-4 py-3 text-text-secondary text-xs capitalize">
                              {tx.method === 'admin' ? 'Admin' : tx.method?.replace(/_/g, ' ') || '—'}
                            </td>
                            <td className={clsx(
                              'px-4 py-3 text-right text-xs font-mono tabular-nums font-medium',
                              tx.amount >= 0 ? 'text-buy' : 'text-sell',
                            )}>
                              {tx.amount >= 0 ? '+' : '-'}${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={clsx(
                                'inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-sm',
                                tx.status?.toLowerCase() === 'completed' || tx.status?.toLowerCase() === 'approved'
                                  ? 'bg-success/15 text-success'
                                  : tx.status?.toLowerCase() === 'rejected' ? 'bg-sell/15 text-sell'
                                  : tx.status?.toLowerCase() === 'pending' ? 'bg-warning/15 text-warning'
                                  : 'bg-success/15 text-success',
                              )}>
                                {tx.status === 'completed' || tx.type === 'adjustment' || tx.type === 'credit' ? 'Completed' : tx.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
