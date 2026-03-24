'use client';

import { useState, useEffect } from 'react';
import { useTradingStore } from '@/stores/tradingStore';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

interface MobileOrderSheetProps {
  symbol: string;
  onClose: () => void;
}

type PendingSubtype = 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop';

export default function MobileOrderSheet({ symbol, onClose }: MobileOrderSheetProps) {
  const { prices, instruments, activeAccount, placeOrder } = useTradingStore();
  const [orderType, setOrderType] = useState<'market' | 'pending'>('market');
  const [pendingSubtype, setPendingSubtype] = useState<PendingSubtype>('buy_limit');
  const [lots, setLots] = useState(0.01);
  const [leverage, setLeverage] = useState('1:100');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  
  const instrument = instruments.find(i => i.symbol === symbol);
  const price = prices[symbol];
  const digits = instrument?.digits ?? 5;
  const spread = price ? (price.ask - price.bid) * Math.pow(10, digits - 1) : 0;

  const handleAdjustLots = (delta: number) => {
    setLots(prev => Math.max(0.01, parseFloat((prev + delta).toFixed(2))));
  };

  const handlePlaceOrder = async (overrideSide?: 'buy' | 'sell') => {
    if (!activeAccount) {
      toast.error('No active account selected');
      return;
    }

    let finalOrderType = orderType === 'market' ? 'market' : pendingSubtype;
    let finalSide = overrideSide || (pendingSubtype.includes('buy') ? 'buy' : 'sell');

    try {
      await placeOrder({
        account_id: activeAccount.id,
        symbol,
        side: finalSide as 'buy' | 'sell',
        order_type: finalOrderType as any,
        lots,
        price: orderType === 'pending' ? parseFloat(entryPrice) : undefined,
        stop_loss: sl ? parseFloat(sl) : undefined,
        take_profit: tp ? parseFloat(tp) : undefined,
      });
      toast.success(`${(finalOrderType || finalSide).toUpperCase()} ${lots} ${symbol} success!`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to place order');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] md:hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#0A0A0A] rounded-t-[32px] border-t border-white/10 shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[92vh] select-none">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-white tracking-tight">{symbol}</h2>
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
              {instrument?.display_name || symbol}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center bg-white/5 rounded-full text-white/40 hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 pb-10 flex-1 overflow-y-auto space-y-5 scrollbar-none">
          {/* Leverage Selector */}
          <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/5">
            <span className="text-xs font-bold text-white/50">Leverage</span>
            <div className="flex items-center gap-1.5 text-warning font-black text-xs">
              {leverage}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>

          {/* Quick Bid/Ask Boxes (SOLID COLOR REVERTED AS REQUESTED) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-sell rounded-xl p-3 flex flex-col items-center justify-center shadow-lg shadow-sell/20">
              <span className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-0.5">Sell Price</span>
              <span className="text-xl font-black text-white font-mono tabular-nums tracking-tighter">
                {price?.bid.toFixed(digits) || '--'}
              </span>
            </div>
            <div className="bg-buy rounded-xl p-3 flex flex-col items-center justify-center shadow-lg shadow-buy/20">
              <span className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-0.5">Buy Price</span>
              <span className="text-xl font-black text-white font-mono tabular-nums tracking-tighter">
                {price?.ask.toFixed(digits) || '--'}
              </span>
            </div>
          </div>

          <div className="text-center">
            <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] -mt-2 block">Spread: {spread.toFixed(1)} pips</span>
          </div>

          {/* Market/Pending Switch */}
          <div className="grid grid-cols-2 bg-white/5 p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => setOrderType('market')}
              className={clsx(
                "py-2.5 rounded-lg text-[11px] font-black transition-all uppercase tracking-widest",
                orderType === 'market' ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white"
              )}
            >
              Market
            </button>
            <button 
              onClick={() => setOrderType('pending')}
              className={clsx(
                "py-2.5 rounded-lg text-[11px] font-black transition-all uppercase tracking-widest",
                orderType === 'pending' ? "bg-[#00D1FF] text-white shadow-lg shadow-[#00D1FF]/20" : "text-white/30 hover:text-white"
              )}
            >
              Pending
            </button>
          </div>

          {/* Pending Specific Section */}
          {orderType === 'pending' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-white/30 uppercase tracking-widest block ml-1">Order Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'buy_limit', label: 'Buy Limit' },
                    { id: 'sell_limit', label: 'Sell Limit' },
                    { id: 'buy_stop', label: 'Buy Stop' },
                    { id: 'sell_stop', label: 'Sell Stop' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setPendingSubtype(t.id as PendingSubtype)}
                      className={clsx(
                        "py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                        pendingSubtype === t.id 
                          ? (t.id.includes('buy') ? "bg-buy border-buy text-white" : "bg-sell border-sell text-white")
                          : "bg-white/5 border-white/5 text-white/40"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-white/30 uppercase tracking-widest block ml-1">Entry Price</label>
                <div className="relative">
                  <input 
                    type="number" 
                    placeholder="Enter price"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    className="w-full h-11 bg-white/5 rounded-xl border border-white/10 pl-4 pr-4 text-white text-base font-bold placeholder:text-white/10 focus:outline-none focus:border-[#00D1FF]/50 transition-all font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Volume Control */}
          <div className="space-y-2">
             <label className="text-[9px] font-black text-white/30 uppercase tracking-widest block ml-1">Volume (Lots)</label>
             <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleAdjustLots(-0.01)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white active:scale-90 transition-transform shadow-sm"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
                </button>
                <div className="flex-1 h-11 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-lg font-black text-white font-mono tabular-nums">
                  {lots.toFixed(2)}
                </div>
                <button 
                  onClick={() => handleAdjustLots(0.01)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white active:scale-90 transition-transform shadow-sm"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                </button>
             </div>
          </div>

          {/* SL/TP Controls */}
          <div className="grid grid-cols-2 gap-3">
             <div className="space-y-2">
               <label className="text-[9px] font-black text-white/30 uppercase tracking-widest block ml-1">Stop Loss</label>
               <input 
                 type="number" 
                 placeholder="Optional"
                 value={sl}
                 onChange={(e) => setSl(e.target.value)}
                 className="w-full h-11 bg-white/5 rounded-xl border border-white/10 text-center text-sm text-white font-mono tabular-nums placeholder:text-white/10 focus:outline-none focus:border-[#FF2440]/40 font-bold"
               />
             </div>
             <div className="space-y-2">
               <label className="text-[9px] font-black text-white/30 uppercase tracking-widest block ml-1">Take Profit</label>
               <input 
                 type="number" 
                 placeholder="Optional"
                 value={tp}
                 onChange={(e) => setTp(e.target.value)}
                 className="w-full h-11 bg-white/5 rounded-xl border border-white/10 text-center text-sm text-white font-mono tabular-nums placeholder:text-white/10 focus:outline-none focus:border-success/40 font-bold"
               />
             </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3">
             {orderType === 'market' ? (
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => handlePlaceOrder('sell')}
                    className="h-14 bg-sell rounded-xl flex items-center justify-center text-lg font-black text-white uppercase tracking-widest shadow-xl shadow-sell/20 active:scale-[0.98] transition-all"
                  >
                    Sell
                  </button>
                  <button 
                    onClick={() => handlePlaceOrder('buy')}
                    className="h-14 bg-buy rounded-xl flex items-center justify-center text-lg font-black text-white uppercase tracking-widest shadow-xl shadow-buy/20 active:scale-[0.98] transition-all"
                  >
                    Buy
                  </button>
                </div>
             ) : (
                <button 
                  onClick={() => handlePlaceOrder()}
                  disabled={!entryPrice}
                  className={clsx(
                    "w-full h-14 rounded-xl flex items-center justify-center text-lg font-black uppercase tracking-widest shadow-xl transition-all active:scale-[0.98]",
                    entryPrice 
                      ? "bg-[#00D1FF] text-white shadow-[#00D1FF]/20" 
                      : "bg-white/5 text-white/20 border border-white/5 cursor-not-allowed"
                  )}
                >
                  Place {pendingSubtype.replace('_', ' ')}
                </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
