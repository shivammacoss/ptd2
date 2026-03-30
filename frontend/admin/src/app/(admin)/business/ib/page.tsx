'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle, XCircle, Users, RefreshCw, Edit, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

interface IBApplication {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  status: string;
  created_at: string;
  application_data?: any;
}

interface IBAgent {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  referral_code: string;
  referral_count: number;
  total_earned: number;
  pending_payout: number;
  level: number;
  is_active: boolean;
  commission_plan_id?: string;
  custom_commission_per_lot?: number;
  custom_commission_per_trade?: number;
  created_at: string;
}

interface CommissionPlan {
  id: string;
  name: string;
  is_default: boolean;
  commission_per_lot: number;
  commission_per_trade: number;
  spread_share_pct: number;
  cpa_per_deposit: number;
  mlm_levels: number;
  mlm_distribution: number[];
}

type Tab = 'applications' | 'active';

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function IBPage() {
  const [tab, setTab] = useState<Tab>('applications');
  const [applications, setApplications] = useState<IBApplication[]>([]);
  const [agents, setAgents] = useState<IBAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveModal, setApproveModal] = useState<IBApplication | null>(null);
  const [rejectModal, setRejectModal] = useState<IBApplication | null>(null);
  const [editCommissionModal, setEditCommissionModal] = useState<IBAgent | null>(null);
  const [rejectAgentModal, setRejectAgentModal] = useState<IBAgent | null>(null);
  const [commissionPlansModal, setCommissionPlansModal] = useState(false);
  const [commissionPlans, setCommissionPlans] = useState<CommissionPlan[]>([]);
  const [commissionPlan, setCommissionPlan] = useState('default');
  const [customPerLot, setCustomPerLot] = useState('');
  const [customPerTrade, setCustomPerTrade] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'applications') {
        const res = await adminApi.get<{ items: IBApplication[] }>('/business/ib/applications', { status: 'pending' });
        setApplications(res.items || []);
      } else {
        const res = await adminApi.get<{ items: IBAgent[] }>('/business/ib/agents');
        setAgents(res.items || []);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const fetchCommissionPlans = useCallback(async () => {
    try {
      const res = await adminApi.get<{ items: CommissionPlan[] }>('/business/ib/commission-plans');
      setCommissionPlans(res.items || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load commission plans');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCommissionPlans(); }, [fetchCommissionPlans]);

  const handleApprove = async () => {
    if (!approveModal) return;
    setSubmitting(true);
    try {
      const body: any = { commission_plan: commissionPlan };
      if (commissionPlan === 'custom') {
        if (customPerLot) body.custom_per_lot = parseFloat(customPerLot);
        if (customPerTrade) body.custom_per_trade = parseFloat(customPerTrade);
      }
      await adminApi.post(`/business/ib/applications/${approveModal.id}/approve`, body);
      toast.success('Application approved');
      setApproveModal(null);
      setCommissionPlan('default');
      setCustomPerLot('');
      setCustomPerTrade('');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setSubmitting(true);
    try {
      await adminApi.post(`/business/ib/applications/${rejectModal.id}/reject`, { reason: rejectReason });
      toast.success('Application rejected');
      setRejectModal(null);
      setRejectReason('');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reject');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCommission = async () => {
    if (!editCommissionModal) return;
    setSubmitting(true);
    try {
      const body: any = {};
      if (commissionPlan === 'default' || commissionPlan) {
        body.commission_plan_id = commissionPlan === 'default' ? null : commissionPlan;
      }
      if (commissionPlan === 'custom') {
        if (customPerLot) body.custom_commission_per_lot = parseFloat(customPerLot);
        if (customPerTrade) body.custom_commission_per_trade = parseFloat(customPerTrade);
      }
      await adminApi.put(`/business/ib/agents/${editCommissionModal.id}/commission`, body);
      toast.success('Commission updated successfully');
      setEditCommissionModal(null);
      setCommissionPlan('default');
      setCustomPerLot('');
      setCustomPerTrade('');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update commission');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectAgent = async () => {
    if (!rejectAgentModal) return;
    setSubmitting(true);
    try {
      await adminApi.post(`/business/ib/agents/${rejectAgentModal.id}/reject`, { reason: rejectReason });
      toast.success('IB rejected successfully');
      setRejectAgentModal(null);
      setRejectReason('');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reject IB');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">IB Management</h1>
            <p className="text-xxs text-text-tertiary mt-0.5">Manage Introducing Broker applications and active agents</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCommissionPlansModal(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border-primary text-text-secondary hover:bg-bg-hover transition-fast">
              <Settings size={14} />
              Commission Plans
            </button>
            <button onClick={fetchData} className="p-1.5 rounded-md border border-border-primary text-text-secondary hover:bg-bg-hover transition-fast">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-md">
          <div className="flex gap-1 p-1 border-b border-border-primary">
            {([['applications', 'Applications'], ['active', 'Active IBs']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-fast',
                  tab === id
                    ? 'bg-bg-hover text-text-primary border border-border-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/60',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-text-tertiary" />
              </div>
            ) : tab === 'applications' ? (
              applications.length === 0 ? (
                <div className="text-center text-xs text-text-tertiary py-12">No pending applications</div>
              ) : (
                <div className="border border-border-primary rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead>
                        <tr className="border-b border-border-primary bg-bg-tertiary/40">
                          {['Name', 'Email', 'Status', 'Applied', 'Actions'].map((col) => (
                            <th key={col} className={cn('text-left px-4 py-2.5 text-xxs font-medium text-text-tertiary uppercase tracking-wide', col === 'Actions' && 'text-right')}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {applications.map((app) => (
                          <tr key={app.id} className="border-b border-border-primary/50 transition-fast hover:bg-bg-hover">
                            <td className="px-4 py-2.5 text-xs text-text-primary">{app.user_name || '—'}</td>
                            <td className="px-4 py-2.5 text-xs text-text-secondary">{app.user_email}</td>
                            <td className="px-4 py-2.5"><span className="text-xxs px-1.5 py-0.5 rounded-sm bg-warning/15 text-warning font-medium">{app.status}</span></td>
                            <td className="px-4 py-2.5 text-xs text-text-tertiary">{app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'}</td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setApproveModal(app)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xxs font-medium bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-fast"
                                >
                                  <CheckCircle size={12} /> Approve
                                </button>
                                <button
                                  onClick={() => setRejectModal(app)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xxs font-medium bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-fast"
                                >
                                  <XCircle size={12} /> Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : agents.length === 0 ? (
              <div className="text-center text-xs text-text-tertiary py-12">No active IBs</div>
            ) : (
              <div className="border border-border-primary rounded-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px]">
                    <thead>
                      <tr className="border-b border-border-primary bg-bg-tertiary/40">
                        {['Name', 'Referral Code', 'Level', 'Referrals', 'Total Earned', 'Pending', 'Joined', 'Actions'].map((col) => (
                          <th key={col} className={cn('text-left px-4 py-2.5 text-xxs font-medium text-text-tertiary uppercase tracking-wide', ['Total Earned', 'Pending'].includes(col) && 'text-right', col === 'Actions' && 'text-right')}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((agent) => (
                        <tr key={agent.id} className="border-b border-border-primary/50 transition-fast hover:bg-bg-hover">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Users size={12} className="text-text-tertiary" />
                              <span className="text-xs text-text-primary">{agent.user_name}</span>
                            </div>
                            <p className="text-xxs text-text-tertiary mt-0.5">{agent.user_email}</p>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-buy font-mono tabular-nums">{agent.referral_code}</td>
                          <td className="px-4 py-2.5 text-xs text-text-primary">L{agent.level}</td>
                          <td className="px-4 py-2.5 text-xs text-text-primary font-mono tabular-nums">{agent.referral_count}</td>
                          <td className="px-4 py-2.5 text-xs text-success text-right font-mono tabular-nums">${formatMoney(agent.total_earned)}</td>
                          <td className="px-4 py-2.5 text-xs text-warning text-right font-mono tabular-nums">${formatMoney(agent.pending_payout)}</td>
                          <td className="px-4 py-2.5 text-xs text-text-tertiary">{agent.created_at ? new Date(agent.created_at).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditCommissionModal(agent);
                                  setCommissionPlan(agent.commission_plan_id || 'default');
                                  setCustomPerLot(agent.custom_commission_per_lot?.toString() || '');
                                  setCustomPerTrade(agent.custom_commission_per_trade?.toString() || '');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xxs font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-fast"
                              >
                                <Edit size={12} /> Edit
                              </button>
                              <button
                                onClick={() => setRejectAgentModal(agent)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xxs font-medium bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-fast"
                              >
                                <XCircle size={12} /> Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      {approveModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setApproveModal(null)}>
          <div className="bg-bg-secondary border border-border-primary rounded-md shadow-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-primary">
              <h3 className="text-sm font-semibold text-text-primary">Approve IB Application</h3>
              <p className="text-xxs text-text-tertiary mt-0.5">{approveModal.user_name} — {approveModal.user_email}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xxs text-text-tertiary mb-1">Commission Plan</label>
                <select value={commissionPlan} onChange={(e) => setCommissionPlan(e.target.value)} className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md">
                  <option value="default">Default</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              {commissionPlan === 'custom' && (
                <>
                  <div>
                    <label className="block text-xxs text-text-tertiary mb-1">Custom Rate Per Lot ($)</label>
                    <input type="number" step="0.01" value={customPerLot} onChange={(e) => setCustomPerLot(e.target.value)} placeholder="e.g. 5.00" className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md" />
                  </div>
                  <div>
                    <label className="block text-xxs text-text-tertiary mb-1">Custom Rate Per Trade ($)</label>
                    <input type="number" step="0.01" value={customPerTrade} onChange={(e) => setCustomPerTrade(e.target.value)} placeholder="e.g. 2.00" className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md" />
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border-primary flex justify-end gap-2">
              <button onClick={() => setApproveModal(null)} className="px-3 py-1.5 rounded-md text-xs text-text-secondary border border-border-primary hover:bg-bg-hover transition-fast">Cancel</button>
              <button onClick={handleApprove} disabled={submitting} className="px-3 py-1.5 rounded-md text-xs font-medium bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-fast disabled:opacity-50">
                {submitting ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-bg-secondary border border-border-primary rounded-md shadow-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-primary">
              <h3 className="text-sm font-semibold text-text-primary">Reject IB Application</h3>
              <p className="text-xxs text-text-tertiary mt-0.5">{rejectModal.user_name} — {rejectModal.user_email}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xxs text-text-tertiary mb-1">Rejection Reason</label>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Provide a reason for rejection..." className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md resize-none" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border-primary flex justify-end gap-2">
              <button onClick={() => setRejectModal(null)} className="px-3 py-1.5 rounded-md text-xs text-text-secondary border border-border-primary hover:bg-bg-hover transition-fast">Cancel</button>
              <button onClick={handleReject} disabled={submitting || !rejectReason.trim()} className="px-3 py-1.5 rounded-md text-xs font-medium bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-fast disabled:opacity-50">
                {submitting ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Commission Modal */}
      {editCommissionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditCommissionModal(null)}>
          <div className="bg-bg-secondary border border-border-primary rounded-md shadow-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-primary">
              <h3 className="text-sm font-semibold text-text-primary">Edit IB Commission</h3>
              <p className="text-xxs text-text-tertiary mt-0.5">{editCommissionModal.user_name} — {editCommissionModal.user_email}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xxs text-text-tertiary mb-1">Commission Plan</label>
                <select value={commissionPlan} onChange={(e) => setCommissionPlan(e.target.value)} className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md">
                  <option value="default">Default Plan</option>
                  {commissionPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                  <option value="custom">Custom Rates</option>
                </select>
              </div>
              {commissionPlan === 'custom' && (
                <>
                  <div>
                    <label className="block text-xxs text-text-tertiary mb-1">Custom Rate Per Lot ($)</label>
                    <input type="number" step="0.01" value={customPerLot} onChange={(e) => setCustomPerLot(e.target.value)} placeholder="e.g. 5.00" className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md" />
                  </div>
                  <div>
                    <label className="block text-xxs text-text-tertiary mb-1">Custom Rate Per Trade ($)</label>
                    <input type="number" step="0.01" value={customPerTrade} onChange={(e) => setCustomPerTrade(e.target.value)} placeholder="e.g. 2.00" className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md" />
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border-primary flex justify-end gap-2">
              <button onClick={() => setEditCommissionModal(null)} className="px-3 py-1.5 rounded-md text-xs text-text-secondary border border-border-primary hover:bg-bg-hover transition-fast">Cancel</button>
              <button onClick={handleEditCommission} disabled={submitting} className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-fast disabled:opacity-50">
                {submitting ? 'Updating...' : 'Update Commission'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Agent Modal */}
      {rejectAgentModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setRejectAgentModal(null)}>
          <div className="bg-bg-secondary border border-border-primary rounded-md shadow-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-primary">
              <h3 className="text-sm font-semibold text-text-primary">Reject Active IB</h3>
              <p className="text-xxs text-text-tertiary mt-0.5">{rejectAgentModal.user_name} — {rejectAgentModal.user_email}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xxs text-text-tertiary mb-1">Rejection Reason</label>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Provide a reason for rejecting this IB..." className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md resize-none" />
              </div>
              <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
                <p className="text-xxs text-warning">⚠️ This will deactivate the IB and change their role back to regular user.</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border-primary flex justify-end gap-2">
              <button onClick={() => setRejectAgentModal(null)} className="px-3 py-1.5 rounded-md text-xs text-text-secondary border border-border-primary hover:bg-bg-hover transition-fast">Cancel</button>
              <button onClick={handleRejectAgent} disabled={submitting || !rejectReason.trim()} className="px-3 py-1.5 rounded-md text-xs font-medium bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-fast disabled:opacity-50">
                {submitting ? 'Rejecting...' : 'Reject IB'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
