import LandingHeader from '@/components/landing/LandingHeader'
import LandingFooter from '@/components/landing/LandingFooter'
import { Building2, Zap, Users, Shield, TrendingUp, Clock } from 'lucide-react'

export const metadata = { title: 'White Label Solutions — ProTrader' }

export default function WhiteLabelPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingHeader />

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-gray-50 pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-yellow-50 text-yellow-700 text-sm font-semibold px-4 py-2 rounded-full mb-6">
              <Building2 className="w-4 h-4" />
              Enterprise Solutions
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
              Launch Your Brand<br />
              <span className="text-blue-600">in 72 Hours</span>
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-2xl mx-auto">
              Build your own branded brokerage with ProTrader's institutional-grade white-label solution. Full technology stack, liquidity, and 24/7 support included.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mb-12">
              <a
                href="/auth/register"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors inline-flex items-center gap-2"
              >
                Request Demo
              </a>
              <a
                href="/contact"
                className="border border-gray-300 hover:border-blue-600 text-gray-900 font-semibold px-8 py-3.5 rounded-lg transition-colors"
              >
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Complete White-Label Solution</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Everything you need to launch and scale your brokerage business.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Building2,
                title: 'Custom Branding',
                desc: 'Your logo, colors, and domain. Fully customized client experience.',
              },
              {
                icon: Zap,
                title: 'Fast Launch',
                desc: 'Go live in 72 hours with our streamlined setup process.',
              },
              {
                icon: Users,
                title: 'Dedicated Support',
                desc: '24/7 technical support and account management for your business.',
              },
              {
                icon: Shield,
                title: 'Regulatory Compliance',
                desc: 'Built-in compliance tools and documentation for major jurisdictions.',
              },
              {
                icon: TrendingUp,
                title: 'Revenue Sharing',
                desc: 'Competitive revenue split with transparent reporting.',
              },
              {
                icon: Clock,
                title: 'Real-time Reporting',
                desc: 'Comprehensive analytics and reporting dashboard.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
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

      {/* What's Included */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">What's Included</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-6">Technology Stack</h3>
              <ul className="space-y-3">
                {[
                  'Trading Platform (Web, Desktop, Mobile)',
                  'CRM & Client Management',
                  'Payment Processing Gateway',
                  'Risk Management System',
                  'Reporting & Analytics Dashboard',
                  'Admin Back Office',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-6">Business Services</h3>
              <ul className="space-y-3">
                {[
                  'Tier-1 Liquidity Access',
                  'Multi-Bank Payment Processing',
                  'Regulatory Documentation',
                  'Marketing Materials',
                  'Training & Onboarding',
                  'Ongoing Technical Support',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Launch Process</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '1', title: 'Consultation', desc: 'We discuss your requirements and business goals.' },
              { step: '2', title: 'Customization', desc: 'Brand customization and feature configuration.' },
              { step: '3', title: 'Integration', desc: 'Technical setup and testing.' },
              { step: '4', title: 'Launch', desc: 'Go live with training and support.' },
            ].map(({ step, title, desc }) => (
              <div key={title} className="text-center">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">
                  {step}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-6">Ready to Launch Your Brokerage?</h2>
          <p className="text-gray-500 text-lg mb-8">
            Join successful brokers using our white-label solution. Schedule a consultation today.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/auth/register"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              Schedule Consultation
            </a>
            <a
              href="/contact"
              className="border border-gray-300 hover:border-blue-600 text-gray-900 font-semibold px-8 py-3.5 rounded-lg transition-colors"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
