'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTradingStore } from '@/stores/tradingStore';
import { clsx } from 'clsx';

const SEGMENTS = ['All', 'Forex', 'Commodities', 'Indices', 'Crypto'];

const SYMBOL_META: Record<string, { display: string; segment: string }> = {
  EURUSD: { display: 'EUR/USD', segment: 'Forex' },
  GBPUSD: { display: 'GBP/USD', segment: 'Forex' },
  USDJPY: { display: 'USD/JPY', segment: 'Forex' },
  AUDUSD: { display: 'AUD/USD', segment: 'Forex' },
  USDCAD: { display: 'USD/CAD', segment: 'Forex' },
  NZDUSD: { display: 'NZD/USD', segment: 'Forex' },
  EURGBP: { display: 'EUR/GBP', segment: 'Forex' },
  EURJPY: { display: 'EUR/JPY', segment: 'Forex' },
  XAUUSD: { display: 'Gold', segment: 'Commodities' },
  XAGUSD: { display: 'Silver', segment: 'Commodities' },
  USOIL: { display: 'Crude Oil', segment: 'Commodities' },
  US30: { display: 'Dow Jones', segment: 'Indices' },
  NAS100: { display: 'NASDAQ', segment: 'Indices' },
  US500: { display: 'S&P 500', segment: 'Indices' },
  BTCUSD: { display: 'Bitcoin', segment: 'Crypto' },
  ETHUSD: { display: 'Ethereum', segment: 'Crypto' },
  LTCUSD: { display: 'Litecoin', segment: 'Crypto' },
  XRPUSD: { display: 'Ripple', segment: 'Crypto' },
  SOLUSD: { display: 'Solana', segment: 'Crypto' },
  EURCHF: { display: 'EUR/CHF', segment: 'Forex' },
  GBPCHF: { display: 'GBP/CHF', segment: 'Forex' },
  AUDJPY: { display: 'AUD/JPY', segment: 'Forex' },
  CADJPY: { display: 'CAD/JPY', segment: 'Forex' },
  NZDJPY: { display: 'NZD/JPY', segment: 'Forex' },
  USDHKD: { display: 'USD/HKD', segment: 'Forex' },
  UK100: { display: 'FTSE 100', segment: 'Indices' },
  GER40: { display: 'DAX 40', segment: 'Indices' },
};

function getDigits(symbol: string): number {
  if (['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'NZDJPY'].includes(symbol)) return 3;
  if (symbol === 'XRPUSD') return 4;
  if (['XAUUSD', 'USOIL', 'BTCUSD', 'ETHUSD', 'LTCUSD', 'SOLUSD'].includes(symbol)) return 2;
  if (['US30', 'US500', 'NAS100', 'UK100', 'GER40'].includes(symbol)) return 1;
  return 5;
}

import MobileOrderSheet from '@/components/trading/MobileOrderSheet';

export default function Watchlist() {
  const router = useRouter();
  const { watchlist, prices, prevPrices, selectedSymbol, setSelectedSymbol } = useTradingStore();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('All');
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({});
  const [activeOrderSymbol, setActiveOrderSymbol] = useState<string | null>(null);
  const sessionOpenRef = useRef<Record<string, number>>({});

  useEffect(() => {
    for (const symbol of watchlist) {
      const tick = prices[symbol];
      if (tick && !(symbol in sessionOpenRef.current)) {
        sessionOpenRef.current[symbol] = tick.bid;
      }
    }
  }, [prices, watchlist]);

  useEffect(() => {
    const newFlash: Record<string, 'up' | 'down'> = {};
    for (const symbol of watchlist) {
      const tick = prices[symbol];
      const prev = prevPrices[symbol];
      if (tick && prev !== undefined) {
        if (tick.bid > prev) newFlash[symbol] = 'up';
        else if (tick.bid < prev) newFlash[symbol] = 'down';
      }
    }
    if (Object.keys(newFlash).length > 0) {
      setFlashMap((p) => ({ ...p, ...newFlash }));
      const t = setTimeout(() => {
        setFlashMap((p) => {
          const next = { ...p };
          for (const k of Object.keys(newFlash)) delete next[k];
          return next;
        });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [prices, prevPrices, watchlist]);

  const filtered = watchlist.filter((s) => {
    if (search && !s.toLowerCase().includes(search.toLowerCase())) return false;
    if (segment !== 'All' && segment !== 'Starred' && SYMBOL_META[s]?.segment !== segment) return false;
    return true;
  });

  const handleSwitchToChart = (symbol: string) => {
    setSelectedSymbol(symbol);
    router.push(`/trading?view=chart`);
  };

  return (
    <div className="h-full flex flex-col bg-bg-primary border-r border-border-glass">
      {/* Search Bar */}
      <div className="p-3">
        <div className="relative group">
          <div className="absolute inset-0 bg-buy/5 blur-xl group-focus-within:bg-buy/10 transition-colors pointer-events-none" />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search instruments..."
            className="w-full !px-10 !py-3 !text-sm !bg-bg-secondary/50 !border-border-glass !rounded-xl focus:!border-buy/50 focus:!ring-1 focus:!ring-buy/20 placeholder:text-text-tertiary/60 transition-all font-medium"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 px-3 pb-3 border-b border-border-glass overflow-x-auto scrollbar-hide no-scrollbar">
        {['All', 'Starred', ...SEGMENTS.slice(1)].map((seg) => (
          <button
            key={seg}
            onClick={() => setSegment(seg)}
            className={clsx(
              'px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200 whitespace-nowrap border',
              segment === seg
                ? 'bg-buy text-white border-buy shadow-lg shadow-buy/20'
                : 'bg-bg-secondary text-text-tertiary border-border-glass hover:text-text-secondary hover:border-text-tertiary/30'
            )}
          >
            {seg}
          </button>
        ))}
      </div>

      {/* Instruments List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border-glass/30">
        {filtered.map((symbol) => {
          const tick = prices[symbol];
          const meta = SYMBOL_META[symbol];
          const digits = getDigits(symbol);
          const flash = flashMap[symbol];

          return (
            <div
              key={symbol}
              onClick={() => setActiveOrderSymbol(symbol)}
              className={clsx(
                'group grid grid-cols-[auto_minmax(0,1fr)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_auto] items-center gap-x-2 gap-y-1 px-3 py-3.5 transition-all active:bg-buy/5 cursor-pointer border-l-2 border-transparent hover:bg-bg-hover/30 overflow-hidden'
              )}
            >
              {/* Star Icon */}
              <button 
                onClick={(e) => { e.stopPropagation(); }} 
                className="shrink-0 p-1 text-text-tertiary hover:text-buy transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill={symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" className={symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 'text-warning' : 'opacity-40'}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>

              {/* Name & Desc */}
              <div className="min-w-0 overflow-hidden">
                <div className="text-[15px] font-bold text-text-primary tracking-tight truncate">{symbol}</div>
                <div className="text-[11px] font-medium text-text-tertiary/70 uppercase truncate">{meta?.display || symbol}</div>
              </div>

              {/* Bid */}
              <div className="text-right min-w-0 whitespace-nowrap justify-self-end">
                <div className={clsx(
                  'text-[14px] sm:text-[15px] font-bold tabular-nums font-mono tracking-tight transition-colors',
                  flash === 'up' ? 'text-buy' : flash === 'down' ? 'text-sell' : 'text-sell'
                )}>
                  {tick ? tick.bid.toFixed(digits) : '--'}
                </div>
                <div className="text-[10px] font-bold text-text-tertiary/40 uppercase tracking-widest">Bid</div>
              </div>

              {/* Ask */}
              <div className="text-right min-w-0 whitespace-nowrap justify-self-end">
                <div className={clsx(
                  'text-[14px] sm:text-[15px] font-bold tabular-nums font-mono tracking-tight transition-colors',
                  flash === 'up' ? 'text-buy' : flash === 'down' ? 'text-sell' : 'text-sell'
                )}>
                  {tick ? tick.ask.toFixed(digits) : '--'}
                </div>
                <div className="text-[10px] font-bold text-text-tertiary/40 uppercase tracking-widest">Ask</div>
              </div>

              {/* Action: Chart Icon */}
              <button 
                onClick={(e) => { e.stopPropagation(); handleSwitchToChart(symbol); }}
                className="shrink-0 w-8 h-8 rounded-lg bg-bg-secondary border border-border-glass flex items-center justify-center hover:bg-bg-hover transition-colors group-hover:border-buy/30"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-text-tertiary group-hover:text-buy transition-colors">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 12l4-4 4 4 6-6" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {activeOrderSymbol && (
        <MobileOrderSheet 
          symbol={activeOrderSymbol} 
          onClose={() => setActiveOrderSymbol(null)} 
        />
      )}
    </div>
  );
}
