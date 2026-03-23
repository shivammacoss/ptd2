import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';

interface UIState {
  theme: Theme;
  watchlistWidth: number;
  orderPanelWidth: number;
  bottomPanelHeight: number;
  activeBottomTab: string;
  chartTimeframe: string;
  chartType: string;
  oneClickTrading: boolean;
  sidebarCollapsed: boolean;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setWatchlistWidth: (w: number) => void;
  setOrderPanelWidth: (w: number) => void;
  setBottomPanelHeight: (h: number) => void;
  setActiveBottomTab: (t: string) => void;
  setChartTimeframe: (tf: string) => void;
  setChartType: (ct: string) => void;
  setOneClickTrading: (v: boolean) => void;
  setSidebarCollapsed: (v: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'dark' as Theme,
      watchlistWidth: 220,
      orderPanelWidth: 240,
      bottomPanelHeight: 220,
      activeBottomTab: 'positions',
      chartTimeframe: '15m',
      chartType: 'candlestick',
      oneClickTrading: false,
      sidebarCollapsed: false,

      setTheme: (t) => {
        document.documentElement.setAttribute('data-theme', t);
        set({ theme: t });
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        set({ theme: next });
      },
      setWatchlistWidth: (w) => set({ watchlistWidth: Math.max(180, Math.min(320, w)) }),
      setOrderPanelWidth: (w) => set({ orderPanelWidth: Math.max(200, Math.min(300, w)) }),
      setBottomPanelHeight: (h) => set({ bottomPanelHeight: Math.max(120, Math.min(window.innerHeight * 0.6, h)) }),
      setActiveBottomTab: (t) => set({ activeBottomTab: t }),
      setChartTimeframe: (tf) => set({ chartTimeframe: tf }),
      setChartType: (ct) => set({ chartType: ct }),
      setOneClickTrading: (v) => set({ oneClickTrading: v }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    }),
    { name: 'protrader-ui' }
  )
);
