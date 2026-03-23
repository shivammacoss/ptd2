import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'rgb(var(--c-bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--c-bg-tertiary) / <alpha-value>)',
          hover: 'rgb(var(--c-bg-hover) / <alpha-value>)',
          active: 'rgb(var(--c-bg-active) / <alpha-value>)',
          input: 'rgb(var(--c-bg-input) / <alpha-value>)',
        },
        border: {
          primary: 'rgb(var(--c-border-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-border-secondary) / <alpha-value>)',
          accent: 'rgb(var(--c-border-accent) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--c-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--c-text-tertiary) / <alpha-value>)',
          inverse: 'rgb(var(--c-text-inverse) / <alpha-value>)',
        },
        buy: {
          DEFAULT: '#2962FF',
          light: '#448AFF',
          dark: '#1A3FA0',
          bg: 'rgba(41,98,255,0.07)',
        },
        sell: {
          DEFAULT: '#FF2440',
          light: '#FF5252',
          dark: '#B71C1C',
          bg: 'rgba(255,36,64,0.07)',
        },
        accent: { DEFAULT: '#F7931A', light: '#FFB74D', dark: '#E65100' },
        success: '#00C853',
        warning: '#FFB300',
        info: '#29B6F6',
        danger: '#FF1744',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'xxs': ['10px', { lineHeight: '14px' }],
        'xs': ['11px', { lineHeight: '16px' }],
        'sm': ['12px', { lineHeight: '16px' }],
        'base': ['13px', { lineHeight: '20px' }],
        'md': ['14px', { lineHeight: '20px' }],
        'lg': ['16px', { lineHeight: '24px' }],
        'xl': ['20px', { lineHeight: '28px' }],
        '2xl': ['28px', { lineHeight: '36px' }],
      },
      borderRadius: { sm: '4px', DEFAULT: '4px', md: '6px', lg: '8px' },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-down': 'slideDown 0.15s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      boxShadow: {
        modal: 'var(--shadow-modal)',
        dropdown: 'var(--shadow-dropdown)',
      },
    },
  },
  plugins: [],
}

export default config
