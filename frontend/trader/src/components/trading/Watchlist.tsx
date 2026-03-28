'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTradingStore, InstrumentInfo } from '@/stores/tradingStore';
import { clsx } from 'clsx';
import MobileOrderSheet from '@/components/trading/MobileOrderSheet';

type Trend = 'up' | 'down' | 'neutral';

const SEGMENTS = ['All', 'Forex', 'Commodities', 'Indices', 'Crypto'];

/** MT5 mobile palette */
const MT5 = {
  bg: '#000000',
  muted: '#808080',
  up: '#50A5F1',
  down: '#EC5B5B',
  tabActive: '#50A5F1',
  corner: '#EC5B5B',
} as const;

const SYMBOL_META: Record<string, { display: string; segment: string }> = {
  EURUSD: { display: 'EUR/USD', segment: 'Forex' },
  GBPUSD: { display: 'GBP/USD', segment: 'Forex' },
  USDJPY: { display: 'USD/JPY', segment: 'Forex' },
  AUDUSD: { display: 'AUD/USD', segment: 'Forex' },
  USDCAD: { display: 'USD/CAD', segment: 'Forex' },
  USDCHF: { display: 'USD/CHF', segment: 'Forex' },
  NZDUSD: { display: 'NZD/USD', segment: 'Forex' },
  EURGBP: { display: 'EUR/GBP', segment: 'Forex' },
  EURJPY: { display: 'EUR/JPY', segment: 'Forex' },
  GBPJPY: { display: 'GBP/JPY', segment: 'Forex' },
  EURCHF: { display: 'EUR/CHF', segment: 'Forex' },
  GBPCHF: { display: 'GBP/CHF', segment: 'Forex' },
  AUDJPY: { display: 'AUD/JPY', segment: 'Forex' },
  AUDNZD: { display: 'AUD/NZD', segment: 'Forex' },
  AUDCAD: { display: 'AUD/CAD', segment: 'Forex' },
  AUDCHF: { display: 'AUD/CHF', segment: 'Forex' },
  CADJPY: { display: 'CAD/JPY', segment: 'Forex' },
  NZDJPY: { display: 'NZD/JPY', segment: 'Forex' },
  USDHKD: { display: 'USD/HKD', segment: 'Forex' },
  XAUUSD: { display: 'Gold', segment: 'Commodities' },
  XAGUSD: { display: 'Silver', segment: 'Commodities' },
  USOIL: { display: 'Crude Oil', segment: 'Commodities' },
  US30: { display: 'Dow Jones', segment: 'Indices' },
  NAS100: { display: 'NASDAQ', segment: 'Indices' },
  US500: { display: 'S&P 500', segment: 'Indices' },
  UK100: { display: 'FTSE 100', segment: 'Indices' },
  GER40: { display: 'DAX 40', segment: 'Indices' },
  BTCUSD: { display: 'Bitcoin', segment: 'Crypto' },
  ETHUSD: { display: 'Ethereum', segment: 'Crypto' },
  LTCUSD: { display: 'Litecoin', segment: 'Crypto' },
  XRPUSD: { display: 'Ripple', segment: 'Crypto' },
  SOLUSD: { display: 'Solana', segment: 'Crypto' },
};

function getDigits(symbol: string): number {
  if (['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'NZDJPY'].includes(symbol)) return 3;
  if (symbol === 'XRPUSD') return 4;
  if (['XAUUSD', 'USOIL', 'BTCUSD', 'ETHUSD', 'LTCUSD', 'SOLUSD'].includes(symbol)) return 2;
  if (['US30', 'US500', 'NAS100', 'UK100', 'GER40'].includes(symbol)) return 1;
  return 5;
}

function splitPip(priceStr: string): { prefix: string; large: string; pip: string } {
  const dotIdx = priceStr.indexOf('.');
  if (dotIdx === -1) {
    const l = priceStr.length;
    return { prefix: priceStr.slice(0, Math.max(0, l - 3)), large: priceStr.slice(Math.max(0, l - 3), l - 1), pip: priceStr.slice(-1) };
  }
  const dec = priceStr.slice(dotIdx + 1);
  if (dec.length === 0) return { prefix: priceStr, large: '', pip: '' };
  if (dec.length === 1) return { prefix: priceStr.slice(0, dotIdx + 1), large: dec, pip: '' };
  const pip = dec.slice(-1);
  const largeStart = Math.max(0, dec.length - 3);
  const large = dec.slice(largeStart, dec.length - 1);
  const smallDec = dec.slice(0, largeStart);
  return { prefix: priceStr.slice(0, dotIdx + 1) + smallDec, large, pip };
}

// Helper functions and mock data
const sessionStats: Record<string, { open: number }> = {};

function pointsDelta(current: number, open: number, digits: number): number {
  const multiplier = Math.pow(10, digits - 1);
  return Math.round((current - open) * multiplier);
}

export default function Watchlist() {
  const router = useRouter();
  const { watchlist, prices, prevPrices, selectedSymbol, setSelectedSymbol, instruments } = useTradingStore();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('All');
  const [flashMap, setFlashMap] = useState<Record<string, Trend>>({});
  const [activeOrderSymbol, setActiveOrderSymbol] = useState<string | null>(null);

  const sessionOpenRef = useRef<Record<string, number>>({});
  const dayLowRef = useRef<Record<string, number>>({});
  const dayHighRef = useRef<Record<string, number>>({});
  const lastTimeRef = useRef<Record<string, string>>({});

  useEffect(() => {
    for (const symbol of watchlist) {
      const tick = prices[symbol];
      if (!tick) continue;
      if (!(symbol in sessionOpenRef.current)) {
        sessionOpenRef.current[symbol] = tick.bid;
        dayLowRef.current[symbol] = tick.bid;
        dayHighRef.current[symbol] = tick.bid;
      } else {
        if (tick.bid < dayLowRef.current[symbol]) dayLowRef.current[symbol] = tick.bid;
        if (tick.bid > dayHighRef.current[symbol]) dayHighRef.current[symbol] = tick.bid;
      }
      lastTimeRef.current[symbol] = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
  }, [prices, watchlist]);

  useEffect(() => {
    const newFlash: Record<string, Trend> = {};
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
      }, 180);
      return () => clearTimeout(t);
    }
  }, [prices, prevPrices, watchlist]);

  const filtered = watchlist.filter((s) => {
    if (search && !s.toLowerCase().includes(search.toLowerCase())) return false;
    if (segment !== 'All' && segment !== 'Starred' && SYMBOL_META[s]?.segment !== segment) return false;
    return true;
  });

  const handleRowClick = (symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveOrderSymbol(symbol);
    router.push(`/trading?view=chart`);
  };

  const displayFor = useCallback(
    (symbol: string) =>
      instruments.find((i: InstrumentInfo) => i.symbol === symbol)?.display_name ||
      SYMBOL_META[symbol]?.display ||
      symbol,
    [instruments],
  );

  return (
    <div
      className="h-full min-h-0 flex flex-col border-r border-white/[0.08]"
      style={{ backgroundColor: MT5.bg }}
    >
      {/* Search */}
      <div className="p-3 shrink-0">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40"
            style={{ color: MT5.muted }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search instruments..."
            className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-white/10 bg-white/[0.06] text-white placeholder:text-white/35 outline-none focus:border-[#50A5F1]/50 focus:ring-1 focus:ring-[#50A5F1]/20"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 px-3 pb-3 border-b border-white/[0.08] overflow-x-auto scrollbar-hide no-scrollbar shrink-0">
        {['All', 'Starred', ...SEGMENTS.slice(1)].map((seg) => (
          <button
            key={seg}
            type="button"
            onClick={() => setSegment(seg)}
            className={clsx(
              'px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200 whitespace-nowrap border',
              segment === seg
                ? 'bg-buy text-white border-buy shadow-lg shadow-buy/20'
                : 'bg-bg-secondary text-text-tertiary border-border-glass hover:text-text-secondary hover:border-text-tertiary/30',
            )}
            style={
              segment === seg
                ? { backgroundColor: MT5.tabActive, boxShadow: '0 4px 14px rgba(80,165,241,0.25)' }
                : undefined
            }
          >
            {seg}
          </button>
        ))}
      </div>

      {/* Instruments — MT5 row layout (scrolls full height inside sidebar) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y">
        {filtered.map((symbol) => {
          const tick = prices[symbol];
          const digits = getDigits(symbol);
          const flash = flashMap[symbol];
          const trend: Trend = flash ?? 'neutral';
          const sess = sessionStats[symbol];
          const open = sess?.open;
          const pts = tick && open != null ? pointsDelta(tick.bid, open, digits) : null;
          const pctNum =
            tick && open != null && open !== 0 ? ((tick.bid - open) / open) * 100 : null;
          const ptsStr = pts != null ? `${pts > 0 ? '+' : ''}${pts}` : '—';
          const pctStr =
            pctNum != null ? `${pctNum >= 0 ? '+' : ''}${pctNum.toFixed(2)}%` : '—%';
          const changePositive = pts != null && pts > 0;
          const changeNegative = pts != null && pts < 0;
          const pip = Math.pow(10, -digits);
          const spreadPips = tick && pip > 0 ? Math.max(0, Math.round(tick.spread / pip)) : 0;
          const isSelected = selectedSymbol === symbol;

          const sessionOpen = sessionOpenRef.current[symbol];
          const dayLow = dayLowRef.current[symbol];
          const dayHigh = dayHighRef.current[symbol];
          const lastTime = lastTimeRef.current[symbol];

          const pipChange =
            tick && sessionOpen != null
              ? Math.round((tick.bid - sessionOpen) * Math.pow(10, digits - 1))
              : null;
          const pctChange =
            tick && sessionOpen != null && sessionOpen !== 0
              ? ((tick.bid - sessionOpen) / sessionOpen) * 100
              : null;
          const spread =
            tick != null
              ? Math.round((tick.ask - tick.bid) * Math.pow(10, digits - 1))
              : null;

          const bidSplit = tick ? splitPip(tick.bid.toFixed(digits)) : null;
          const askSplit = tick ? splitPip(tick.ask.toFixed(digits)) : null;

          const priceColor =
            flash === 'up'
              ? 'text-buy'
              : flash === 'down'
                ? 'text-sell'
                : pctChange != null && pctChange > 0
                  ? 'text-buy'
                  : 'text-sell';

          return (
            <div
              key={symbol}
              onClick={() => handleRowClick(symbol)}
              className={clsx(
                'cursor-pointer hover:bg-bg-hover/30 active:bg-buy/5 transition-colors px-3 py-3 border-l-2',
                symbol === selectedSymbol ? 'border-buy bg-buy/5' : 'border-transparent hover:border-buy/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                {/* ── Left: change badge · symbol name · time + spread ── */}
                <div className="min-w-0 flex flex-col gap-0.5">
                  {/* pip change + % change */}
                  <div className="flex items-center gap-1.5 h-4">
                    {pipChange != null && (
                      <span
                        className={clsx(
                          'text-[11px] font-mono leading-none',
                          pipChange >= 0 ? 'text-buy' : 'text-sell',
                        )}
                      >
                        {pipChange >= 0 ? '+' : ''}
                        {pipChange}
                      </span>
                    )}
                    {pctChange != null && (
                      <span
                        className={clsx(
                          'text-[11px] font-bold leading-none',
                          pctChange >= 0 ? 'text-buy' : 'text-sell',
                        )}
                      >
                        {pctChange >= 0 ? '+' : ''}
                        {pctChange.toFixed(2)}%
                      </span>
                    )}
                  </div>

                  {/* Symbol name — large bold */}
                  <div className="text-[18px] sm:text-[19px] font-extrabold text-text-primary tracking-tight leading-tight">
                    {symbol}
                  </div>

                  {/* time · spread */}
                  <div className="flex items-center gap-2 text-[10px] text-text-tertiary font-mono">
                    {lastTime && <span>{lastTime}</span>}
                    {spread != null && (
                      <span className="flex items-center gap-0.5">
                        <span className="font-bold not-italic">⇔</span>
                        <span>{spread}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Right: formatted bid · ask  +  L/H ── */}
                <div className="flex flex-col items-end shrink-0 gap-0.5">
                  {/* Bid + Ask in pip format */}
                  <div className="flex items-baseline gap-3">
                    {/* Bid */}
                    <div className={clsx('font-mono flex items-baseline transition-colors', priceColor)}>
                      {bidSplit ? (
                        <>
                          <span className="text-[13px] leading-none">{bidSplit.prefix}</span>
                          <span className="text-[22px] font-bold leading-none">{bidSplit.large}</span>
                          {bidSplit.pip && (
                            <span className="text-[12px] font-bold leading-none self-start mt-0.5">
                              {bidSplit.pip}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[15px]">--</span>
                      )}
                    </div>

                    {/* Ask */}
                    <div className={clsx('font-mono flex items-baseline transition-colors', priceColor)}>
                      {askSplit ? (
                        <>
                          <span className="text-[13px] leading-none">{askSplit.prefix}</span>
                          <span className="text-[22px] font-bold leading-none">{askSplit.large}</span>
                          {askSplit.pip && (
                            <span className="text-[12px] font-bold leading-none self-start mt-0.5">
                              {askSplit.pip}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[15px]">--</span>
                      )}
                    </div>
                  </div>

                  {/* Session Low / High */}
                  {tick && dayLow != null && dayHigh != null && (
                    <div className="flex gap-3 text-[10px] text-text-tertiary font-mono">
                      <span>L: {dayLow.toFixed(digits)}</span>
                      <span>H: {dayHigh.toFixed(digits)}</span>
                    </div>
                  )}
                </div>
              </div>
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
