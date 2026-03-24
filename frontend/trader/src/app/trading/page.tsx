'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { useUIStore } from '@/stores/uiStore';
import { useTradingStore, InstrumentInfo } from '@/stores/tradingStore';
import Watchlist from '@/components/trading/Watchlist';
import OrderPanel from '@/components/trading/OrderPanel';
import PositionsPanel from '@/components/trading/PositionsPanel';

const TradingViewChart = dynamic(() => import('@/components/charts/TradingViewChart'), { ssr: false });

function DragHandleV({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const onMove = (ev: MouseEvent) => { onDrag(ev.clientX - startX); };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onDrag]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-[5px] shrink-0 cursor-col-resize relative group transition-colors ${dragging ? 'bg-buy/30' : ''}`}
    >
      <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] transition-all ${
        dragging ? 'bg-buy w-[3px]' : 'bg-border-primary group-hover:bg-buy/40 group-hover:w-[3px]'
      }`} />
    </div>
  );
}

function DragHandleH({ onDrag }: { onDrag: (deltaY: number) => void }) {
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startY = e.clientY;
    const onMove = (ev: MouseEvent) => { onDrag(ev.clientY - startY); };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onDrag]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`h-[5px] shrink-0 cursor-row-resize relative group transition-colors ${dragging ? 'bg-buy/30' : ''}`}
    >
      <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] transition-all ${
        dragging ? 'bg-buy h-[3px]' : 'bg-border-primary group-hover:bg-buy/40 group-hover:h-[3px]'
      }`} />
    </div>
  );
}

export default function TradingPage() {
  const router = useRouter();
  const {
    watchlistWidth, orderPanelWidth, bottomPanelHeight,
    setWatchlistWidth, setOrderPanelWidth, setBottomPanelHeight
  } = useUIStore();

  const [wlW, setWlW] = useState(watchlistWidth);
  const [opW, setOpW] = useState(orderPanelWidth);
  const [bpH, setBpH] = useState(bottomPanelHeight);
  const [isMobile, setIsMobile] = useState(false);
  const [lotSize, setLotSize] = useState('0.01');
  const [chartTabs, setChartTabs] = useState<string[]>([]);
  
  const { selectedSymbol, prices, instruments, watchlist, setSelectedSymbol } = useTradingStore();
  const searchParams = useSearchParams();
  const mobileView = searchParams.get('view') || 'watchlist';

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Sync selected symbol with tabs
  useEffect(() => {
    if (selectedSymbol && !chartTabs.includes(selectedSymbol)) {
      setChartTabs(prev => [...prev, selectedSymbol]);
    }
  }, [selectedSymbol, chartTabs]);

  const removeTab = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    const nextTabs = chartTabs.filter(s => s !== symbol);
    setChartTabs(nextTabs);
    if (selectedSymbol === symbol && nextTabs.length > 0) {
      setSelectedSymbol(nextTabs[nextTabs.length - 1]);
    }
  };

  if (isMobile) {
    const digits = instruments.find((i: InstrumentInfo) => i.symbol === selectedSymbol)?.digits ?? 5;
    const price = prices[selectedSymbol];

    const handleLotChange = (val: number) => {
      const current = parseFloat(lotSize);
      const next = Math.max(0.01, current + val).toFixed(2);
      setLotSize(next);
    };

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
        <div className="flex-1 overflow-hidden relative">
          {mobileView === 'watchlist' && <Watchlist />}
          {mobileView === 'chart' && (
            <div className="h-full flex flex-col">
              {/* Dynamic Chart Tabs Header */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-bg-secondary border-b border-border-glass overflow-x-auto no-scrollbar scrollbar-none">
                {chartTabs.map((symbol) => (
                  <button
                    key={symbol}
                    onClick={() => setSelectedSymbol(symbol)}
                    className={clsx(
                      'px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all border whitespace-nowrap flex items-center gap-2 group',
                      symbol === selectedSymbol
                        ? 'bg-bg-primary text-text-primary border-border-glass shadow-sm'
                        : 'bg-transparent text-text-tertiary border-transparent hover:text-text-primary'
                    )}
                  >
                    {symbol}
                    <div 
                      onClick={(e) => removeTab(e, symbol)}
                      className="p-0.5 rounded-md hover:bg-sell/10 hover:text-sell transition-colors opacity-60 group-hover:opacity-100"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </div>
                  </button>
                ))}
                
                <button 
                  onClick={() => router.push('/trading?view=watchlist')}
                  className="shrink-0 w-10 h-[34px] flex items-center justify-center rounded-xl bg-bg-hover/80 text-text-primary border border-border-glass hover:bg-buy/10 transition-all active:scale-95"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-hidden relative">
                <TradingViewChart />
              </div>
              
              {/* Refined Quick Trade Bottom Bar */}
              <div className="fixed bottom-[max(3.5rem,env(safe-area-inset-bottom,0px))] left-0 right-0 p-3 bg-bg-secondary/95 backdrop-blur-xl border-t border-border-glass z-50">
                <div className="flex items-center justify-between mt-1">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider leading-none mb-1.5">Lot Size</span>
                      <div className="flex items-center gap-2">
                         <button 
                           onClick={() => handleLotChange(-0.01)}
                           className="w-10 h-10 flex items-center justify-center rounded-xl bg-bg-primary border border-border-glass text-text-primary shadow-sm active:scale-90 transition-transform"
                         >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
                         </button>
                         <input 
                           type="text" 
                           value={lotSize}
                           readOnly 
                           className="w-14 h-10 text-[16px] font-black font-mono text-center bg-transparent text-text-primary outline-none" 
                         />
                         <button 
                           onClick={() => handleLotChange(0.01)}
                           className="w-10 h-10 flex items-center justify-center rounded-xl bg-bg-primary border border-border-glass text-text-primary shadow-sm active:scale-90 transition-transform"
                         >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                         </button>
                      </div>
                   </div>

                   <div className="flex items-center gap-2 flex-1 ml-4 h-[50px]">
                      <button className="flex-1 h-full bg-sell rounded-xl flex flex-col items-center justify-center shadow-lg shadow-sell/20 active:scale-[0.98] transition-all">
                        <span className="text-white text-[15px] font-black uppercase tracking-[0.05em]">Sell</span>
                        <span className="text-white/70 text-[10px] font-mono font-bold leading-tight">{price?.bid.toFixed(digits) || '--'}</span>
                      </button>
                      
                      <button className="flex-1 h-full bg-buy rounded-xl flex flex-col items-center justify-center shadow-lg shadow-buy/20 active:scale-[0.98] transition-all">
                        <span className="text-white text-[15px] font-black uppercase tracking-[0.05em]">Buy</span>
                        <span className="text-white/70 text-[10px] font-mono font-bold leading-tight">{price?.ask.toFixed(digits) || '--'}</span>
                      </button>
                   </div>
                </div>
              </div>
            </div>
          )}
          {mobileView === 'order' && <PositionsPanel />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* LEFT — Watchlist (draggable right edge) */}
      <div className="shrink-0 overflow-hidden" style={{ width: wlW }}>
        <Watchlist />
      </div>

      {/* Left drag handle */}
      <DragHandleV onDrag={(dx) => {
        const next = Math.max(160, Math.min(350, watchlistWidth + dx));
        setWlW(next);
        setWatchlistWidth(next);
      }} />

      {/* CENTER — Chart + Bottom Panel */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 min-h-0 overflow-hidden">
          <TradingViewChart />
        </div>

        {/* Bottom drag handle */}
        <DragHandleH onDrag={(dy) => {
          const next = Math.max(100, Math.min(window.innerHeight * 0.55, bottomPanelHeight - dy));
          setBpH(next);
          setBottomPanelHeight(next);
        }} />

        <div className="shrink-0 overflow-hidden" style={{ height: bpH }}>
          <PositionsPanel />
        </div>
      </div>

      {/* Right drag handle */}
      <DragHandleV onDrag={(dx) => {
        const next = Math.max(200, Math.min(350, orderPanelWidth - dx));
        setOpW(next);
        setOrderPanelWidth(next);
      }} />

      {/* RIGHT — Order Panel (draggable left edge) */}
      <div className="shrink-0 overflow-hidden" style={{ width: opW }}>
        <OrderPanel />
      </div>
    </div>
  );
}
