'use client';

import { useEffect, useRef, memo } from 'react';
import { useTradingStore } from '@/stores/tradingStore';
import { useUIStore } from '@/stores/uiStore';

const SYMBOL_MAP: Record<string, string> = {
  EURUSD: 'FX:EURUSD',
  GBPUSD: 'FX:GBPUSD',
  USDJPY: 'FX:USDJPY',
  AUDUSD: 'FX:AUDUSD',
  USDCAD: 'FX:USDCAD',
  USDCHF: 'FX:USDCHF',
  NZDUSD: 'FX:NZDUSD',
  EURGBP: 'FX:EURGBP',
  EURJPY: 'FX:EURJPY',
  GBPJPY: 'FX:GBPJPY',
  XAUUSD: 'TVC:GOLD',
  XAGUSD: 'TVC:SILVER',
  USOIL: 'TVC:USOIL',
  US30: 'TVC:DJI',
  US500: 'SP:SPX',
  NAS100: 'NASDAQ:NDX',
  BTCUSD: 'CRYPTO:BTCUSD',
  ETHUSD: 'CRYPTO:ETHUSD',
};

function TradingViewChartInner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedSymbol = useTradingStore((s) => s.selectedSymbol);
  const theme = useUIStore((s) => s.theme);
  const isLight = theme === 'light';

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    // TradingView script calls parentNode.querySelector('.tradingview-widget-container__widget')
    // so both the widget div and script must be inside the same container div.
    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.cssText = 'height:100%;width:100%;';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.cssText = 'height:100%;width:100%;';
    wrapper.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;

    const tvSymbol = SYMBOL_MAP[selectedSymbol] || `FX:${selectedSymbol}`;

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: '15',
      timezone: 'Etc/UTC',
      theme: isLight ? 'light' : 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: isLight ? 'rgba(242, 239, 233, 1)' : 'rgba(10, 12, 16, 1)',
      gridColor: isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(30, 36, 51, 0.5)',
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      studies: [],
      show_popup_button: false,
      popup_width: '1000',
      popup_height: '650',
      withdateranges: true,
      details: false,
      hotlist: false,
      enabled_features: [],
      disabled_features: ['header_symbol_search', 'header_compare'],
    });

    wrapper.appendChild(script);
    containerRef.current.appendChild(wrapper);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [selectedSymbol, isLight]);

  return <div className="w-full h-full" ref={containerRef} />;
}

export default memo(TradingViewChartInner);
