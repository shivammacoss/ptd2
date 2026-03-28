import LandingHeader from '@/components/landing/LandingHeader'
import LandingFooter from '@/components/landing/LandingFooter'
import { Monitor, Smartphone, Globe, Zap, BarChart3, Shield } from 'lucide-react'

export const metadata = { title: 'Trading Platforms — ProTrader' }

export default function PlatformsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingHeader />

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-gray-50 pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <span className="inline-block bg-blue-50 text-blue-600 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            Cross-Platform Trading
          </span>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            Professional Trading Terminals<br />
            <span className="text-blue-600">for All Traders</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Access institutional-grade platforms on desktop, web, and mobile. 100+ chart tools, 50+ indicators, and execution speeds under 40ms.
          </p>
        </div>
      </section>

      {/* Platform Cards */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Monitor,
                title: 'Desktop Terminal',
                desc: 'Full-featured trading platform with advanced charting, automated trading, and customizable workspaces.',
                features: ['100+ Chart Tools', '50+ Indicators', 'Algorithmic Trading', 'Custom Workspaces'],
              },
              {
                icon: Smartphone,
                title: 'Mobile Trading',
                desc: 'Trade on the go with our powerful mobile app. Full functionality in your pocket.',
                features: ['Real-time Quotes', 'Push Notifications', 'One-Click Trading', 'Biometric Login'],
              },
              {
                icon: Globe,
                title: 'Web Platform',
                desc: 'Access your account from any browser. No download required, instant access.',
                features: ['Browser-based', 'No Installation', 'Full Features', 'Secure Trading'],
              },
            ].map(({ icon: Icon, title, desc, features }) => (
              <div key={title} className="bg-gray-50 rounded-xl p-8 border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center mb-6">
                  <Icon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{title}</h3>
                <p className="text-gray-600 mb-6">{desc}</p>
                <ul className="space-y-2">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Platform Features</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Everything you need for professional trading, built by traders for traders.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: 'Lightning Fast', desc: 'Execute trades in under 40ms with our optimized infrastructure.' },
              { icon: BarChart3, title: 'Advanced Charting', desc: '100+ drawing tools and 50+ technical indicators.' },
              { icon: Shield, title: 'Secure Trading', desc: 'Bank-level security with 2FA and encryption.' },
              { icon: Monitor, title: 'Multi-Monitor', desc: 'Support for up to 4 monitors with customizable layouts.' },
              { icon: Smartphone, title: 'Mobile Sync', desc: 'Seamless synchronization across all devices.' },
              { icon: Globe, title: 'Global Markets', desc: 'Access 50+ forex pairs, crypto, metals, and indices.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                    <p className="text-gray-600 text-sm">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-6">Ready to Start Trading?</h2>
          <p className="text-gray-500 text-lg mb-8">
            Experience professional trading platforms with institutional-grade features.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/auth/register"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              Open Live Account
            </a>
            <a
              href="/auth/login"
              className="border border-gray-300 hover:border-blue-600 text-gray-900 font-semibold px-8 py-3.5 rounded-lg transition-colors"
            >
              Try Demo
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
