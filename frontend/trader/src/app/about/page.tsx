import LandingHeader from '@/components/landing/LandingHeader'
import LandingFooter from '@/components/landing/LandingFooter'
import { Users, Target, Shield, Globe } from 'lucide-react'

export const metadata = { title: 'About Us — ProTrader' }

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingHeader />

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-gray-50 pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            About ProTrader<br />
            <span className="text-blue-600">Revolutionizing Global Trading</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            We're on a mission to democratize trading by providing everyone with institutional-grade tools, transparent pricing, and complete financial freedom.
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Our Story</h2>
          </div>
          <div className="prose prose-lg max-w-none space-y-6">
            <p className="text-gray-500 leading-relaxed">
              ProTrader was founded with a simple belief: trading should be accessible, transparent, and fair for everyone. We saw traders struggling with high fees, slow withdrawals, and limited access to global markets. We decided to change that.
            </p>
            <p className="text-gray-500 leading-relaxed">
              Today, ProTrader serves thousands of traders across 150+ countries, providing them with the tools and freedom they deserve. We're not just a broker—we're a movement toward financial independence.
            </p>
            <p className="text-gray-500 leading-relaxed">
              Our commitment is simple: provide the best trading experience with zero compromises on security, speed, or transparency.
            </p>
          </div>
        </div>
      </section>

      {/* Our Vision */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Our Vision</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              To become the world's most trusted trading platform by putting traders first.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Users, title: 'Trader-First', desc: 'Every decision we make starts with what\'s best for our traders.' },
              { icon: Target, title: 'Innovation', desc: 'Continuously pushing boundaries with cutting-edge technology.' },
              { icon: Shield, title: 'Trust', desc: 'Building long-term relationships through transparency and reliability.' },
              { icon: Globe, title: 'Global Access', desc: 'Making institutional-grade trading available to everyone, everywhere.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">By the Numbers</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { value: '150+', label: 'Countries Served' },
              { value: '50K+', label: 'Active Traders' },
              { value: '$500M+', label: 'Daily Volume' },
              { value: '99.9%', label: 'Uptime' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-4xl font-extrabold text-blue-600 mb-2">{value}</div>
                <div className="text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Leadership Team</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Led by industry veterans from top financial institutions and technology companies.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { name: 'Alex Chen', role: 'CEO & Co-Founder', desc: 'Former Goldman Sachs trader with 15+ years in institutional trading.' },
              { name: 'Sarah Johnson', role: 'CTO & Co-Founder', desc: 'Tech lead at Bloomberg, expert in low-latency trading systems.' },
              { name: 'Michael Roberts', role: 'Head of Compliance', desc: 'Former SEC regulator, ensures full regulatory compliance globally.' },
            ].map(({ name, role, desc }) => (
              <div key={name} className="bg-white rounded-xl p-8 border border-gray-200">
                <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4" />
                <h3 className="font-bold text-gray-900 text-center mb-2">{name}</h3>
                <p className="text-blue-600 text-center text-sm font-semibold mb-3">{role}</p>
                <p className="text-gray-500 text-sm text-center">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
