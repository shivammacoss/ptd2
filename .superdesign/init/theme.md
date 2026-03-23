# Theme & Design Tokens (Trader App)

## globals.css

**File:** `frontend/trader/src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  --bg-primary: #0f1117;
  --bg-secondary: #1a1d28;
  --bg-tertiary: #242732;
  --bg-card: #1e2130;
  --border: #2a2d3e;
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --buy: #10B981;
  --sell: #EF4444;
  --accent: #3B82F6;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: 'Inter', system-ui, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #4a4d5e;
}

input, select, textarea {
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

input:focus, select:focus, textarea:focus {
  border-color: var(--accent);
}

.price-up { color: var(--buy); }
.price-down { color: var(--sell); }

.flash-green { animation: flashGreen 0.4s ease-out; }
.flash-red { animation: flashRed 0.4s ease-out; }

@keyframes flashGreen {
  0% { background-color: rgba(16, 185, 129, 0.2); }
  100% { background-color: transparent; }
}

@keyframes flashRed {
  0% { background-color: rgba(239, 68, 68, 0.2); }
  100% { background-color: transparent; }
}
```

## tailwind.config.ts

**File:** `frontend/trader/tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#3B82F6', dark: '#2563EB', light: '#60A5FA' },
        accent: { DEFAULT: '#F59E0B', dark: '#D97706' },
        success: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
        buy: '#10B981',
        sell: '#EF4444',
        bg: {
          primary: '#0f1117',
          secondary: '#1a1d28',
          tertiary: '#242732',
          card: '#1e2130',
          hover: '#2a2d3e',
        },
        border: { DEFAULT: '#2a2d3e', light: '#3a3d4e' },
        text: {
          primary: '#e4e4e7',
          secondary: '#a1a1aa',
          muted: '#71717a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-green': 'pulseGreen 0.6s ease-out',
        'pulse-red': 'pulseRed 0.6s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseGreen: { '0%, 100%': { backgroundColor: 'transparent' }, '50%': { backgroundColor: 'rgba(16,185,129,0.1)' } },
        pulseRed: { '0%, 100%': { backgroundColor: 'transparent' }, '50%': { backgroundColor: 'rgba(239,68,68,0.1)' } },
      },
    },
  },
  plugins: [],
}

export default config
```

## Design Summary

- **Dark theme only** (no light mode)
- **Fonts**: Inter (UI), JetBrains Mono (prices, data)
- **Background hierarchy**: primary (#0f1117) → secondary (#1a1d28) → tertiary (#242732) → card (#1e2130)
- **Colors**: Blue primary (#3B82F6), Green buy (#10B981), Red sell (#EF4444), Amber accent (#F59E0B)
- **Text hierarchy**: primary (#e4e4e7), secondary (#a1a1aa), muted (#71717a)
- **Border**: #2a2d3e (default), #3a3d4e (light)
- **Radius**: 6px inputs, rounded-xl cards, rounded-lg buttons, rounded-2xl auth cards
- **Body**: overflow hidden, full height
