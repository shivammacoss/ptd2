# Page Dependency Trees (Trader App)

## /auth/login (Login Page)
Entry: `frontend/trader/src/app/auth/login/page.tsx`
Dependencies:
- `frontend/trader/src/stores/authStore.ts`
  - `frontend/trader/src/lib/api/client.ts`
- `frontend/trader/src/app/globals.css`

## /auth/register (Register Page)
Entry: `frontend/trader/src/app/auth/register/page.tsx`
Dependencies:
- `frontend/trader/src/stores/authStore.ts`
  - `frontend/trader/src/lib/api/client.ts`
- `frontend/trader/src/app/globals.css`

## /dashboard (Dashboard Page)
Entry: `frontend/trader/src/app/dashboard/page.tsx`
Dependencies:
- `frontend/trader/src/stores/tradingStore.ts`
  - `frontend/trader/src/lib/ws/priceSocket.ts`
- `frontend/trader/src/stores/authStore.ts`
  - `frontend/trader/src/lib/api/client.ts`
- `frontend/trader/src/app/globals.css`

Note: StatCard and QuickTradeCard are defined inline in dashboard/page.tsx.
No external component imports — header nav is also inline.

## /trading (Trading Page) — MAIN PAGE
Entry: `frontend/trader/src/app/trading/page.tsx`
Dependencies:
- `frontend/trader/src/components/trading/AccountBar.tsx`
  - `frontend/trader/src/stores/tradingStore.ts`
- `frontend/trader/src/components/trading/OrderPanel.tsx`
  - `frontend/trader/src/stores/tradingStore.ts`
  - `frontend/trader/src/lib/api/client.ts`
- `frontend/trader/src/components/trading/Watchlist.tsx`
  - `frontend/trader/src/stores/tradingStore.ts`
- `frontend/trader/src/components/trading/PositionsTable.tsx`
  - `frontend/trader/src/stores/tradingStore.ts`
  - `frontend/trader/src/lib/api/client.ts`
- `frontend/trader/src/components/charts/Chart.tsx`
  - `frontend/trader/src/charting/core/ChartEngine.ts`
  - `frontend/trader/src/charting/core/types.ts`
  - `frontend/trader/src/charting/indicators/index.ts`
  - `frontend/trader/src/stores/tradingStore.ts`
  - `frontend/trader/src/lib/ws/priceSocket.ts`
- `frontend/trader/src/stores/tradingStore.ts`
  - `frontend/trader/src/lib/ws/priceSocket.ts`
- `frontend/trader/src/app/globals.css`
- `frontend/trader/tailwind.config.ts`
