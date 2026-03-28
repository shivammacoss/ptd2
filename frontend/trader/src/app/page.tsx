'use client'

import Link from 'next/link'
import {
  ArrowRight, ShieldCheck, Lock, TrendingDown, Zap, Coins, Clock,
  Gauge, Wallet, BarChart3, MonitorSmartphone, Shield, Headphones,
  Check, Star,
} from 'lucide-react'
import TextType from '@/components/landing/TextType'
import ElectricBorder from '@/components/landing/ElectricBorder'
import LandingHeader from '@/components/landing/LandingHeader'
import LandingFooter from '@/components/landing/LandingFooter'

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingHeader />

      {/* Hero */}
      <section className="bg-gradient-to-b from-white to-gray-50 pt-16 pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
                <TextType
                  texts={[
                    'Trade Smarter with Institutional Speed',
                    'Execute Orders in <40ms',
                    'Spreads from 0.06 pips',
                  ]}
                  typingSpeed={50}
                  deletingSpeed={30}
                  pauseDuration={2000}
                  showCursor
                  cursorCharacter="|"
                  className="text-blue-600"
                />
              </h1>
              <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-lg">
                Experience zero-latency execution on forex, crypto, and XAU/USD metals. Ultra-low spreads from 0.06 pips with crypto withdrawals processed in under 1 hour.
              </p>
              <div className="flex flex-wrap gap-4 mb-10">
                <Link
                  href="/auth/register"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  Open Live Account <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/auth/login"
                  className="border border-gray-200 hover:border-blue-600 text-gray-800 font-semibold px-8 py-3.5 rounded-lg transition-colors"
                >
                  Try Demo
                </Link>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-green-500" />
                  <span>Segregated Funds</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-green-500" />
                  <span>SSL Encrypted</span>
                </div>
              </div>
            </div>

            <ElectricBorder color="#1E88E5" speed={1} chaos={0.12} thickness={2} style={{ borderRadius: 16 }}>
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <p className="text-xs font-semibold text-gray-500 mb-6 uppercase tracking-wider">Live Trading Conditions</p>
                <div className="space-y-6">
                  {[
                    { label: 'Raw Spreads From', value: '0.06', unit: 'pips', Icon: TrendingDown, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Execution Speed', value: '<40', unit: 'ms', Icon: Zap, color: 'text-green-500', bg: 'bg-green-50' },
                    { label: 'Commission Per Lot', value: '$2', unit: 'flat', Icon: Coins, color: 'text-yellow-500', bg: 'bg-yellow-50' },
                    { label: 'Crypto Withdrawals', value: '≤1', unit: 'hour', Icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50' },
                  ].map(({ label, value, unit, Icon, color, bg }, i, arr) => (
                    <div key={label} className={`flex items-center justify-between ${i < arr.length - 1 ? 'pb-6 border-b border-gray-100' : ''}`}>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">{label}</p>
                        <p className="text-3xl font-extrabold text-gray-900">{value} <span className="text-base font-normal text-gray-400">{unit}</span></p>
                      </div>
                      <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center`}>
                        <Icon className={`w-6 h-6 ${color}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ElectricBorder>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Why Traders Choose ProTrader</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">Access institutional-grade trading infrastructure with the flexibility and speed your strategies demand.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { Icon: Gauge,            title: 'Zero Latency Execution',  desc: 'Orders processed in under 40ms with direct market access to tier-1 liquidity providers worldwide.',         color: 'text-blue-600',   bg: 'bg-blue-50' },
              { Icon: Wallet,           title: 'Instant Crypto Funding',  desc: 'Deposit via BTC, ETH, or USDT instantly. Withdrawals processed within 1 hour, 24/7.',                         color: 'text-green-500',  bg: 'bg-green-50' },
              { Icon: BarChart3,        title: 'Multi-Asset Trading',     desc: 'Trade 50+ forex pairs, 20+ cryptocurrencies, XAU/USD metals, indices, and global stocks.',                     color: 'text-yellow-500', bg: 'bg-yellow-50' },
              { Icon: MonitorSmartphone,title: 'Cross-Platform Access',   desc: 'Trade on desktop, web, or mobile with full MT4/MT5 compatibility and native ProTrader apps.',                  color: 'text-purple-500', bg: 'bg-purple-50' },
              { Icon: Shield,           title: 'Negative Balance Protection', desc: 'Your account is protected from going below zero. Trade with confidence and controlled risk.',              color: 'text-red-500',    bg: 'bg-red-50' },
              { Icon: Headphones,       title: '24/7 Expert Support',     desc: 'Dedicated support team available around the clock. Reach us at +1 (908) 228-0305.',                            color: 'text-sky-500',    bg: 'bg-sky-50' },
            ].map(({ Icon, title, desc, color, bg }) => (
              <div key={title} className="bg-gray-50 rounded-xl p-8 hover:shadow-md transition-shadow">
                <div className={`w-14 h-14 ${bg} rounded-xl flex items-center justify-center mb-6`}>
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
                <p className="text-gray-500 leading-relaxed text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Instruments */}
      <section id="instruments" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900 mb-6">Trade Global Markets with Competitive Conditions</h2>
              <p className="text-gray-500 leading-relaxed mb-8">Access deep liquidity across multiple asset classes. All strategies permitted including scalping, hedging, and algorithmic trading.</p>
              <div className="space-y-4">
                {[
                  'Leverage up to 1:500 on forex pairs',
                  'No requotes, deep market depth',
                  'Swap-free Islamic accounts available',
                  'Minimum deposit from $25',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-4">
                    <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0">
                      <Check className="w-5 h-5 text-green-500" />
                    </div>
                    <span className="text-gray-800 font-medium text-sm">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <Link href="/auth/register" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-7 py-3 rounded-lg transition-colors inline-flex items-center gap-2">
                  Start Trading <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="font-bold text-gray-900">Popular Instruments</p>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Instrument</th>
                    <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Spread</th>
                    <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Leverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { pair: 'EUR/USD', badge: '€$',   spread: '0.06 pips', leverage: '1:500', color: 'text-blue-600',   bg: 'bg-blue-50' },
                    { pair: 'XAU/USD', badge: '🥇',   spread: '0.12 pips', leverage: '1:200', color: 'text-yellow-500', bg: 'bg-yellow-50' },
                    { pair: 'BTC/USD', badge: '₿',    spread: '10 pips',   leverage: '1:100', color: 'text-orange-500', bg: 'bg-orange-50' },
                    { pair: 'GBP/USD', badge: '£$',   spread: '0.08 pips', leverage: '1:500', color: 'text-sky-500',    bg: 'bg-sky-50' },
                  ].map(({ pair, badge, spread, leverage, color, bg }) => (
                    <tr key={pair} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 ${bg} rounded-full flex items-center justify-center`}>
                            <span className={`text-xs font-bold ${color}`}>{badge}</span>
                          </div>
                          <span className="font-semibold text-gray-800 text-sm">{pair}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-800 text-sm">{spread}</td>
                      <td className="px-6 py-4 text-right text-gray-500 text-sm">{leverage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Trusted by Traders Worldwide</h2>
            <p className="text-gray-500">See what our community has to say about trading with ProTrader.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { name: 'Alex K.',  role: 'Forex Scalper, London',      initials: 'AK', color: 'text-blue-600',   bg: 'bg-blue-100',   text: '"The 0.06 pip spreads on XAU/USD transformed my scalping strategy. Execution is flawless even during NFP releases."' },
              { name: 'Marco V.', role: 'Crypto Trader, Dubai',       initials: 'MV', color: 'text-green-600',  bg: 'bg-green-100',  text: '"The 1-hour crypto withdrawal guarantee is a game changer. ProTrader\'s speed on digital assets is unmatched in the industry."' },
              { name: 'Sarah J.', role: 'White-Label Partner',        initials: 'SJ', color: 'text-purple-600', bg: 'bg-purple-100', text: '"We launched our brokerage using their white-label. The setup was minimal compared to the institutional-grade tech we received."' },
            ].map(({ name, role, initials, color, bg, text }) => (
              <div key={name} className="bg-gray-50 rounded-xl p-8">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />)}
                </div>
                <p className="text-gray-700 leading-relaxed mb-6 text-sm">{text}</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${bg} rounded-full flex items-center justify-center`}>
                    <span className={`font-bold ${color} text-sm`}>{initials}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{name}</p>
                    <p className="text-gray-400 text-xs">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gray-900">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-6">Ready to Trade with Institutional Speed?</h2>
          <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto">
            Join thousands of traders who trust ProTrader for lightning-fast execution, ultra-low spreads, and reliable crypto payouts.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/auth/register"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-10 py-4 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              Open Live Account <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth/login"
              className="border border-white/20 hover:border-white text-white font-semibold px-10 py-4 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
