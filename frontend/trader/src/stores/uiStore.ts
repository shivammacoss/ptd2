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

/** Watchlist column — wide defaults so symbols + bid/ask fit (desktop). */
export const WATCHLIST_LAYOUT = {
  min: 320,
  max: 720,
  default: 560,
} as const;

const WATCHLIST_MIN_PX = WATCHLIST_LAYOUT.min;
const WATCHLIST_MAX_PX = WATCHLIST_LAYOUT.max;
const WATCHLIST_DEFAULT_PX = WATCHLIST_LAYOUT.default;

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'dark' as Theme,
      watchlistWidth: WATCHLIST_DEFAULT_PX,
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
      setWatchlistWidth: (w) =>
        set({ watchlistWidth: Math.max(WATCHLIST_MIN_PX, Math.min(WATCHLIST_MAX_PX, w)) }),
      setOrderPanelWidth: (w) => set({ orderPanelWidth: Math.max(200, Math.min(300, w)) }),
      setBottomPanelHeight: (h) => set({ bottomPanelHeight: Math.max(120, Math.min(window.innerHeight * 0.6, h)) }),
      setActiveBottomTab: (t) => set({ activeBottomTab: t }),
      setChartTimeframe: (tf) => set({ chartTimeframe: tf }),
      setChartType: (ct) => set({ chartType: ct }),
      setOneClickTrading: (v) => set({ oneClickTrading: v }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    }),
    {
      name: 'protrader-ui',
      version: 3,
      onRehydrateStorage: () => (rehydrated, err) => {
        if (err || !rehydrated || typeof window === 'undefined') return;
        if (window.innerWidth < 768) return;
        const w = rehydrated.watchlistWidth;
        if (w < 520) {
          const target = Math.min(
            WATCHLIST_MAX_PX,
            Math.max(520, Math.round(window.innerWidth * 0.4)),
          );
          useUIStore.setState({ watchlistWidth: target });
        }
      },
      migrate: (persistedState, fromVersion) => {
        const state = persistedState as UIState | null | undefined;
        if (!state) return persistedState as UIState;
        const v = typeof fromVersion === 'number' ? fromVersion : 0;
        let w = state.watchlistWidth ?? WATCHLIST_DEFAULT_PX;
        if (v < 2 && w <= 340) w = WATCHLIST_DEFAULT_PX;
        if (v < 3 && w < 520) w = WATCHLIST_DEFAULT_PX;
        w = Math.max(WATCHLIST_MIN_PX, Math.min(WATCHLIST_MAX_PX, w));
        return { ...state, watchlistWidth: w };
      },
    }
  )
);
