'use client';

import { useState, useMemo } from 'react';
import { useTradingStore } from '@/stores/tradingStore';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { sounds, unlockAudio } from '@/lib/sounds';
import { getDigits } from '@/lib/utils';
import { getMarketStatus } from '@/lib/marketHours';

type OrderSide = 'buy' | 'sell';
type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';

function AccountSummaryBar() {
  const { activeAccount, positions } = useTradingStore();
  if (!activeAccount) return null;

  const unrealizedPnl = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
  const balance = activeAccount.balance;
  const credit = activeAccount.credit || 0;
  const equity = balance + credit + unrealizedPnl;
  const marginUsed = activeAccount.margin_used;
  const freeMargin = equity - marginUsed;
  const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : 0;

  return (
    <div className="shrink-0 border-t border-border-glass px-3 py-2 space-y-1">
      {[
        { label: 'Balance', value: `$${balance.toFixed(2)}` },
        { label: 'Credit', value: `$${credit.toFixed(2)}`, color: credit > 0 ? 'text-warning' : undefined },
        { label: 'Equity', value: `$${equity.toFixed(2)}`, color: unrealizedPnl >= 0 ? 'text-buy' : 'text-sell' },
        { label: 'Margin', value: `$${marginUsed.toFixed(2)}` },
        { label: 'Free', value: `$${freeMargin.toFixed(2)}`, color: freeMargin < 0 ? 'text-sell' : undefined },
        { label: 'Leverage', value: `1:${activeAccount.leverage}` },
      ].map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <span className="text-xxs text-text-tertiary">{item.label}</span>
          <span className={clsx('text-xxs font-mono tabular-nums', item.color || 'text-text-primary')}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function OrderPanel() {
  const { selectedSymbol, prices, activeAccount, instruments } = useTradingStore();
  const { oneClickTrading, setOneClickTrading } = useUIStore();
  const tick = prices[selectedSymbol];

  const instrumentInfo = useTradingStore((s) => s.instruments.find((i) => i.symbol === selectedSymbol));
  const segment = (instrumentInfo as any)?.segment as string | undefined;
  const marketStatus = useMemo(
    () => getMarketStatus(selectedSymbol, segment),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSymbol, segment, Math.floor(Date.now() / 60_000)], // recompute each minute
  );

  const [side, setSide] = useState<OrderSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [lots, setLots] = useState('0.01');
  const [price, setPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const lotPresets = ['0.01', '0.05', '0.1', '0.5', '1.0'];

  const contractSize = instrumentInfo?.contract_size || 100000;

  const marginRequired = useMemo(() => {
    if (!tick || !activeAccount) return 0;
    const p = side === 'buy' ? tick.ask : tick.bid;
    return (parseFloat(lots) * contractSize * p) / activeAccount.leverage;
  }, [tick, lots, side, activeAccount, contractSize]);

  const pipValue = useMemo(() => {
    const pipSz = instrumentInfo?.pip_size || 0.0001;
    return parseFloat(lots) * contractSize * pipSz;
  }, [lots, contractSize, instrumentInfo]);

  const riskReward = useMemo(() => {
    if (!tick || !slEnabled || !tpEnabled || !sl || !tp) return null;
    const entry = side === 'buy' ? tick.ask : tick.bid;
    const risk = Math.abs(entry - parseFloat(sl));
    const reward = Math.abs(parseFloat(tp) - entry);
    if (risk === 0) return null;
    return (reward / risk).toFixed(2);
  }, [tick, sl, tp, slEnabled, tpEnabled, side]);

  const { refreshPositions, refreshAccount } = useTradingStore();

  const placeOrder = async () => {
    unlockAudio();
    if (!activeAccount) { toast.error('No account'); return; }
    if (orderType === 'market' && !marketStatus.isOpen) {
      toast.error(marketStatus.reason || 'Market is closed');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/orders/', {
        account_id: activeAccount.id,
        symbol: selectedSymbol,
        order_type: orderType,
        side,
        lots: parseFloat(lots),
        price: orderType !== 'market' && price ? parseFloat(price) : undefined,
        stop_loss: slEnabled && sl ? parseFloat(sl) : undefined,
        take_profit: tpEnabled && tp ? parseFloat(tp) : undefined,
      });
      sounds.orderPlaced();
      toast.success(`${side.toUpperCase()} ${lots} ${selectedSymbol}`);
      refreshPositions();
      refreshAccount();
    } catch (e: any) {
      toast.error(e.message || 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickTrade = (s: OrderSide) => {
    unlockAudio();
    if (!marketStatus.isOpen) {
      toast.error(marketStatus.reason || 'Market is closed');
      return;
    }
    if (oneClickTrading) {
      setSide(s);
      placeOrder();
    } else {
      setSide(s);
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary border-l border-border-glass">
      {/* Symbol header */}
      <div className="px-3 py-2 border-b border-border-glass">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-text-primary">{selectedSymbol}</div>
          <span className={clsx(
            'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
            marketStatus.isOpen
              ? 'bg-buy/15 text-buy'
              : 'bg-sell/15 text-sell',
          )}>
            {marketStatus.isOpen ? '● OPEN' : '● CLOSED'}
          </span>
        </div>
        {tick && <div className="text-xxs text-text-tertiary tabular-nums font-mono">Spread: {(tick.spread / (instrumentInfo?.pip_size || 0.0001)).toFixed(1)} pips</div>}
        {!marketStatus.isOpen && (
          <div className="mt-1 text-[10px] text-sell/80 leading-snug">{marketStatus.reason}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Buy / Sell buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleQuickTrade('sell')}
            disabled={!marketStatus.isOpen}
            className={clsx(
              'py-3 rounded-xl text-center transition-all duration-150',
              !marketStatus.isOpen
                ? 'opacity-40 cursor-not-allowed glass-light'
                : side === 'sell' ? 'skeu-btn-sell ring-1 ring-sell/30' : 'glass-light hover:bg-sell/10',
            )}
          >
            <div className={clsx('text-xs font-bold', side === 'sell' && marketStatus.isOpen ? 'text-white' : 'text-sell')}>SELL</div>
            {tick && <div className={clsx('text-sm font-mono tabular-nums mt-0.5', side === 'sell' && marketStatus.isOpen ? 'text-white/80' : 'text-sell/80')}>{tick.bid.toFixed(getDigits(selectedSymbol))}</div>}
          </button>
          <button
            onClick={() => handleQuickTrade('buy')}
            disabled={!marketStatus.isOpen}
            className={clsx(
              'py-3 rounded-xl text-center transition-all duration-150',
              !marketStatus.isOpen
                ? 'opacity-40 cursor-not-allowed glass-light'
                : side === 'buy' ? 'skeu-btn-buy ring-1 ring-buy/30' : 'glass-light hover:bg-buy/10',
            )}
          >
            <div className={clsx('text-xs font-bold', side === 'buy' && marketStatus.isOpen ? 'text-white' : 'text-buy')}>BUY</div>
            {tick && <div className={clsx('text-sm font-mono tabular-nums mt-0.5', side === 'buy' && marketStatus.isOpen ? 'text-white/80' : 'text-buy/80')}>{tick.ask.toFixed(getDigits(selectedSymbol))}</div>}
          </button>
        </div>

        {/* Order type */}
        <div>
          <label className="text-xxs text-text-tertiary uppercase tracking-wider mb-1 block">Type</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as OrderType)}
            className="!py-2 !text-xs !rounded-lg"
          >
            <option value="market">Market Order</option>
            <option value="limit">Limit Order</option>
            <option value="stop">Stop Order</option>
            <option value="stop_limit">Stop Limit</option>
          </select>
        </div>

        {/* Price for pending orders */}
        {orderType !== 'market' && (
          <div className="space-y-2">
            <div>
              <label className="text-xxs text-text-tertiary uppercase tracking-wider mb-1 block">
                {orderType === 'limit' ? 'Limit Price' : orderType === 'stop' ? 'Stop Price' : 'Stop Price'}
              </label>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={tick ? (side === 'buy' ? tick.ask.toFixed(getDigits(selectedSymbol)) : tick.bid.toFixed(getDigits(selectedSymbol))) : 'Entry price'}
                className="!py-2 !text-xs !rounded-lg font-mono"
              />
              {tick && orderType === 'limit' && (
                <p className="text-xxs text-text-tertiary mt-1">
                  {side === 'buy' ? `Must be below current ask (${tick.ask.toFixed(getDigits(selectedSymbol))})` : `Must be above current bid (${tick.bid.toFixed(getDigits(selectedSymbol))})`}
                </p>
              )}
              {tick && orderType === 'stop' && (
                <p className="text-xxs text-text-tertiary mt-1">
                  {side === 'buy' ? `Must be above current ask (${tick.ask.toFixed(getDigits(selectedSymbol))})` : `Must be below current bid (${tick.bid.toFixed(getDigits(selectedSymbol))})`}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Lot size */}
        <div>
          <label className="text-xxs text-text-tertiary uppercase tracking-wider mb-1 block">Volume (Lots)</label>
          <div className="flex gap-1 mb-1.5">
            {lotPresets.map((v) => (
              <button
                key={v}
                onClick={() => setLots(v)}
                className={clsx(
                  'flex-1 py-1 text-xxs rounded-md transition-fast font-mono',
                  lots === v
                    ? (side === 'buy' ? 'skeu-btn-buy text-white' : 'skeu-btn-sell text-white')
                    : 'glass-light text-text-secondary hover:text-text-primary'
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="100"
            value={lots}
            onChange={(e) => setLots(e.target.value)}
            className="!py-2 !text-xs !rounded-lg font-mono"
          />
          {/* Margin info */}
          <div className="glass-light rounded-lg p-2 mt-1.5 space-y-1">
            <div className="flex justify-between text-xxs">
              <span className="text-text-tertiary">Margin Required</span>
              <span className="text-text-primary font-mono tabular-nums">${marginRequired.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xxs">
              <span className="text-text-tertiary">Pip Value</span>
              <span className="text-text-primary font-mono tabular-nums">${pipValue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* SL / TP */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setSlEnabled(!slEnabled)}
              className={clsx('w-4 h-4 rounded border transition-fast flex items-center justify-center',
                slEnabled ? 'bg-sell border-sell' : 'border-border-secondary'
              )}>
              {slEnabled && <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
            </button>
            <span className="text-xxs text-text-secondary">Stop Loss</span>
          </div>
          {slEnabled && (
            <input type="number" step="any" value={sl} onChange={(e) => setSl(e.target.value)}
              placeholder="SL price" className="!py-2 !text-xs !rounded-lg font-mono !border-sell/30" />
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => setTpEnabled(!tpEnabled)}
              className={clsx('w-4 h-4 rounded border transition-fast flex items-center justify-center',
                tpEnabled ? 'bg-buy border-buy' : 'border-border-secondary'
              )}>
              {tpEnabled && <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
            </button>
            <span className="text-xxs text-text-secondary">Take Profit</span>
          </div>
          {tpEnabled && (
            <input type="number" step="any" value={tp} onChange={(e) => setTp(e.target.value)}
              placeholder="TP price" className="!py-2 !text-xs !rounded-lg font-mono !border-buy/30" />
          )}

          {riskReward && (
            <div className="glass-light rounded-lg p-2 text-xxs">
              <span className="text-text-tertiary">R:R Ratio</span>{' '}
              <span className="text-text-primary font-mono">1:{riskReward}</span>
            </div>
          )}
        </div>

        {/* Market closed banner for pending order hint */}
        {!marketStatus.isOpen && orderType === 'market' && (
          <div className="rounded-lg border border-sell/20 bg-sell/5 px-3 py-2 text-[10px] text-sell leading-snug">
            <span className="font-bold">Market closed.</span> Switch to Limit or Stop order to pre-place a trade for when the market reopens.
          </div>
        )}

        {/* Place order button */}
        <button
          onClick={placeOrder}
          disabled={submitting || (orderType === 'market' && !marketStatus.isOpen) || (marginRequired > (activeAccount?.free_margin || 0))}
          className={clsx(
            'w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-white',
            side === 'buy' ? 'skeu-btn-buy' : 'skeu-btn-sell',
          )}
        >
          {submitting ? 'Processing...' : `Place ${side.toUpperCase()} Order`}
          <div className="text-xxs font-normal opacity-70 mt-0.5">{lots} lot {selectedSymbol}</div>
        </button>

        {marginRequired > (activeAccount?.free_margin || 0) && (
          <div className="text-xxs text-danger text-center">Insufficient margin</div>
        )}

        {/* One-click toggle */}
        <div className="emboss-divider" />
        <div className="flex items-center justify-between">
          <span className="text-xxs text-text-tertiary">One-Click Trading</span>
          <button
            onClick={() => setOneClickTrading(!oneClickTrading)}
            className={clsx(
              'w-9 h-5 rounded-full transition-all duration-200 relative border border-border-glass',
              oneClickTrading ? 'bg-buy' : 'bg-border-secondary'
            )}
          >
            <div className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full shadow-sm transition-transform duration-200 bg-white [data-theme="light"]:bg-black',
              oneClickTrading ? 'translate-x-4' : 'translate-x-0.5'
            )} />
          </button>
        </div>
      </div>

      {/* Account Summary — bottom of order panel (live with unrealized PnL) */}
      {activeAccount && <AccountSummaryBar />}
    </div>
  );
}
