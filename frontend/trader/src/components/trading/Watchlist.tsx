'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTradingStore, InstrumentInfo } from '@/stores/tradingStore';
import { clsx } from 'clsx';
import MobileOrderSheet from '@/components/trading/MobileOrderSheet';

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

function fallbackDigits(symbol: string): number {
  if (['USDJPY', 'EURJPY', 'GBPJPY'].includes(symbol)) return 3;
  if (['XAUUSD', 'USOIL', 'BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD'].includes(symbol)) return 2;
  if (['US30', 'US500', 'NAS100'].includes(symbol)) return 1;
  return 5;
}

function formatTickTime(iso?: string): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

type Trend = 'up' | 'down' | 'neutral';

function pointsDelta(bid: number, open: number, digits: number): number {
  return Math.round((bid - open) * 10 ** digits);
}

/** MT5-style quote: small prefix + bold “pips” + superscript pipette. Bid/ask = classic red/cyan. */
function Mt5Price({
  value,
  digits,
  trend,
  quoteSide,
  compact,
}: {
  value: number;
  digits: number;
  trend: Trend;
  quoteSide?: 'bid' | 'ask';
  compact?: boolean;
}) {
  const color =
    quoteSide === 'bid'
      ? MT5.down
      : quoteSide === 'ask'
        ? MT5.up
        : trend === 'up'
          ? MT5.up
          : trend === 'down'
            ? MT5.down
            : MT5.muted;
  const s = value.toFixed(digits);
  const dot = s.indexOf('.');
  const sm = compact ? 'text-[11px] sm:text-[12px]' : 'text-[12px] sm:text-[13px]';
  const md = compact ? 'text-[13px] sm:text-[15px]' : 'text-[15px] sm:text-[18px]';
  const xs = compact ? 'text-[7px] sm:text-[8px]' : 'text-[8px] sm:text-[9px]';
  const plain = compact ? 'text-[12px] sm:text-[13px]' : 'text-[13px] sm:text-[14px]';
  if (dot < 0) {
    return (
      <span className={clsx('font-mono tabular-nums font-semibold', plain)} style={{ color }}>
        {s}
      </span>
    );
  }
  const intp = s.slice(0, dot);
  const frac = s.slice(dot + 1).padEnd(digits, '0').slice(0, digits);
  if (frac.length < 3) {
    return (
      <span className={clsx('font-mono tabular-nums font-semibold', plain)} style={{ color }}>
        {intp}.{frac}
      </span>
    );
  }
  const pipette = frac.slice(-1);
  const bigPips = frac.slice(-3, -1);
  const smallFrac = frac.slice(0, -3);

  return (
    <span className="font-mono tabular-nums inline-flex items-baseline leading-none" style={{ color }}>
      <span className={clsx(sm, 'font-semibold tracking-tight')}>
        {intp}.{smallFrac}
      </span>
      <span className={clsx(md, 'font-black tracking-tighter mx-[0.5px]')}>{bigPips}</span>
      <span className={clsx(xs, 'font-bold self-start mt-[2px] ml-[0.5px]')}>{pipette}</span>
    </span>
  );
}

function SpreadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
      <path d="M0 4.5h2.5M8.5 4.5H11M2.5 2v5M8.5 2v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function Watchlist() {
  const router = useRouter();
  const { watchlist, prices, prevPrices, selectedSymbol, setSelectedSymbol, instruments } = useTradingStore();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('All');
  const [flashMap, setFlashMap] = useState<Record<string, Trend>>({});
  const [activeOrderSymbol, setActiveOrderSymbol] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<
    Record<string, { open: number; high: number; low: number }>
  >({});

  const digitsFor = useCallback(
    (symbol: string) => instruments.find((i: InstrumentInfo) => i.symbol === symbol)?.digits ?? fallbackDigits(symbol),
    [instruments],
  );

  const pipFor = useCallback(
    (symbol: string) => instruments.find((i: InstrumentInfo) => i.symbol === symbol)?.pip_size ?? 0.0001,
    [instruments],
  );

  useEffect(() => {
    setSessionStats((prev) => {
      const next = { ...prev };
      for (const symbol of watchlist) {
        const t = prices[symbol];
        if (!t) continue;
        const cur = next[symbol];
        if (!cur) next[symbol] = { open: t.bid, high: t.bid, low: t.bid };
        else next[symbol] = { ...cur, high: Math.max(cur.high, t.bid), low: Math.min(cur.low, t.bid) };
      }
      return next;
    });
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

  const handleSwitchToChart = (symbol: string) => {
    setSelectedSymbol(symbol);
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
                ? 'text-black border-transparent shadow-lg'
                : 'bg-transparent text-white/45 border-white/10 hover:text-white/70',
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
          const digits = digitsFor(symbol);
          const pip = pipFor(symbol);
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
          const spreadPips = tick && pip > 0 ? Math.max(0, Math.round(tick.spread / pip)) : 0;
          const isSelected = selectedSymbol === symbol;

          return (
            <div
              key={symbol}
              role="button"
              tabIndex={0}
              onClick={() => setActiveOrderSymbol(symbol)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveOrderSymbol(symbol);
                }
              }}
              className={clsx(
                'relative grid w-full grid-cols-[auto_minmax(7rem,1fr)_auto] gap-x-2 sm:gap-x-3 items-center px-3 py-3 sm:px-4 sm:py-3.5 border-b border-white/[0.06] transition-colors',
                'active:bg-white/[0.04] cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#50A5F1]/40',
              )}
            >
              {isSelected && (
                <div
                  className="absolute bottom-0 left-0 z-10 w-0 h-0 border-[7px] border-transparent"
                  style={{ borderBottomColor: MT5.corner, borderLeftColor: MT5.corner }}
                  aria-hidden
                />
              )}

              {/* Star */}
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 self-center p-1 opacity-40 hover:opacity-80 transition-opacity"
                style={{ color: MT5.muted }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
              </button>

              {/* Left column — full symbol / name (no ellipsis) */}
              <div className="min-w-0 flex flex-col gap-0.5 justify-center overflow-visible">
                <div
                  className={clsx(
                    'text-[11px] sm:text-xs font-bold font-mono tabular-nums tracking-tight leading-tight',
                    changePositive && 'text-[#50A5F1]',
                    changeNegative && 'text-[#EC5B5B]',
                    pts == null && 'text-[#808080]',
                  )}
                >
                  {pts != null && pctNum != null ? `${ptsStr} ${pctStr}` : '—  —%'}
                </div>
                <div className="flex items-start gap-1.5 min-w-0">
                  <span className="text-[15px] sm:text-base font-black text-white tracking-tight break-words [overflow-wrap:anywhere]">
                    {symbol}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSwitchToChart(symbol);
                    }}
                    className="shrink-0 p-1 rounded-md hover:bg-white/10 opacity-50 hover:opacity-90 transition-all"
                    style={{ color: MT5.muted }}
                    title="Chart"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 12l4-4 4 4 6-6" />
                    </svg>
                  </button>
                </div>
                <div
                  className="text-[10px] font-medium uppercase tracking-wide break-words [overflow-wrap:anywhere] opacity-50 leading-snug"
                  style={{ color: MT5.muted }}
                >
                  {displayFor(symbol)}
                </div>
                <div
                  className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums mt-0.5"
                  style={{ color: MT5.muted }}
                >
                  <span>{formatTickTime(tick?.timestamp)}</span>
                  <SpreadIcon className="shrink-0 opacity-70" />
                  <span>{spreadPips}</span>
                </div>
              </div>

              {/* Right column — bid / ask (red/cyan) + labels + session range */}
              <div className="shrink-0 flex flex-col items-end justify-center gap-1 pr-0.5 min-w-0">
                <div className="flex items-end gap-2 sm:gap-3">
                  {tick ? (
                    <>
                      <div className="flex flex-col items-end gap-0.5">
                        <Mt5Price value={tick.bid} digits={digits} trend={trend} quoteSide="bid" compact />
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-60" style={{ color: MT5.muted }}>
                          Bid
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <Mt5Price value={tick.ask} digits={digits} trend={trend} quoteSide="ask" compact />
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-60" style={{ color: MT5.muted }}>
                          Ask
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm font-mono" style={{ color: MT5.muted }}>
                      — / —
                    </span>
                  )}
                </div>
                <div
                  className="text-[9px] sm:text-[10px] font-mono tabular-nums text-right leading-tight max-w-[min(100%,14rem)] break-words"
                  style={{ color: MT5.muted }}
                >
                  {sess && tick ? (
                    <>
                      L: {sess.low.toFixed(digits)}&nbsp;&nbsp;H: {sess.high.toFixed(digits)}
                    </>
                  ) : (
                    'L: —  H: —'
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activeOrderSymbol && (
        <MobileOrderSheet symbol={activeOrderSymbol} onClose={() => setActiveOrderSymbol(null)} />
      )}
    </div>
  );
}
