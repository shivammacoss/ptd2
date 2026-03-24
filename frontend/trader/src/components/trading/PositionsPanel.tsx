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
  const { positions, pendingOrders, activeAccount, removePosition, refreshPositions, refreshAccount, instruments } = useTradingStore();
  const [activeTab, setActiveTab] = useState('positions');
  const [tradeHistory, setTradeHistory] = useState<ClosedTrade[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [closeModal, setCloseModal] = useState<CloseModal>(null);
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

  const tabs = [
    { id: 'positions', label: 'Positions', count: positions.length },
    { id: 'orders', label: 'Pending Orders', count: pendingOrders.length },
    { id: 'history', label: 'Trade History' },
  ];

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Account Info Summary - Mobile Optimized */}
      {activeAccount && (
        <div className="p-3 space-y-0.5 border-b border-border-glass bg-bg-secondary/30">
          {[
            { label: 'Balance', value: activeAccount.balance },
            { label: 'Equity', value: (activeAccount.balance + (activeAccount.credit || 0) + totalPnl) },
            { label: 'Credit', value: activeAccount.credit || 0 },
            { label: 'Used Margin', value: activeAccount.margin_used },
            { label: 'Free Margin', value: (activeAccount.balance + (activeAccount.credit || 0) + totalPnl - activeAccount.margin_used), color: 'text-info' },
            { label: 'Floating PL', value: totalPnl, color: totalPnl >= 0 ? 'text-success' : 'text-sell' },
          ].map((item) => (
            <div key={item.label} className="flex justify-between items-center py-1 border-b border-border-glass/20 last:border-0 h-8">
              <span className="text-xs text-text-secondary font-medium">{item.label}</span>
              <span className={clsx(
                'text-sm font-bold tabular-nums font-mono',
                item.color || 'text-text-primary'
              )}>
                {item.value >= 0 && item.label === 'Floating PL' ? '+' : ''}{item.value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-border-glass px-1">
        <div className="flex-1 flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex-1 flex flex-col items-center py-2 relative transition-colors',
                activeTab === tab.id ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              <span className="text-xs font-bold whitespace-nowrap">
                {tab.label} {tab.count !== undefined && `(${tab.count})`}
              </span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-tertiary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto bg-bg-primary">
        {activeTab === 'positions' && (
          <div className="divide-y divide-border-glass/20">
            {positions.map((pos) => {
              const d = getDigits(pos.symbol);
              const pnl = pos.profit || 0;
              return (
                <div key={pos.id} className="p-4 flex items-center justify-between hover:bg-bg-hover/20 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold text-text-primary">{pos.symbol}</span>
                      <span className={clsx(
                        'px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-tighter shadow-sm',
                        pos.side === 'buy' ? 'bg-buy/10 text-buy border border-buy/20' : 'bg-sell/10 text-sell border border-sell/20'
                      )}>
                        {pos.side}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-tertiary font-medium mt-0.5">
                      {pos.lots} lots @ {pos.open_price.toFixed(d)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setCloseModal({ id: pos.id, symbol: pos.symbol, side: pos.side, lots: pos.lots, closeLots: String(pos.lots) })}
                      className="w-10 h-10 rounded-xl bg-bg-secondary border border-border-glass flex items-center justify-center text-text-tertiary hover:text-buy hover:border-buy/30 transition-all hover:shadow-lg hover:shadow-buy/5"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <div className="text-right">
                      <div className={clsx('text-[15px] font-bold font-mono tabular-nums leading-tight', pnl >= 0 ? 'text-success' : 'text-sell')}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-text-tertiary font-mono font-medium mt-0.5">
                        {pos.current_price?.toFixed(d) || '--'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {positions.length === 0 && (
              <div className="px-4 py-16 text-center">
                <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                  <svg className="text-text-tertiary" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M2 12h20"/></svg>
                </div>
                <p className="text-sm text-text-tertiary font-medium">No open positions</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="divide-y divide-border-glass/20">
            {pendingOrders.map((order) => {
              const d = getDigits(order.symbol);
              return (
                <div key={order.id} className="p-4 flex items-center justify-between hover:bg-bg-hover/20 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold text-text-primary">{order.symbol}</span>
                      <span className={clsx(
                        'px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-tighter shadow-sm',
                        order.side === 'buy' ? 'bg-buy/10 text-buy border border-buy/20' : 'bg-sell/10 text-sell border border-sell/20'
                      )}>
                        {order.side}
                      </span>
                      <span className="text-[10px] bg-bg-secondary text-text-tertiary px-1 py-0.5 rounded font-bold uppercase tracking-tighter">
                        {order.order_type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-tertiary font-medium mt-0.5">
                      {order.lots} lots @ {order.price.toFixed(d)}
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                       try {
                         await api.delete(`/orders/${order.id}`);
                         toast.success('Order cancelled');
                         refreshPositions(); // Or whatever reloads orders
                       } catch (e: any) {
                         toast.error(e.message);
                       }
                    }}
                    className="w-10 h-10 rounded-xl bg-bg-secondary border border-border-glass flex items-center justify-center text-text-tertiary hover:text-sell hover:border-sell/30 transition-all"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              );
            })}
            {pendingOrders.length === 0 && (
              <div className="px-4 py-16 text-center">
                <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                  <svg className="text-text-tertiary" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M2 12h20"/></svg>
                </div>
                <p className="text-sm text-text-tertiary font-medium">No pending orders</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="divide-y divide-border-glass/20">
            {historyLoading ? (
              <div className="px-4 py-12 text-center text-text-tertiary animate-pulse text-sm">Loading history...</div>
            ) : tradeHistory.map((trade) => {
              const d = getDigits(trade.symbol);
              const pnl = trade.pnl || 0;
              return (
                <div key={trade.id} className="p-4 flex items-center justify-between hover:bg-bg-hover/20 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold text-text-primary">{trade.symbol}</span>
                      <span className={clsx(
                        'px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-tighter shadow-sm',
                        trade.side === 'buy' ? 'bg-buy/10 text-buy border border-buy/20' : 'bg-sell/10 text-sell border border-sell/20'
                      )}>
                        {trade.side}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-tertiary font-medium mt-0.5">
                      {trade.lots} lots @ {trade.open_price.toFixed(d)} → {trade.close_price.toFixed(d)}
                    </div>
                    <div className="text-[9px] text-text-tertiary/60 mt-0.5 font-mono">
                      {new Date(trade.close_time).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={clsx('text-[15px] font-bold font-mono tabular-nums leading-tight', pnl >= 0 ? 'text-success' : 'text-sell')}>
                      {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </div>
                    {trade.close_reason && (
                      <div className="text-[9px] text-text-tertiary font-bold uppercase tracking-wider mt-0.5">
                        {trade.close_reason}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!historyLoading && tradeHistory.length === 0 && (
              <div className="px-4 py-16 text-center">
                <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                  <svg className="text-text-tertiary" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M2 12h20"/></svg>
                </div>
                <p className="text-sm text-text-tertiary font-medium">No trading history</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Close Modal */}
      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCloseModal(null)} />
          <div className="relative bg-bg-secondary border border-border-glass rounded-2xl shadow-2xl w-full max-w-sm p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-text-primary">Close Position</h3>
              <button onClick={() => setCloseModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
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
                  <span className={clsx('font-bold', closeModal.side === 'buy' ? 'text-buy' : 'text-sell')}>{closeModal.side.toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-text-tertiary">Lots</span>
                  <span className="text-text-primary font-mono">{closeModal.lots}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider block mb-2">Lots to Close</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={closeModal.lots}
                  value={closeModal.closeLots}
                  onChange={e => setCloseModal({ ...closeModal, closeLots: e.target.value })}
                  className="w-full px-4 py-3 bg-bg-primary border border-border-glass rounded-xl font-mono text-sm focus:border-sell outline-none transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setCloseModal(null)} className="flex-1 py-3 bg-bg-hover text-text-primary font-bold rounded-xl active:scale-95 transition-all">Cancel</button>
                <button
                  onClick={() => {
                    const cl = parseFloat(closeModal.closeLots);
                    if (isNaN(cl) || cl <= 0) { toast.error('Invalid lots'); return; }
                    closePosition(closeModal.id, cl < closeModal.lots ? cl : undefined);
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
