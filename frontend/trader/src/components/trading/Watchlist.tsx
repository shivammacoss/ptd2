'use client';

import { useState, useEffect, useRef } from 'react';
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
};

function getDigits(symbol: string): number {
  if (['USDJPY', 'EURJPY', 'GBPJPY'].includes(symbol)) return 3;
  if (['XAUUSD', 'USOIL', 'BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD'].includes(symbol)) return 2;
  if (['US30', 'US500', 'NAS100'].includes(symbol)) return 1;
  return 5;
}

export default function Watchlist() {
  const { watchlist, prices, prevPrices, selectedSymbol, setSelectedSymbol } = useTradingStore();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('All');
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({});
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
    if (segment !== 'All' && SYMBOL_META[s]?.segment !== segment) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-bg-secondary border-r border-border-glass">
      <div className="p-2 border-b border-border-glass">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbols"
            className="!py-1.5 !pl-9 !pr-3 !text-xs !rounded-lg w-full"
          />
        </div>
      </div>

      <div className="flex gap-0.5 px-2 py-1.5 border-b border-border-glass overflow-x-auto">
        {SEGMENTS.map((seg) => (
          <button
            key={seg}
            onClick={() => setSegment(seg)}
            className={clsx(
              'px-2 py-1 text-xxs rounded-md transition-fast whitespace-nowrap',
              segment === seg
                ? 'skeu-btn-buy text-text-inverse'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover/50'
            )}
          >
            {seg}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.map((symbol) => {
          const tick = prices[symbol];
          const meta = SYMBOL_META[symbol];
          const digits = getDigits(symbol);
          const flash = flashMap[symbol];
          const isSelected = symbol === selectedSymbol;

          const openPrice = sessionOpenRef.current[symbol];
          const change = tick && openPrice ? ((tick.bid - openPrice) / openPrice) * 100 : 0;

          return (
            <button
              key={symbol}
              onClick={() => setSelectedSymbol(symbol)}
              className={clsx(
                'w-full flex items-center justify-between px-3 py-2 text-left transition-all duration-100',
                isSelected && 'bg-buy/[0.06] border-l-2 border-buy',
                !isSelected && 'hover:bg-bg-hover/40 border-l-2 border-transparent',
                flash === 'up' && 'flash-blue',
                flash === 'down' && 'flash-red',
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{symbol}</div>
                <div className="text-xxs text-text-tertiary truncate">{meta?.display || symbol}</div>
              </div>
              <div className="text-right shrink-0 ml-2">
                {tick ? (
                  <>
                    <div className={clsx(
                      'text-sm font-mono tabular-nums font-medium',
                      flash === 'up' ? 'text-buy' : flash === 'down' ? 'text-sell' : 'text-text-primary'
                    )}>
                      {tick.bid.toFixed(digits)}
                    </div>
                    <div className={clsx('text-xxs font-mono tabular-nums', change >= 0 ? 'text-buy' : 'text-sell')}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </div>
                  </>
                ) : (
                  <div className="text-xxs text-text-tertiary">--</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
