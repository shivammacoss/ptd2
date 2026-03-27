'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTradingStore } from '@/stores/tradingStore';
import { clsx } from 'clsx';
import api from '@/lib/api/client';
import toast from 'react-hot-toast';
import { sounds, unlockAudio } from '@/lib/sounds';
import { RefreshCw, Download, Pencil, Check, X } from 'lucide-react';

interface ClosedTrade {
  id: string;
  symbol: string;
  side: string;
  lots: number;
  open_price: number;
  close_price: number;
  pnl: number;
  commission: number;
  swap: number;
  close_time: string;
  close_reason?: string;
}

type CloseModal = { id: string; symbol: string; side: string; lots: number; closeLots: string } | null;
type SltpEdit = { positionId: string; sl: string; tp: string } | null;

type TabId = 'open' | 'pending' | 'history';

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (c: string | number) => {
    const s = String(c);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const body = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PositionsPanel() {
  const {
    positions,
    pendingOrders,
    activeAccount,
    accounts,
    removePosition,
    refreshPositions,
    refreshAccount,
    instruments,
  } = useTradingStore();
  const [activeTab, setActiveTab] = useState<TabId>('open');
  const [historyTrades, setHistoryTrades] = useState<ClosedTrade[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [closeModal, setCloseModal] = useState<CloseModal>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toolbarBusy, setToolbarBusy] = useState(false);
  const [sltpEdit, setSltpEdit] = useState<SltpEdit>(null);
  const [sltpSaving, setSltpSaving] = useState(false);

  const totalPnl = positions.reduce((s, p) => s + (p.profit || 0), 0);

  const getDigits = (symbol: string) => {
    const inst = instruments.find((i) => i.symbol === symbol);
    return inst?.digits ?? 5;
  };

  const accountLabel = (accountId: string) => {
    const a = accounts.find((x) => x.id === accountId);
    return a?.account_number ?? accountId.slice(0, 8);
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get<{ items?: ClosedTrade[] } | ClosedTrade[]>('/portfolio/trades', {
        page: '1',
        per_page: '200',
      });
      setHistoryTrades(
        (res && typeof res === 'object' && 'items' in res ? res.items : Array.isArray(res) ? res : []) || [],
      );
    } catch {
      setHistoryTrades([]);
    }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'history') void loadHistory();
  }, [activeTab, loadHistory]);

  const closePosition = async (id: string, lots?: number) => {
    unlockAudio();
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {};
      if (lots) body.lots = lots;
      const res = await api.post<{ profit?: number; close_price?: number; remaining_lots?: number }>(
        `/positions/${id}/close`,
        body,
      );
      const pnl = res.profit ?? 0;
      pnl >= 0 ? sounds.profit() : sounds.loss();
      if (res.remaining_lots && res.remaining_lots > 0) {
        toast.success(
          `Partial close @ ${res.close_price} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | ${res.remaining_lots} lots remaining`,
        );
        refreshPositions();
      } else {
        removePosition(id);
        toast.success(`Closed @ ${res.close_price} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
      }
      refreshAccount();
      setCloseModal(null);
      void loadHistory();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setSubmitting(false);
    }
  };

  const saveSltpEdit = async () => {
    if (!sltpEdit) return;
    setSltpSaving(true);
    try {
      const body: Record<string, unknown> = {};
      const slVal = sltpEdit.sl.trim();
      const tpVal = sltpEdit.tp.trim();
      if (slVal !== '' && slVal !== '—') body.stop_loss = parseFloat(slVal);
      if (tpVal !== '' && tpVal !== '—') body.take_profit = parseFloat(tpVal);
      await api.put(`/positions/${sltpEdit.positionId}`, body);
      toast.success('SL/TP updated');
      setSltpEdit(null);
      refreshPositions();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update SL/TP');
    } finally {
      setSltpSaving(false);
    }
  };

  const handleRefresh = async () => {
    setToolbarBusy(true);
    try {
      if (activeTab === 'history') {
        await loadHistory();
        toast.success('History updated');
      } else {
        await refreshPositions();
        await refreshAccount();
        toast.success('Updated');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setToolbarBusy(false);
    }
  };

  const exportOpenCsv = () => {
    const rows: (string | number)[][] = [
      ['Account', 'Symbol', 'Side', 'Qty', 'Open Price', 'Current', 'P&L', 'SL', 'TP'],
    ];
    for (const pos of positions) {
      const d = getDigits(pos.symbol);
      rows.push([
        accountLabel(pos.account_id),
        pos.symbol,
        pos.side,
        pos.lots,
        pos.open_price.toFixed(d),
        (pos.current_price ?? '').toString() ? Number(pos.current_price).toFixed(d) : '',
        pos.profit,
        pos.stop_loss != null ? pos.stop_loss : '',
        pos.take_profit != null ? pos.take_profit : '',
      ]);
    }
    downloadCsv(`open-positions-${Date.now()}.csv`, rows);
    toast.success('CSV downloaded');
  };

  const exportPendingCsv = () => {
    const rows: (string | number)[][] = [
      ['Account', 'Symbol', 'Side', 'Type', 'Qty', 'Price', 'SL', 'TP'],
    ];
    for (const o of pendingOrders) {
      const d = getDigits(o.symbol);
      rows.push([
        accountLabel(o.account_id),
        o.symbol,
        o.side,
        o.order_type,
        o.lots,
        o.price.toFixed(d),
        o.stop_loss != null ? o.stop_loss : '',
        o.take_profit != null ? o.take_profit : '',
      ]);
    }
    downloadCsv(`pending-orders-${Date.now()}.csv`, rows);
    toast.success('CSV downloaded');
  };

  const exportHistoryCsv = () => {
    const rows: (string | number)[][] = [
      ['Symbol', 'Side', 'Qty', 'Open Price', 'Close Price', 'P&L', 'Closed At'],
    ];
    for (const t of historyTrades) {
      const d = getDigits(t.symbol);
      rows.push([
        t.symbol,
        t.side,
        t.lots,
        t.open_price.toFixed(d),
        t.close_price.toFixed(d),
        t.pnl,
        t.close_time,
      ]);
    }
    downloadCsv(`trade-history-${Date.now()}.csv`, rows);
    toast.success('CSV downloaded');
  };

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'open', label: 'Open', count: positions.length },
    { id: 'pending', label: 'Pending', count: pendingOrders.length },
    { id: 'history', label: 'History', count: historyTrades.length },
  ];

  const exportCurrentCsv = () => {
    if (activeTab === 'open') exportOpenCsv();
    else if (activeTab === 'pending') exportPendingCsv();
    else exportHistoryCsv();
  };

  const accountMetrics = activeAccount
    ? [
        { label: 'Balance', value: activeAccount.balance as number },
        { label: 'Equity', value: activeAccount.balance + (activeAccount.credit || 0) + totalPnl },
        { label: 'Credit', value: activeAccount.credit || 0 },
        { label: 'Used Margin', value: activeAccount.margin_used },
        {
          label: 'Free Margin',
          value: activeAccount.balance + (activeAccount.credit || 0) + totalPnl - activeAccount.margin_used,
          color: 'text-info' as const,
        },
        {
          label: 'Floating PL',
          value: totalPnl,
          color: totalPnl >= 0 ? 'text-buy' : 'text-sell',
          signed: true as const,
        },
      ]
    : [];

  const th = 'text-left text-[10px] font-bold uppercase tracking-wider text-text-tertiary px-2 py-2 whitespace-nowrap';
  const td = 'px-2 py-2 text-[11px] sm:text-xs text-text-primary tabular-nums align-middle';

  return (
    <div className="h-full flex flex-col bg-bg-primary min-h-0">
      {activeAccount && (
        <div className="px-2 py-2 border-b border-border-glass bg-bg-secondary/30 shrink-0">
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center justify-between sm:justify-start text-[10px] sm:text-xs">
            {accountMetrics.map((item) => (
              <div key={item.label} className="flex items-baseline gap-1.5 shrink-0">
                <span className="text-text-tertiary font-medium whitespace-nowrap">{item.label}</span>
                <span
                  className={clsx(
                    'font-bold tabular-nums font-mono whitespace-nowrap',
                    'color' in item && item.color ? item.color : 'text-text-primary',
                  )}
                >
                  {'signed' in item && item.signed && item.value >= 0 ? '+' : ''}
                  {item.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 p-1.5 sm:p-2">
        <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-border-glass bg-bg-secondary/25 overflow-hidden shadow-sm">
          <div className="flex shrink-0 border-b border-border-glass bg-bg-primary/40">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex-1 min-w-0 py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs font-bold transition-colors border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'bg-bg-secondary/70 text-text-primary border-buy'
                    : 'text-text-tertiary border-transparent hover:text-text-secondary hover:bg-bg-hover/40',
                )}
              >
                <span className="block truncate text-center">{tab.label}</span>
                <span className="block text-center tabular-nums opacity-90">({tab.count})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-glass/60 bg-bg-primary/20 shrink-0">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={toolbarBusy || (activeTab === 'history' && historyLoading)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold text-text-secondary bg-bg-secondary/80 border border-border-glass hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', toolbarBusy && 'animate-spin')} />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCurrentCsv}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold text-text-secondary bg-bg-secondary/80 border border-border-glass hover:bg-bg-hover hover:text-text-primary"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
          </div>

          <div className="flex-1 overflow-auto min-h-0 bg-bg-primary/30 flex flex-col">
            {activeTab === 'open' && (
              <div className="min-w-0 flex-1 flex flex-col min-h-0">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead>
                      <tr className="border-b border-border-glass/50">
                        <th className={th}>Account</th>
                        <th className={th}>Symbol</th>
                        <th className={th}>Side</th>
                        <th className={th}>Qty</th>
                        <th className={th}>Open</th>
                        <th className={th}>Current</th>
                        <th className={th}>P&amp;L</th>
                        <th className={th}>SL / TP</th>
                        <th className={clsx(th, 'text-right pr-3')}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos) => {
                        const d = getDigits(pos.symbol);
                        const pnl = pos.profit || 0;
                        return (
                          <tr
                            key={pos.id}
                            className="border-b border-border-glass/30 hover:bg-bg-hover/25 transition-colors"
                          >
                            <td className={td}>{accountLabel(pos.account_id)}</td>
                            <td className={clsx(td, 'font-bold')}>{pos.symbol}</td>
                            <td className={td}>
                              <span
                                className={clsx(
                                  'font-bold uppercase',
                                  pos.side === 'buy' ? 'text-buy' : 'text-sell',
                                )}
                              >
                                {pos.side}
                              </span>
                            </td>
                            <td className={td}>{pos.lots}</td>
                            <td className={clsx(td, 'font-mono')}>{pos.open_price.toFixed(d)}</td>
                            <td className={clsx(td, 'font-mono')}>
                              {pos.current_price != null ? pos.current_price.toFixed(d) : '—'}
                            </td>
                            <td className={clsx(td, 'font-mono font-bold', pnl >= 0 ? 'text-buy' : 'text-sell')}>
                              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                            </td>
                            <td className={clsx(td, 'text-[10px]')}>
                              {sltpEdit && sltpEdit.positionId === pos.id ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-text-tertiary w-5">SL:</span>
                                    <input
                                      type="number"
                                      step="0.00001"
                                      value={sltpEdit.sl}
                                      onChange={(e) => setSltpEdit({ ...sltpEdit, sl: e.target.value })}
                                      className="w-20 px-1 py-0.5 text-[10px] font-mono bg-bg-input border border-border-glass rounded text-text-primary"
                                      placeholder="—"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-text-tertiary w-5">TP:</span>
                                    <input
                                      type="number"
                                      step="0.00001"
                                      value={sltpEdit.tp}
                                      onChange={(e) => setSltpEdit({ ...sltpEdit, tp: e.target.value })}
                                      className="w-20 px-1 py-0.5 text-[10px] font-mono bg-bg-input border border-border-glass rounded text-text-primary"
                                      placeholder="—"
                                    />
                                  </div>
                                  <div className="flex gap-1 mt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => void saveSltpEdit()}
                                      disabled={sltpSaving}
                                      className="p-0.5 rounded bg-buy/15 text-buy hover:bg-buy/25 disabled:opacity-50"
                                      title="Save"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSltpEdit(null)}
                                      className="p-0.5 rounded bg-sell/15 text-sell hover:bg-sell/25"
                                      title="Cancel"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSltpEdit({
                                    positionId: pos.id,
                                    sl: pos.stop_loss != null ? pos.stop_loss.toFixed(d) : '',
                                    tp: pos.take_profit != null ? pos.take_profit.toFixed(d) : '',
                                  })}
                                  className="text-left group cursor-pointer"
                                  title="Click to edit SL/TP"
                                >
                                  <span className="text-text-tertiary">SL: {pos.stop_loss != null ? pos.stop_loss.toFixed(d) : '—'}</span>
                                  <br />
                                  <span className="text-text-tertiary">TP: {pos.take_profit != null ? pos.take_profit.toFixed(d) : '—'}</span>
                                  <Pencil className="w-2.5 h-2.5 inline ml-1 opacity-0 group-hover:opacity-60 text-text-tertiary transition-opacity" />
                                </button>
                              )}
                            </td>
                            <td className={clsx(td, 'text-right pr-2')}>
                              <button
                                type="button"
                                onClick={() =>
                                  setCloseModal({
                                    id: pos.id,
                                    symbol: pos.symbol,
                                    side: pos.side,
                                    lots: pos.lots,
                                    closeLots: String(pos.lots),
                                  })
                                }
                                className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-sell/15 text-sell border border-sell/30 hover:bg-sell/25"
                              >
                                Close
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {positions.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center text-sm text-text-tertiary">
                            No open positions
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'pending' && (
              <div className="min-w-0 flex-1 flex flex-col min-h-0">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full min-w-[560px] border-collapse">
                    <thead>
                      <tr className="border-b border-border-glass/50">
                        <th className={th}>Account</th>
                        <th className={th}>Symbol</th>
                        <th className={th}>Side</th>
                        <th className={th}>Type</th>
                        <th className={th}>Qty</th>
                        <th className={th}>Price</th>
                        <th className={th}>SL / TP</th>
                        <th className={clsx(th, 'text-right pr-3')}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOrders.map((order) => {
                        const d = getDigits(order.symbol);
                        return (
                          <tr
                            key={order.id}
                            className="border-b border-border-glass/30 hover:bg-bg-hover/25 transition-colors"
                          >
                            <td className={td}>{accountLabel(order.account_id)}</td>
                            <td className={clsx(td, 'font-bold')}>{order.symbol}</td>
                            <td className={td}>
                              <span
                                className={clsx(
                                  'font-bold uppercase',
                                  order.side === 'buy' ? 'text-buy' : 'text-sell',
                                )}
                              >
                                {order.side}
                              </span>
                            </td>
                            <td className={clsx(td, 'text-text-tertiary')}>
                              {order.order_type.replace(/_/g, ' ')}
                            </td>
                            <td className={td}>{order.lots}</td>
                            <td className={clsx(td, 'font-mono')}>{order.price.toFixed(d)}</td>
                            <td className={clsx(td, 'text-[10px] text-text-tertiary')}>
                              SL: {order.stop_loss != null ? order.stop_loss.toFixed(d) : '—'}
                              <br />
                              TP: {order.take_profit != null ? order.take_profit.toFixed(d) : '—'}
                            </td>
                            <td className={clsx(td, 'text-right pr-2')}>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await api.delete(`/orders/${order.id}`);
                                    toast.success('Order cancelled');
                                    refreshPositions();
                                  } catch (e: unknown) {
                                    toast.error(e instanceof Error ? e.message : 'Failed');
                                  }
                                }}
                                className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-sell/15 text-sell border border-sell/30 hover:bg-sell/25"
                              >
                                Cancel
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {pendingOrders.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-sm text-text-tertiary">
                            No pending orders
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="overflow-x-auto min-h-[120px]">
                {historyLoading ? (
                  <div className="px-4 py-12 text-center text-text-tertiary animate-pulse text-sm">
                    Loading history…
                  </div>
                ) : (
                  <table className="w-full min-w-[600px] border-collapse">
                    <thead>
                      <tr className="border-b border-border-glass/50">
                        <th className={th}>Symbol</th>
                        <th className={th}>Side</th>
                        <th className={th}>Qty</th>
                        <th className={th}>Open</th>
                        <th className={th}>Close</th>
                        <th className={th}>P&amp;L</th>
                        <th className={th}>Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyTrades.map((trade) => {
                        const d = getDigits(trade.symbol);
                        const pnl = trade.pnl || 0;
                        return (
                          <tr
                            key={trade.id}
                            className="border-b border-border-glass/30 hover:bg-bg-hover/25 transition-colors"
                          >
                            <td className={clsx(td, 'font-bold')}>{trade.symbol}</td>
                            <td className={td}>
                              <span
                                className={clsx(
                                  'font-bold uppercase',
                                  trade.side === 'buy' ? 'text-buy' : 'text-sell',
                                )}
                              >
                                {trade.side}
                              </span>
                            </td>
                            <td className={td}>{trade.lots}</td>
                            <td className={clsx(td, 'font-mono')}>{trade.open_price.toFixed(d)}</td>
                            <td className={clsx(td, 'font-mono')}>{trade.close_price.toFixed(d)}</td>
                            <td className={clsx(td, 'font-mono font-bold', pnl >= 0 ? 'text-buy' : 'text-sell')}>
                              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                            </td>
                            <td className={clsx(td, 'text-[10px] text-text-tertiary')}>
                              {new Date(trade.close_time).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                      {historyTrades.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-tertiary">
                            No trade history
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCloseModal(null)} />
          <div className="relative bg-bg-secondary border border-border-glass rounded-2xl shadow-2xl w-full max-w-sm p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-text-primary">Close Position</h3>
              <button
                type="button"
                onClick={() => setCloseModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-bg-primary/50 rounded-xl p-4 space-y-2 border border-border-glass/30">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-text-tertiary">Symbol</span>
                  <span className="text-text-primary">{closeModal.symbol}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-text-tertiary">Side</span>
                  <span className={clsx('font-bold', closeModal.side === 'buy' ? 'text-buy' : 'text-sell')}>
                    {closeModal.side.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-text-tertiary">Lots</span>
                  <span className="text-text-primary font-mono">{closeModal.lots}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider block mb-2">
                  Lots to Close
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={closeModal.lots}
                  value={closeModal.closeLots}
                  onChange={(e) => setCloseModal({ ...closeModal, closeLots: e.target.value })}
                  className="w-full px-4 py-3 bg-bg-primary border border-border-glass rounded-xl font-mono text-sm focus:border-sell outline-none transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCloseModal(null)}
                  className="flex-1 py-3 bg-bg-hover text-text-primary font-bold rounded-xl active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cl = parseFloat(closeModal.closeLots);
                    if (Number.isNaN(cl) || cl <= 0) {
                      toast.error('Invalid lots');
                      return;
                    }
                    void closePosition(closeModal.id, cl < closeModal.lots ? cl : undefined);
                  }}
                  disabled={submitting}
                  className="flex-1 py-3 bg-sell text-white font-bold rounded-xl shadow-lg shadow-sell/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Closing...' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
