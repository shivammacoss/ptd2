'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useUIStore } from '@/stores/uiStore';
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
  const {
    watchlistWidth, orderPanelWidth, bottomPanelHeight,
    setWatchlistWidth, setOrderPanelWidth, setBottomPanelHeight
  } = useUIStore();

  const [wlW, setWlW] = useState(watchlistWidth);
  const [opW, setOpW] = useState(orderPanelWidth);
  const [bpH, setBpH] = useState(bottomPanelHeight);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'chart' | 'watchlist' | 'order'>('chart');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const wlStartRef = useState(wlW);
  const opStartRef = useState(opW);
  const bpStartRef = useState(bpH);

  const handleWlDragStart = useCallback(() => {
    return wlW;
  }, [wlW]);

  const handleOpDragStart = useCallback(() => {
    return opW;
  }, [opW]);

  if (isMobile) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {mobilePanel === 'chart' && <TradingViewChart />}
          {mobilePanel === 'watchlist' && <Watchlist />}
          {mobilePanel === 'order' && <OrderPanel />}
        </div>
        <div className="h-14 glass-heavy border-t border-border-glass flex items-center justify-around shrink-0">
          {([
            { id: 'watchlist' as const, label: 'Markets', icon: '◈' },
            { id: 'chart' as const, label: 'Chart', icon: '◆' },
            { id: 'order' as const, label: 'Trade', icon: '⚡' },
          ]).map((item) => (
            <button
              key={item.id}
              onClick={() => setMobilePanel(item.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-fast ${
                mobilePanel === item.id ? 'text-buy' : 'text-text-tertiary'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-xxs">{item.label}</span>
            </button>
          ))}
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
