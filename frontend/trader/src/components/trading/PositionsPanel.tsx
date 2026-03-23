'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTradingStore } from '@/stores/tradingStore';
import { Tabs } from '@/components/ui/Tabs';
import { clsx } from 'clsx';
import api from '@/lib/api/client';
import toast from 'react-hot-toast';
import { sounds, unlockAudio } from '@/lib/sounds';

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
type InlineEdit = { id: string; field: 'sl' | 'tp'; value: string } | null;

export default function PositionsPanel() {
  const { positions, pendingOrders, activeAccount, removePosition, setPendingOrders, refreshPositions, refreshAccount, instruments } = useTradingStore();
  const [activeTab, setActiveTab] = useState('positions');
  const [tradeHistory, setTradeHistory] = useState<ClosedTrade[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [closeModal, setCloseModal] = useState<CloseModal>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEdit>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalPnl = positions.reduce((s, p) => s + (p.profit || 0), 0);

  const getDigits = (symbol: string) => {
    const inst = instruments.find(i => i.symbol === symbol);
    return inst?.digits ?? 5;
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get<any>('/portfolio/trades', { page: '1', per_page: '50' });
      setTradeHistory(res?.items || (Array.isArray(res) ? res : []));
    } catch {
      setTradeHistory([]);
    }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  const closePosition = async (id: string, lots?: number) => {
    unlockAudio();
    setSubmitting(true);
    try {
      const body: any = {};
      if (lots) body.lots = lots;
      const res = await api.post<{ profit?: number; close_price?: number; remaining_lots?: number }>(`/positions/${id}/close`, body);
      const pnl = res.profit ?? 0;
      pnl >= 0 ? sounds.profit() : sounds.loss();
      if (res.remaining_lots && res.remaining_lots > 0) {
        toast.success(`Partial close @ ${res.close_price} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | ${res.remaining_lots} lots remaining`);
        refreshPositions();
      } else {
        removePosition(id);
        toast.success(`Closed @ ${res.close_price} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
      }
      refreshAccount();
      setCloseModal(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveInlineEdit = async () => {
    if (!inlineEdit) return;
    const val = inlineEdit.value.trim();
    const numVal = val ? parseFloat(val) : null;

    if (numVal !== null) {
      const pos = positions.find(p => p.id === inlineEdit.id);
      if (pos) {
        const isBuy = pos.side === 'buy';
        if (inlineEdit.field === 'sl') {
          if (isBuy && numVal >= pos.open_price) {
            toast.error(`SL must be below open price (${pos.open_price})`);
            setInlineEdit(null);
            return;
          }
          if (!isBuy && numVal <= pos.open_price) {
            toast.error(`SL must be above open price (${pos.open_price})`);
            setInlineEdit(null);
            return;
          }
        }
        if (inlineEdit.field === 'tp') {
          if (isBuy && numVal <= pos.open_price) {
            toast.error(`TP must be above open price (${pos.open_price})`);
            setInlineEdit(null);
            return;
          }
          if (!isBuy && numVal >= pos.open_price) {
            toast.error(`TP must be below open price (${pos.open_price})`);
            setInlineEdit(null);
            return;
          }
        }
      }
    }

    try {
      const body: any = {};
      if (inlineEdit.field === 'sl') body.stop_loss = numVal;
      else body.take_profit = numVal;
      await api.put(`/positions/${inlineEdit.id}`, body);
      toast.success(`${inlineEdit.field === 'sl' ? 'SL' : 'TP'} updated`);
      refreshPositions();
    } catch (e: any) {
      toast.error(e.message);
    }
    setInlineEdit(null);
  };

  const cancelOrder = async (id: string) => {
    try {
      await api.delete(`/orders/${id}`);
      setPendingOrders(pendingOrders.filter((o) => o.id !== id));
      toast.success('Order cancelled');
    } catch (e: any) { toast.error(e.message); }
  };

  const tabs = [
    { id: 'positions', label: 'Positions', count: positions.length },
    { id: 'orders', label: 'Pending Orders', count: pendingOrders.length },
    { id: 'history', label: 'Trade History' },
    { id: 'account', label: 'Account' },
  ];

  return (
    <div className="h-full flex flex-col bg-bg-secondary border-t border-border-glass">
      <div className="flex items-center justify-between pr-3">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        {activeTab === 'positions' && positions.length > 0 && (
          <span className={clsx('text-xs font-mono tabular-nums font-medium', totalPnl >= 0 ? 'text-buy' : 'text-sell')}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'positions' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-tertiary border-b border-border-glass text-xxs">
                {['Symbol', 'Side', 'Lots', 'Open', 'Current', 'SL', 'TP', 'Swap', 'P&L', ''].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const d = getDigits(pos.symbol);
                return (
                  <tr key={pos.id} className={clsx(
                    'border-b border-border-glass/50 hover:bg-bg-hover/30 transition-fast',
                    pos.profit > 0 && 'bg-buy/[0.03]',
                    pos.profit < 0 && 'bg-sell/[0.03]',
                  )}>
                    <td className="px-2 py-1.5 font-medium text-text-primary">{pos.symbol}</td>
                    <td className={clsx('px-2 py-1.5 font-semibold', pos.side === 'buy' ? 'text-buy' : 'text-sell')}>
                      {pos.side.toUpperCase()}
                    </td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-text-primary">{pos.lots}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-text-secondary">{pos.open_price.toFixed(d)}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-text-primary">{pos.current_price?.toFixed(d) || '--'}</td>
                    <td className="px-1 py-0.5">
                      {inlineEdit?.id === pos.id && inlineEdit.field === 'sl' ? (
                        <input
                          autoFocus
                          type="number"
                          step="any"
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                          onBlur={saveInlineEdit}
                          onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') setInlineEdit(null); }}
                          className="w-20 px-1 py-0.5 text-xxs font-mono bg-sell/10 border border-sell/40 rounded text-sell outline-none focus:border-sell"
                        />
                      ) : (
                        <button
                          onClick={() => setInlineEdit({ id: pos.id, field: 'sl', value: pos.stop_loss?.toString() || '' })}
                          className="font-mono tabular-nums text-sell hover:bg-sell/10 px-1 py-0.5 rounded cursor-pointer transition-fast text-xxs"
                          title="Click to edit SL"
                        >
                          {pos.stop_loss?.toFixed(d) || '—'}
                        </button>
                      )}
                    </td>
                    <td className="px-1 py-0.5">
                      {inlineEdit?.id === pos.id && inlineEdit.field === 'tp' ? (
                        <input
                          autoFocus
                          type="number"
                          step="any"
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                          onBlur={saveInlineEdit}
                          onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') setInlineEdit(null); }}
                          className="w-20 px-1 py-0.5 text-xxs font-mono bg-buy/10 border border-buy/40 rounded text-buy outline-none focus:border-buy"
                        />
                      ) : (
                        <button
                          onClick={() => setInlineEdit({ id: pos.id, field: 'tp', value: pos.take_profit?.toString() || '' })}
                          className="font-mono tabular-nums text-buy hover:bg-buy/10 px-1 py-0.5 rounded cursor-pointer transition-fast text-xxs"
                          title="Click to edit TP"
                        >
                          {pos.take_profit?.toFixed(d) || '—'}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-text-tertiary">{pos.swap.toFixed(2)}</td>
                    <td className={clsx('px-2 py-1.5 font-mono tabular-nums font-semibold', pos.profit >= 0 ? 'text-buy' : 'text-sell')}>
                      {pos.profit >= 0 ? '+' : ''}{pos.profit.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => setCloseModal({ id: pos.id, symbol: pos.symbol, side: pos.side, lots: pos.lots, closeLots: String(pos.lots) })}
                        className="px-2 py-0.5 text-xxs text-sell bg-sell/10 rounded hover:bg-sell/20 transition-fast"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
              {positions.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-text-tertiary text-xs">No open positions</td></tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'orders' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-tertiary border-b border-border-glass text-xxs">
                {['Symbol', 'Type', 'Side', 'Lots', 'Price', 'SL', 'TP', ''].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map((o) => (
                <tr key={o.id} className="border-b border-border-glass/50 hover:bg-bg-hover/30 transition-fast">
                  <td className="px-2 py-1.5 font-medium text-text-primary">{o.symbol}</td>
                  <td className="px-2 py-1.5 text-text-secondary capitalize">{o.order_type.replace('_', ' ')}</td>
                  <td className={clsx('px-2 py-1.5 font-semibold', o.side === 'buy' ? 'text-buy' : 'text-sell')}>
                    {o.side.toUpperCase()}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">{o.lots}</td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">{o.price.toFixed(getDigits(o.symbol))}</td>
                  <td className="px-2 py-1.5 font-mono tabular-nums text-sell">{o.stop_loss?.toFixed(getDigits(o.symbol)) || '--'}</td>
                  <td className="px-2 py-1.5 font-mono tabular-nums text-buy">{o.take_profit?.toFixed(getDigits(o.symbol)) || '--'}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => cancelOrder(o.id)}
                      className="px-2 py-0.5 text-xxs text-sell bg-sell/10 rounded hover:bg-sell/20 transition-fast">
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
              {pendingOrders.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-text-tertiary text-xs">No pending orders</td></tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'history' && (
          historyLoading ? (
            <div className="px-4 py-8 text-center text-text-tertiary text-xs">Loading trade history...</div>
          ) : tradeHistory.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-tertiary text-xs">No closed trades yet</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-tertiary border-b border-border-glass text-xxs">
                  {['Symbol', 'Side', 'Lots', 'Open', 'Close', 'Comm.', 'Swap', 'P&L', 'Reason', 'Time'].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tradeHistory.map((t) => {
                  const reason = t.close_reason || 'manual';
                  const reasonLabel = reason === 'sl' ? 'SL' : reason === 'tp' ? 'TP' : 'Manual';
                  const reasonColor = reason === 'sl' ? 'text-sell bg-sell/10' : reason === 'tp' ? 'text-buy bg-buy/10' : 'text-text-secondary bg-bg-hover';
                  return (
                  <tr key={t.id} className="border-b border-border-glass/50 hover:bg-bg-hover/30 transition-fast">
                    <td className="px-2 py-1.5 font-medium text-text-primary">{t.symbol}</td>
                    <td className={clsx('px-2 py-1.5 font-semibold', t.side === 'buy' ? 'text-buy' : 'text-sell')}>
                      {t.side.toUpperCase()}
                    </td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{t.lots}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-text-secondary">{t.open_price?.toFixed(getDigits(t.symbol)) ?? '--'}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-text-secondary">{t.close_price?.toFixed(getDigits(t.symbol)) ?? '--'}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-text-tertiary">{(t.commission ?? 0) !== 0 ? `-${Math.abs(t.commission).toFixed(2)}` : '0.00'}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-text-tertiary">{(t.swap ?? 0).toFixed(2)}</td>
                    <td className={clsx('px-2 py-1.5 font-mono tabular-nums font-semibold', (t.pnl ?? 0) >= 0 ? 'text-buy' : 'text-sell')}>
                      {(t.pnl ?? 0) >= 0 ? '+' : ''}{(t.pnl ?? 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={clsx('inline-flex px-1.5 py-0.5 rounded text-xxs font-semibold', reasonColor)}>
                        {reasonLabel}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-text-tertiary whitespace-nowrap">
                      {t.close_time ? new Date(t.close_time).toLocaleString() : '--'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'account' && activeAccount && (() => {
          const balance = activeAccount.balance;
          const credit = activeAccount.credit || 0;
          const equity = balance + credit + totalPnl;
          const marginUsed = activeAccount.margin_used;
          const freeMargin = equity - marginUsed;
          const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : 0;
          return (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Balance', value: `$${balance.toFixed(2)}` },
                { label: 'Credit', value: `$${credit.toFixed(2)}`, color: credit > 0 ? 'text-warning' : undefined },
                { label: 'Equity', value: `$${equity.toFixed(2)}`, color: totalPnl >= 0 ? 'text-buy' : 'text-sell' },
                { label: 'Unrealized P&L', value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? 'text-buy' : 'text-sell' },
                { label: 'Margin Used', value: `$${marginUsed.toFixed(2)}` },
                { label: 'Free Margin', value: `$${freeMargin.toFixed(2)}`, color: freeMargin < 0 ? 'text-sell' : undefined },
                { label: 'Margin Level', value: marginUsed > 0 ? `${marginLevel.toFixed(0)}%` : '—', color: marginLevel > 0 && marginLevel < 100 ? 'text-sell' : marginLevel >= 100 ? 'text-buy' : undefined },
              ].map((item) => (
                <div key={item.label} className="glass-card rounded-xl p-3 noise-texture overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-xxs text-text-tertiary">{item.label}</div>
                    <div className={clsx('text-sm font-bold font-mono tabular-nums mt-0.5', item.color || 'text-text-primary')}>
                      {item.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {activeTab === 'positions' && positions.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border-glass flex items-center gap-4 text-xxs text-text-tertiary glass-light">
          <span>{positions.length} positions</span>
          <span>Margin: <span className="text-text-primary font-mono">${activeAccount?.margin_used.toFixed(2)}</span></span>
          <span className="ml-auto">
            PnL: <span className={clsx('font-mono font-medium', totalPnl >= 0 ? 'text-buy' : 'text-sell')}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </span>
          </span>
        </div>
      )}

      {/* Close / Partial Close Modal */}
      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCloseModal(null)} />
          <div className="relative bg-bg-secondary border border-border-glass rounded-xl shadow-lg w-full max-w-sm mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-text-primary">Close Position</h3>
              <button onClick={() => setCloseModal(null)} className="text-text-tertiary hover:text-text-primary text-lg">&times;</button>
            </div>
            <div className="space-y-3">
              <div className="glass-light rounded-lg p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Symbol</span>
                  <span className="text-text-primary font-medium">{closeModal.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Side</span>
                  <span className={clsx('font-semibold', closeModal.side === 'buy' ? 'text-buy' : 'text-sell')}>{closeModal.side.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Open Lots</span>
                  <span className="text-text-primary font-mono">{closeModal.lots}</span>
                </div>
              </div>
              <div>
                <label className="text-xxs text-text-tertiary block mb-1">Lots to Close</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={closeModal.lots}
                  value={closeModal.closeLots}
                  onChange={e => setCloseModal({ ...closeModal, closeLots: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-bg-input border border-border-glass rounded-lg font-mono focus:border-sell"
                />
                <div className="flex gap-1 mt-1.5">
                  {[0.25, 0.5, 0.75, 1].map(pct => {
                    const val = Math.max(0.01, +(closeModal.lots * pct).toFixed(2));
                    return (
                      <button
                        key={pct}
                        onClick={() => setCloseModal({ ...closeModal, closeLots: String(val) })}
                        className="flex-1 py-1 text-xxs rounded border border-border-glass text-text-secondary hover:text-sell hover:border-sell/40 transition-fast font-mono"
                      >
                        {pct === 1 ? 'All' : `${pct * 100}%`}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setCloseModal(null)} className="flex-1 py-2 text-xs rounded-lg border border-border-glass text-text-secondary hover:bg-bg-hover transition-fast">Cancel</button>
                <button
                  onClick={() => {
                    const cl = parseFloat(closeModal.closeLots);
                    if (isNaN(cl) || cl <= 0) { toast.error('Invalid lots'); return; }
                    closePosition(closeModal.id, cl < closeModal.lots ? cl : undefined);
                  }}
                  disabled={submitting}
                  className="flex-1 py-2 text-xs rounded-lg bg-sell text-white hover:bg-sell/80 transition-fast disabled:opacity-50"
                >
                  {submitting ? 'Closing...' : parseFloat(closeModal.closeLots) < closeModal.lots ? 'Partial Close' : 'Close All'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
