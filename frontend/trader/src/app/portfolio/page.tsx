'use client';



import { useState, useEffect, useCallback } from 'react';

import { clsx } from 'clsx';

import toast from 'react-hot-toast';

import { Button } from '@/components/ui/Button';

import { Card, StatCard } from '@/components/ui/Card';

import { Tabs } from '@/components/ui/Tabs';

import TopBar from '@/components/layout/TopBar';

import api from '@/lib/api/client';



interface PortfolioSummary {

  total_balance: number;

  total_equity: number;

  total_unrealized_pnl: number;

  pnl_breakdown: {

    today: number;

    this_week: number;

    this_month: number;

    all_time: number;

  };

  holdings: Array<{

    symbol: string;

    side: string;

    lots: number;

    entry_price: number;

    current_price: number;

    pnl: number;

    pnl_pct: number;

  }>;

  open_positions_count: number;

}



interface PerformanceData {

  equity_curve: Array<{ date: string; equity: number }>;

  stats: {

    total_return: number;

    max_drawdown: number;

    sharpe_ratio: number;

    win_rate: number;

    total_trades: number;

  };

  monthly_breakdown: Array<{ month: string; pnl: number }>;

  symbol_breakdown: Array<{ symbol: string; pnl: number; trades: number }>;

}



interface Trade {

  id: string;

  symbol: string;

  side: string;

  lots: number;

  pnl: number;

  open_time: string;

  close_time: string;

  duration: string;

  entry_price: number;

  exit_price: number;

}



function fmt(n: number) {

  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);

}



const TIMEFRAMES = ['1M', '3M', '6M', '1Y', 'All'] as const;

const TF_TO_PERIOD: Record<string, string> = {

  '1M': '1m', '3M': '3m', '6M': '6m', '1Y': '1y', 'All': 'all',

};



export default function PortfolioPage() {

  const [tf, setTf] = useState('1M');

  const [tab, setTab] = useState('overview');

  const [page, setPage] = useState(1);



  const [summary, setSummary] = useState<PortfolioSummary | null>(null);

  const [performance, setPerformance] = useState<PerformanceData | null>(null);

  const [trades, setTrades] = useState<Trade[]>([]);

  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);



  const fetchData = useCallback(async () => {

    try {

      setLoading(true);

      setError(null);

      const period = TF_TO_PERIOD[tf] || 'all';

      const [sumRes, perfRes] = await Promise.all([

        api.get<PortfolioSummary>('/portfolio/summary'),

        api.get<PerformanceData>('/portfolio/performance', { period }),

      ]);

      setSummary(sumRes);

      setPerformance(perfRes);

    } catch (err: unknown) {

      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to load portfolio';

      setError(msg);

      toast.error(msg);

    } finally {

      setLoading(false);

    }

  }, [tf]);



  const fetchTrades = useCallback(async (p: number) => {

    try {

      const res = await api.get<{ items: Trade[]; total: number; pages: number }>(

        '/portfolio/trades',

        { page: String(p), per_page: '50' },

      );

      setTrades(res.items ?? []);

      setTotalPages(res.pages ?? 1);

    } catch (err: unknown) {

      toast.error(err instanceof Error ? err.message : 'Failed to load trades');

    }

  }, []);



  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => { if (tab === 'history') fetchTrades(page); }, [tab, page, fetchTrades]);



  const holdings = summary?.holdings ?? [];

  const stats = performance?.stats;

  const monthlies = performance?.monthly_breakdown ?? [];

  const equityCurve = performance?.equity_curve ?? [];



  const tabs = [

    { id: 'overview', label: 'Overview', count: holdings.length },

    { id: 'performance', label: 'Performance' },

    { id: 'history', label: 'Trade History' },

  ];



  if (loading) {

    return (

      <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">

        <TopBar />

        <div className="flex-1 flex items-center justify-center">

          <div className="flex flex-col items-center gap-3">

            <div className="w-8 h-8 border-2 border-buy border-t-transparent rounded-full animate-spin" />

            <span className="text-sm text-text-tertiary">Loading portfolio...</span>

          </div>

        </div>

      </div>

    );

  }



  if (error) {

    return (

      <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">

        <TopBar />

        <div className="flex-1 flex items-center justify-center">

          <div className="text-center space-y-3">

            <p className="text-sell text-sm">{error}</p>

            <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>

          </div>

        </div>

      </div>

    );

  }



  const maxEquity = equityCurve.length > 0 ? Math.max(...equityCurve.map((e) => e.equity)) : 1;

  const minEquity = equityCurve.length > 0 ? Math.min(...equityCurve.map((e) => e.equity)) : 0;

  const equityRange = maxEquity - minEquity || 1;



  return (

    <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">

      <TopBar />



      <div className="page-main space-y-4 sm:space-y-6">

        <h2 className="text-lg font-semibold text-text-primary">Portfolio</h2>



        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">

          <StatCard

            label="Total Balance"

            value={fmt(summary?.total_balance ?? 0)}

            subValue={summary ? `${((summary.total_unrealized_pnl / (summary.total_balance || 1)) * 100).toFixed(2)}%` : '—'}

            trend={(summary?.total_unrealized_pnl ?? 0) >= 0 ? 'up' : 'down'}

          />

          <StatCard

            label="Total P&L"

            value={`${(summary?.pnl_breakdown?.all_time ?? 0) >= 0 ? '+' : ''}${fmt(summary?.pnl_breakdown?.all_time ?? 0)}`}

            trend={(summary?.pnl_breakdown?.all_time ?? 0) >= 0 ? 'up' : 'down'}

          />

          <StatCard

            label="Win Rate"

            value={stats ? `${stats.win_rate.toFixed(1)}%` : '—'}

            subValue={stats ? `${stats.total_trades} trades` : '—'}

          />

          <StatCard

            label="Sharpe Ratio"

            value={stats ? stats.sharpe_ratio.toFixed(2) : '—'}

          />

        </div>



        {/* Equity Curve */}

        <Card variant="glass" padding="none">

          <div className="flex items-center justify-between px-4 py-3 border-b border-border-glass">

            <h3 className="text-md font-semibold text-text-primary">Equity Curve</h3>

            <div className="flex gap-0.5">

              {TIMEFRAMES.map((t) => (

                <button

                  key={t}

                  onClick={() => setTf(t)}

                  className={clsx(

                    'px-2 py-1 text-[10px] rounded-md transition-all',

                    tf === t ? 'skeu-btn-buy text-text-inverse' : 'text-text-tertiary hover:bg-bg-hover',

                  )}

                >

                  {t}

                </button>

              ))}

            </div>

          </div>

          <div className="p-4 h-48 flex items-end gap-px">

            {equityCurve.length > 0 ? (

              equityCurve.map((point, i) => {

                const pct = ((point.equity - minEquity) / equityRange) * 100;

                return (

                  <div

                    key={i}

                    className="flex-1 bg-gradient-to-t from-buy/60 to-buy/20 rounded-t-sm transition-all hover:from-buy/80 hover:to-buy/40"

                    style={{ height: `${Math.max(pct, 2)}%` }}

                    title={`${new Date(point.date).toLocaleDateString()}: ${fmt(point.equity)}`}

                  />

                );

              })

            ) : (

              <div className="flex-1 flex items-center justify-center text-sm text-text-tertiary">

                No equity data available

              </div>

            )}

          </div>

        </Card>



        {/* Stats Row */}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">

          <StatCard label="Total Trades" value={stats ? String(stats.total_trades) : '0'} />

          <StatCard

            label="Total Return"

            value={stats ? `${stats.total_return >= 0 ? '+' : ''}${stats.total_return.toFixed(2)}%` : '—'}

            trend={stats && stats.total_return >= 0 ? 'up' : 'down'}

          />

          <StatCard

            label="Max Drawdown"

            value={stats ? `${stats.max_drawdown.toFixed(2)}%` : '—'}

            trend="down"

          />

          <StatCard

            label="P&L Today"

            value={`${(summary?.pnl_breakdown?.today ?? 0) >= 0 ? '+' : ''}${fmt(summary?.pnl_breakdown?.today ?? 0)}`}

            trend={(summary?.pnl_breakdown?.today ?? 0) >= 0 ? 'up' : 'down'}

          />

        </div>



        <div className="emboss-divider" />



        <Tabs tabs={tabs} active={tab} onChange={setTab} />



        {tab === 'overview' && (

          <Card variant="glass" padding="none">

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead>

                  <tr className="border-b border-border-glass">

                    <th className="px-4 py-3 text-left text-xs text-text-tertiary font-medium">Symbol</th>

                    <th className="px-4 py-3 text-left text-xs text-text-tertiary font-medium">Side</th>

                    <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">Lots</th>

                    <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">Entry</th>

                    <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">Current</th>

                    <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">P&L</th>

                  </tr>

                </thead>

                <tbody>

                  {holdings.length === 0 ? (

                    <tr>

                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-tertiary">

                        No open positions

                      </td>

                    </tr>

                  ) : (

                    holdings.map((h, i) => (

                      <tr key={i} className="border-b border-border-glass/50 hover:bg-bg-hover/30 transition-all">

                        <td className="px-4 py-3 text-text-primary text-xs font-semibold">{h.symbol}</td>

                        <td className="px-4 py-3">

                          <span className={clsx('text-xs font-medium', h.side?.toLowerCase() === 'buy' ? 'text-buy' : 'text-sell')}>

                            {h.side}

                          </span>

                        </td>

                        <td className="px-4 py-3 text-right text-text-secondary text-xs font-mono">{h.lots}</td>

                        <td className="px-4 py-3 text-right text-text-secondary text-xs font-mono">{h.entry_price}</td>

                        <td className="px-4 py-3 text-right text-text-primary text-xs font-mono">{h.current_price}</td>

                        <td className="px-4 py-3 text-right">

                          <span className={clsx('text-xs font-mono font-semibold tabular-nums', h.pnl >= 0 ? 'text-buy' : 'text-sell')}>

                            {h.pnl >= 0 ? '+' : ''}{fmt(h.pnl)}

                          </span>

                          {h.pnl_pct !== undefined && (

                            <span className={clsx('text-[10px] ml-1', h.pnl_pct >= 0 ? 'text-buy' : 'text-sell')}>

                              ({h.pnl_pct >= 0 ? '+' : ''}{h.pnl_pct.toFixed(2)}%)

                            </span>

                          )}

                        </td>

                      </tr>

                    ))

                  )}

                </tbody>

              </table>

            </div>

          </Card>

        )}



        {tab === 'performance' && (

          <div className="space-y-6">

            <Card variant="glass" padding="none">

              <div className="px-4 py-3 border-b border-border-glass">

                <h3 className="text-md font-semibold text-text-primary">Monthly Breakdown</h3>

              </div>

              <div className="p-4 grid grid-cols-4 md:grid-cols-6 gap-2">

                {monthlies.length === 0 ? (

                  <div className="col-span-full text-center text-sm text-text-tertiary py-4">No monthly data</div>

                ) : (

                  monthlies.map((m) => (

                    <div

                      key={m.month}

                      className={clsx(

                        'rounded-lg p-3 text-center border glass-light',

                        m.pnl >= 0 ? 'border-buy/20' : 'border-sell/20',

                      )}

                    >

                      <div className="text-[10px] text-text-tertiary mb-1">{m.month}</div>

                      <div className={clsx('text-sm font-mono font-semibold tabular-nums', m.pnl >= 0 ? 'text-buy' : 'text-sell')}>

                        {m.pnl >= 0 ? '+' : ''}{m.pnl.toFixed(0)}

                      </div>

                    </div>

                  ))

                )}

              </div>

            </Card>



            {performance?.symbol_breakdown && performance.symbol_breakdown.length > 0 && (

              <Card variant="glass" padding="none">

                <div className="px-4 py-3 border-b border-border-glass">

                  <h3 className="text-md font-semibold text-text-primary">Symbol Breakdown</h3>

                </div>

                <div className="p-4 space-y-2">

                  {performance.symbol_breakdown.map((s) => (

                    <div key={s.symbol} className="flex items-center justify-between py-2 border-b border-border-glass/50">

                      <div>

                        <span className="text-sm font-medium text-text-primary">{s.symbol}</span>

                        <span className="text-xs text-text-tertiary ml-2">{s.trades} trades</span>

                      </div>

                      <span className={clsx('text-sm font-mono font-semibold tabular-nums', s.pnl >= 0 ? 'text-buy' : 'text-sell')}>

                        {s.pnl >= 0 ? '+' : ''}{fmt(s.pnl)}

                      </span>

                    </div>

                  ))}

                </div>

              </Card>

            )}

          </div>

        )}



        {tab === 'history' && (

          <>

            <Card variant="glass" padding="none">

              <div className="overflow-x-auto">

                <table className="w-full text-sm">

                  <thead>

                    <tr className="border-b border-border-glass">

                      <th className="px-4 py-3 text-left text-xs text-text-tertiary font-medium">Date</th>

                      <th className="px-4 py-3 text-left text-xs text-text-tertiary font-medium">Symbol</th>

                      <th className="px-4 py-3 text-left text-xs text-text-tertiary font-medium">Side</th>

                      <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">Lots</th>

                      <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">Duration</th>

                      <th className="px-4 py-3 text-right text-xs text-text-tertiary font-medium">P&L</th>

                    </tr>

                  </thead>

                  <tbody>

                    {trades.length === 0 ? (

                      <tr>

                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-tertiary">

                          No trade history

                        </td>

                      </tr>

                    ) : (

                      trades.map((t) => (

                        <tr key={t.id} className="border-b border-border-glass/50 hover:bg-bg-hover/30 transition-all">

                          <td className="px-4 py-3 text-text-secondary text-xs">

                            {new Date(t.close_time || t.open_time).toLocaleString()}

                          </td>

                          <td className="px-4 py-3 text-text-primary text-xs font-semibold">{t.symbol}</td>

                          <td className="px-4 py-3">

                            <span className={clsx('text-xs font-medium', t.side?.toLowerCase() === 'buy' ? 'text-buy' : 'text-sell')}>

                              {t.side}

                            </span>

                          </td>

                          <td className="px-4 py-3 text-right text-text-secondary text-xs font-mono">{t.lots}</td>

                          <td className="px-4 py-3 text-right text-text-tertiary text-xs">{t.duration ?? '—'}</td>

                          <td className="px-4 py-3 text-right">

                            <span className={clsx('text-xs font-mono font-semibold tabular-nums', t.pnl >= 0 ? 'text-buy' : 'text-sell')}>

                              {t.pnl >= 0 ? '+' : ''}{fmt(t.pnl)}

                            </span>

                          </td>

                        </tr>

                      ))

                    )}

                  </tbody>

                </table>

              </div>

            </Card>

            {totalPages > 1 && (

              <div className="flex items-center justify-center gap-2">

                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>

                  ← Prev

                </Button>

                <span className="text-xs text-text-tertiary">Page {page} of {totalPages}</span>

                <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>

                  Next →

                </Button>

              </div>

            )}

          </>

        )}

      </div>

    </div>

  );

}

