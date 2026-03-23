'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';

type TabId = 'deposits' | 'withdrawals';
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

interface Deposit {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  amount: number;
  currency: string;
  method: string;
  transaction_id: string;
  screenshot_url: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  note?: string;
  reason?: string;
}

interface Withdrawal {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  amount: number;
  currency: string;
  method: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  note?: string;
  reason?: string;
}

interface ActionModal {
  type: 'approve' | 'reject';
  target: 'deposit' | 'withdrawal';
  id: string;
  userName: string;
  amount: number;
}

const TABS: { id: TabId; label: string; icon: typeof ArrowDownCircle }[] = [
  { id: 'deposits', label: 'Deposits', icon: ArrowDownCircle },
  { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpCircle },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function statusBadge(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-success/15 text-success';
    case 'rejected':
      return 'bg-danger/15 text-danger';
    case 'pending':
      return 'bg-warning/15 text-warning';
    default:
      return 'bg-text-tertiary/15 text-text-tertiary';
  }
}

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PAGE_SIZE = 20;

export default function DepositsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('deposits');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [page, setPage] = useState(1);

  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositsTotal, setDepositsTotal] = useState(0);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawalsTotal, setWithdrawalsTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actionModal, setActionModal] = useState<ActionModal | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(page),
        per_page: String(PAGE_SIZE),
      };

      let endpoint: string;
      if (statusFilter === 'pending') {
        endpoint = '/finance/deposits/pending';
      } else {
        endpoint = '/finance/deposits';
        if (statusFilter !== 'all') params.status = statusFilter;
      }

      const res = await adminApi.get<{ items: Deposit[]; total: number }>(
        endpoint,
        params,
      );
      setDeposits(res.items || []);
      setDepositsTotal(res.total || 0);
    } catch (e: any) {
      setError(e.message);
      setDeposits([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  const fetchWithdrawals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(page),
        per_page: String(PAGE_SIZE),
      };

      let endpoint: string;
      if (statusFilter === 'pending') {
        endpoint = '/finance/withdrawals/pending';
      } else {
        endpoint = '/finance/withdrawals';
        if (statusFilter !== 'all') params.status = statusFilter;
      }

      const res = await adminApi.get<{ items: Withdrawal[]; total: number }>(
        endpoint,
        params,
      );
      setWithdrawals(res.items || []);
      setWithdrawalsTotal(res.total || 0);
    } catch (e: any) {
      setError(e.message);
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    if (activeTab === 'deposits') fetchDeposits();
    else fetchWithdrawals();
  }, [activeTab, fetchDeposits, fetchWithdrawals]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, statusFilter]);

  const handleAction = async () => {
    if (!actionModal) return;
    if (actionModal.type === 'reject' && !actionReason.trim()) {
      toast.error('Reason is required for rejection');
      return;
    }

    setActionLoading(true);
    try {
      const basePath =
        actionModal.target === 'deposit'
          ? `/finance/deposits/${actionModal.id}`
          : `/finance/withdrawals/${actionModal.id}`;

      if (actionModal.type === 'approve') {
        await adminApi.post(`${basePath}/approve`, {
          note: actionNote.trim() || undefined,
        });
        toast.success('Approved successfully');
      } else {
        await adminApi.post(`${basePath}/reject`, {
          reason: actionReason.trim(),
        });
        toast.success('Rejected successfully');
      }

      setActionModal(null);
      setActionNote('');
      setActionReason('');

      if (activeTab === 'deposits') fetchDeposits();
      else fetchWithdrawals();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const currentItems = activeTab === 'deposits' ? deposits : withdrawals;
  const currentTotal = activeTab === 'deposits' ? depositsTotal : withdrawalsTotal;
  const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE));

  return (
    <>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Deposits & Withdrawals</h1>
          <p className="text-xxs text-text-tertiary mt-0.5">
            Review and manage funding requests
          </p>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-md">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-border-primary">
            <div className="flex gap-1 p-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-fast',
                      activeTab === t.id
                        ? 'bg-bg-hover text-text-primary border border-border-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/60',
                    )}
                  >
                    <Icon size={13} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Status filter */}
            <div className="pr-3 flex items-center gap-2">
              <span className="text-xxs text-text-tertiary">Status:</span>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="text-xs py-1 pl-2 pr-7 appearance-none bg-bg-input border border-border-primary rounded-md text-text-primary"
                >
                  {STATUS_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary"
                />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-text-tertiary" />
              </div>
            ) : error ? (
              <div className="text-center py-16 text-xs text-danger">{error}</div>
            ) : currentItems.length === 0 ? (
              <div className="text-center py-16 text-xs text-text-tertiary">
                No {activeTab} found
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  {activeTab === 'deposits' ? (
                    <table className="w-full min-w-[1000px]">
                      <thead>
                        <tr className="border-b border-border-primary bg-bg-tertiary/40">
                          {[
                            'ID',
                            'User',
                            'Amount',
                            'Method',
                            'Transaction ID',
                            'Screenshot',
                            'Status',
                            'Date',
                            'Actions',
                          ].map((col) => (
                            <th
                              key={col}
                              className={cn(
                                'text-left px-4 py-2.5 text-xxs font-medium text-text-tertiary uppercase tracking-wide',
                                col === 'Amount' && 'text-right',
                                col === 'Actions' && 'text-right',
                              )}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {deposits.map((d) => (
                          <tr
                            key={d.id}
                            className="border-b border-border-primary/50 transition-fast hover:bg-bg-hover"
                          >
                            <td className="px-4 py-2.5 text-xs text-text-secondary font-mono tabular-nums">
                              {d.id}
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="text-xs text-text-primary">{d.user_name}</p>
                              <p className="text-xxs text-text-tertiary">{d.user_email}</p>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-text-primary text-right font-mono tabular-nums">
                              ${formatMoney(d.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-text-secondary">{d.method}</td>
                            <td className="px-4 py-2.5 text-xs text-text-secondary font-mono tabular-nums">
                              {d.transaction_id}
                            </td>
                            <td className="px-4 py-2.5">
                              {d.screenshot_url ? (
                                <a
                                  href={d.screenshot_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-buy hover:underline transition-fast"
                                >
                                  View
                                  <ExternalLink size={11} />
                                </a>
                              ) : (
                                <span className="text-xxs text-text-tertiary">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={cn(
                                  'inline-flex px-1.5 py-0.5 rounded-sm text-xxs font-medium capitalize',
                                  statusBadge(d.status),
                                )}
                              >
                                {d.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-text-tertiary font-mono tabular-nums whitespace-nowrap">
                              {formatDate(d.created_at)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {d.status === 'pending' && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActionModal({
                                        type: 'approve',
                                        target: 'deposit',
                                        id: d.id,
                                        userName: d.user_name,
                                        amount: d.amount,
                                      })
                                    }
                                    className="px-2 py-1 rounded-md text-xxs font-medium bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-fast"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActionModal({
                                        type: 'reject',
                                        target: 'deposit',
                                        id: d.id,
                                        userName: d.user_name,
                                        amount: d.amount,
                                      })
                                    }
                                    className="px-2 py-1 rounded-md text-xxs font-medium bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-fast"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full min-w-[1000px]">
                      <thead>
                        <tr className="border-b border-border-primary bg-bg-tertiary/40">
                          {[
                            'ID',
                            'User',
                            'Amount',
                            'Method',
                            'Bank Details',
                            'Status',
                            'Date',
                            'Actions',
                          ].map((col) => (
                            <th
                              key={col}
                              className={cn(
                                'text-left px-4 py-2.5 text-xxs font-medium text-text-tertiary uppercase tracking-wide',
                                col === 'Amount' && 'text-right',
                                col === 'Actions' && 'text-right',
                              )}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {withdrawals.map((w) => (
                          <tr
                            key={w.id}
                            className="border-b border-border-primary/50 transition-fast hover:bg-bg-hover"
                          >
                            <td className="px-4 py-2.5 text-xs text-text-secondary font-mono tabular-nums">
                              {w.id}
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="text-xs text-text-primary">{w.user_name}</p>
                              <p className="text-xxs text-text-tertiary">{w.user_email}</p>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-sell text-right font-mono tabular-nums">
                              -${formatMoney(w.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-text-secondary">{w.method}</td>
                            <td className="px-4 py-2.5">
                              <p className="text-xs text-text-primary">{w.bank_name}</p>
                              <p className="text-xxs text-text-tertiary font-mono">
                                {w.account_number} · {w.ifsc_code}
                              </p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={cn(
                                  'inline-flex px-1.5 py-0.5 rounded-sm text-xxs font-medium capitalize',
                                  statusBadge(w.status),
                                )}
                              >
                                {w.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-text-tertiary font-mono tabular-nums whitespace-nowrap">
                              {formatDate(w.created_at)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {w.status === 'pending' && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActionModal({
                                        type: 'approve',
                                        target: 'withdrawal',
                                        id: w.id,
                                        userName: w.user_name,
                                        amount: w.amount,
                                      })
                                    }
                                    className="px-2 py-1 rounded-md text-xxs font-medium bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-fast"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActionModal({
                                        type: 'reject',
                                        target: 'withdrawal',
                                        id: w.id,
                                        userName: w.user_name,
                                        amount: w.amount,
                                      })
                                    }
                                    className="px-2 py-1 rounded-md text-xxs font-medium bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-fast"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-border-primary flex items-center justify-between">
                    <p className="text-xxs text-text-tertiary">
                      Showing {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, currentTotal)} of {currentTotal}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="p-1.5 rounded-md border border-border-primary text-text-secondary hover:bg-bg-hover disabled:opacity-30 disabled:pointer-events-none transition-fast"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="px-2 text-xs text-text-secondary font-mono tabular-nums">
                        {page} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="p-1.5 rounded-md border border-border-primary text-text-secondary hover:bg-bg-hover disabled:opacity-30 disabled:pointer-events-none transition-fast"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-bg-secondary border border-border-primary rounded-md shadow-modal animate-fade-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
              <h2 className="text-sm font-semibold text-text-primary capitalize">
                {actionModal.type} {actionModal.target}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setActionModal(null);
                  setActionNote('');
                  setActionReason('');
                }}
                className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-fast"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="p-3 rounded-md bg-bg-tertiary border border-border-primary">
                <p className="text-xxs text-text-tertiary">User</p>
                <p className="text-xs text-text-primary font-medium">{actionModal.userName}</p>
                <p className="text-xxs text-text-tertiary mt-2">Amount</p>
                <p className="text-sm text-text-primary font-mono tabular-nums">
                  ${formatMoney(actionModal.amount)}
                </p>
              </div>

              {actionModal.type === 'approve' ? (
                <div>
                  <label className="block text-xxs text-text-tertiary mb-1">
                    Note (optional)
                  </label>
                  <textarea
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    rows={3}
                    placeholder="Add an optional note..."
                    className="w-full px-3 py-2 text-xs bg-bg-input border border-border-primary rounded-md placeholder:text-text-tertiary transition-fast focus:border-buy resize-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xxs text-text-tertiary mb-1">
                    Reason <span className="text-danger">*</span>
                  </label>
                  <textarea
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    rows={3}
                    placeholder="Provide a reason for rejection..."
                    className="w-full px-3 py-2 text-xs bg-bg-input border border-border-primary rounded-md placeholder:text-text-tertiary transition-fast focus:border-buy resize-none"
                  />
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-border-primary flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionModal(null);
                  setActionNote('');
                  setActionReason('');
                }}
                className="px-3 py-1.5 text-xs text-text-secondary border border-border-primary rounded-md hover:bg-bg-hover transition-fast"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleAction}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-fast inline-flex items-center gap-1.5',
                  actionModal.type === 'approve'
                    ? 'bg-success text-white hover:bg-success/80'
                    : 'bg-danger text-white hover:bg-danger/80',
                  actionLoading && 'opacity-50 pointer-events-none',
                )}
              >
                {actionLoading && <Loader2 size={12} className="animate-spin" />}
                {actionModal.type === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
