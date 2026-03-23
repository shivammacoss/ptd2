# Routes (Trader App)

Next.js 14 App Router, file-based routing.

| Route | File | Description |
|-------|------|-------------|
| `/` | `frontend/trader/src/app/page.tsx` | Redirects to `/trading` |
| `/auth/login` | `frontend/trader/src/app/auth/login/page.tsx` | Login page with email/password + 2FA |
| `/auth/register` | `frontend/trader/src/app/auth/register/page.tsx` | Registration with name, email, password, phone, referral |
| `/dashboard` | `frontend/trader/src/app/dashboard/page.tsx` | Account overview, stats, market overview, positions, quick actions |
| `/trading` | `frontend/trader/src/app/trading/page.tsx` | Main trading view — chart, watchlist, order panel, positions |

## Planned but not implemented

Dashboard links to these routes but pages don't exist yet:
- `/wallet` — Deposit/withdraw funds
- `/portfolio` — Portfolio view
- `/social` — Social/copy trading
- `/algo` — Algo trading
- `/profile` — User profile/settings
- `/support` — Support

## Router config

No custom router config — uses Next.js App Router file-based routing exclusively.
