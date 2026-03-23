# Extractable Components (Trader App)

## AccountBar
- Source: `frontend/trader/src/components/trading/AccountBar.tsx`
- Category: layout
- Description: Thin top bar showing account info, balance, equity, margin, P&L, leverage
- Extractable props: accountNumber (string, default: "PT10000001"), isDemo (boolean, default: true), balance (string, default: "$10,000.00"), equity (string, default: "$10,000.00"), margin (string, default: "$0.00"), freeMargin (string, default: "$10,000.00"), marginLevel (string, default: "--"), pnl (string, default: "+$0.00"), pnlTrend (string, default: "up"), leverage (string, default: "1:100")
- Hardcoded: All CSS classes, layout structure, label text

## DashboardHeader
- Source: `frontend/trader/src/app/dashboard/page.tsx` (inline, lines 80-111)
- Category: layout
- Description: Top header with ProTrader logo, navigation links, user email, profile button
- Extractable props: activeItem (string, default: "dashboard"), userEmail (string, default: "demo@protrader.com")
- Hardcoded: ProTrader text, nav item labels (Dashboard, Trading, Wallet, Portfolio, Social, Algo), Profile button text, all CSS

## Watchlist
- Source: `frontend/trader/src/components/trading/Watchlist.tsx`
- Category: layout
- Description: Left sidebar panel showing watched symbols with bid/ask prices and spreads
- Extractable props: activeSymbol (string, default: "EURUSD")
- Hardcoded: "Watchlist" heading, all CSS, symbol display logic

## OrderPanel
- Source: `frontend/trader/src/components/trading/OrderPanel.tsx`
- Category: layout
- Description: Right sidebar with symbol info, order type select, lot size, SL/TP, buy/sell buttons
- Extractable props: selectedSymbol (string, default: "EURUSD"), bidPrice (string, default: "1.08500"), askPrice (string, default: "1.08520"), spread (string, default: "2.0")
- Hardcoded: "Order" heading, order type options, lot presets, SELL/BUY button text, margin preview labels, all CSS

## PositionsTable
- Source: `frontend/trader/src/components/trading/PositionsTable.tsx`
- Category: layout
- Description: Bottom panel with tabs for positions/orders/history, data table with close/cancel actions
- Extractable props: activeTab (string, default: "positions"), positionCount (number, default: 0), totalPnl (string, default: "+0.00")
- Hardcoded: Tab labels, table column headers, "No open positions" / "No pending orders" text, all CSS

## ChartToolbar
- Source: `frontend/trader/src/components/charts/Chart.tsx` (inline toolbar, lines 124-194)
- Category: layout
- Description: Chart toolbar with symbol name, timeframe buttons, chart type buttons, indicator dropdown
- Extractable props: selectedSymbol (string, default: "EURUSD"), activeTimeframe (string, default: "1m"), activeChartType (string, default: "candlestick"), indicatorCount (number, default: 0)
- Hardcoded: Timeframe labels (1m, 5m, 15m, 30m, 1H, 4H, 1D, 1W, 1M), chart type labels (Candles, Line, Area, Heikin-Ashi), indicator names, all CSS
