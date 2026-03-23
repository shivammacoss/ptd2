# Shared UI Components (Trader App)

No shared UI component library (no shadcn, MUI, Radix). Components are app-specific and inline. The app uses `clsx` for class merging and `class-variance-authority` for variant styling. Icons from `lucide-react`.

## StatCard (inline in dashboard/page.tsx)

```tsx
function StatCard({ label, value, subValue, trend }: {
  label: string; value: string; subValue?: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${
        trend === 'up' ? 'text-buy' : trend === 'down' ? 'text-sell' : 'text-text-primary'
      }`}>
        {value}
      </div>
      {subValue && <div className="text-xs text-text-muted mt-1">{subValue}</div>}
    </div>
  );
}
```

## QuickTradeCard (inline in dashboard/page.tsx)

```tsx
function QuickTradeCard({ symbol, bid, ask, change }: {
  symbol: string; bid: number; ask: number; change: number;
}) {
  return (
    <Link
      href="/trading"
      className="bg-bg-card rounded-xl border border-border p-3 hover:border-primary/50 transition group"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-sm font-semibold text-text-primary">{symbol}</span>
        <span className={`text-xs font-mono ${change >= 0 ? 'text-buy' : 'text-sell'}`}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
      <div className="flex justify-between text-xs font-mono">
        <span className="text-sell">{bid.toFixed(5)}</span>
        <span className="text-buy">{ask.toFixed(5)}</span>
      </div>
    </Link>
  );
}
```

## Notes

- No dedicated `src/components/ui/` directory
- Buttons are plain `<button>` elements with Tailwind classes
- Inputs use global CSS styling from `globals.css` (dark bg, border, focus accent)
- Cards use `bg-bg-card rounded-xl border border-border` pattern
- Form labels: `text-xs text-text-muted block mb-1`
