import LandingHeader from '@/components/landing/LandingHeader'
import LandingFooter from '@/components/landing/LandingFooter'
import { AlertTriangle } from 'lucide-react'

export const metadata = { title: 'Risk Disclosure — ProTrader' }

export default function RiskPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingHeader />

      <section className="bg-gradient-to-b from-white to-gray-50 pt-16 pb-12">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Risk Disclosure</h1>
          <p className="text-gray-500">Last updated: March 2026</p>
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 space-y-10">

          {/* Warning banner */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900 mb-1">Important Risk Warning</h3>
              <p className="text-red-800 text-sm leading-relaxed">
                Trading foreign exchange, cryptocurrencies, and other leveraged instruments carries a high level of risk and may not be suitable for all investors. You may lose some or all of your invested capital. Past performance is not indicative of future results.
              </p>
            </div>
          </div>

          <Section title="1. Leverage Risk">
            ProTrader offers leverage up to 1:500 on certain instruments. Leverage amplifies both gains and losses. A small adverse price movement can result in substantial losses or even the complete loss of your deposit.
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4 text-sm text-gray-500">
              <strong className="text-gray-800">Example:</strong> With 1:100 leverage, a 1% adverse price movement results in a 100% loss of your margin.
            </div>
          </Section>

          <Section title="2. Market Risk">
            Financial markets are volatile and unpredictable. Prices can move rapidly due to:
            <List items={[
              'Economic data releases and central bank announcements',
              'Geopolitical events and political instability',
              'Market sentiment shifts and investor behavior',
              'Supply and demand imbalances',
              'Regulatory changes and policy decisions',
              'Cryptocurrency volatility and technological changes',
            ]} />
          </Section>

          <Section title="3. Liquidity Risk">
            While major currency pairs are highly liquid, some instruments may have limited liquidity. During periods of low liquidity, you may experience:
            <List items={[
              'Wider bid-ask spreads',
              'Slippage on order execution',
              'Difficulty closing positions at desired prices',
              'Increased trading costs',
            ]} />
          </Section>

          <Section title="4. Counterparty Risk">
            Your trades are executed through ProTrader&apos;s liquidity providers. If a liquidity provider defaults or experiences financial difficulties, your funds may be at risk despite our segregated account structure.
          </Section>

          <Section title="5. Technology Risk">
            Trading platforms are subject to technical failures, including:
            <List items={[
              'Server outages and connectivity issues',
              'Platform bugs and software errors',
              'Cyber attacks and security breaches',
              'Internet connection failures on your end',
              'Mobile app crashes and malfunctions',
            ]} />
            <p className="mt-4">While we maintain redundant systems and backups, we cannot guarantee 100% uptime. Trading during periods of technical difficulty may result in losses.</p>
          </Section>

          <Section title="6. Cryptocurrency Risk">
            Cryptocurrency trading carries additional risks:
            <List items={[
              'Extreme price volatility (50%+ daily moves are possible)',
              'Regulatory uncertainty and potential bans',
              'Wallet and exchange security risks',
              'Blockchain network congestion and delays',
              'Limited historical data and price discovery',
              'Potential for total loss of investment',
            ]} />
          </Section>

          <Section title="7. Operational Risk">
            Risks related to our operations include:
            <List items={[
              'Human error in order processing',
              'System failures and data loss',
              'Fraud and unauthorized access',
              'Regulatory enforcement actions',
              'Changes in business operations',
            ]} />
          </Section>

          <Section title="8. Regulatory Risk">
            Financial regulations are subject to change. Changes in regulations could:
            <List items={[
              'Restrict trading in certain instruments',
              'Reduce maximum leverage available',
              'Increase trading costs through new fees',
              'Require account closure for certain jurisdictions',
              'Affect platform availability in your country',
            ]} />
          </Section>

          <Section title="9. Negative Balance Protection">
            While ProTrader offers negative balance protection, meaning your account cannot go below zero, this protection may not apply in all circumstances, including:
            <List items={[
              'Extreme market gaps and flash crashes',
              'System failures during market volatility',
              'Violations of our terms of service',
            ]} />
          </Section>

          <Section title="10. Risk Management Best Practices">
            To manage trading risks:
            <List items={[
              'Only trade with capital you can afford to lose',
              'Use stop-loss orders to limit potential losses',
              'Diversify your portfolio across multiple instruments',
              'Avoid over-leveraging your account',
              'Keep up with economic news and market developments',
              'Develop and follow a trading plan',
              'Avoid emotional decision-making',
              'Start with a demo account to practice',
              'Educate yourself about markets and trading',
            ]} />
          </Section>

          <Section title="11. Acknowledgment">
            By opening an account with ProTrader, you acknowledge that you have read and understood this Risk Disclosure, and you accept all risks associated with trading on our platform. You confirm that you are trading at your own risk and that ProTrader is not responsible for any losses incurred.
          </Section>

          <Section title="12. Contact Information">
            For questions about risk management or this disclosure, please contact:
            <ContactBox team="Risk Management Team" email="risk@protrader.com" />
          </Section>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>
      <div className="text-gray-500 leading-relaxed space-y-3">{children}</div>
    </div>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1.5 mt-2 text-gray-500">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}

function ContactBox({ team, email }: { team: string; email: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mt-4 text-sm space-y-1">
      <p className="font-semibold text-gray-900">ProTrader {team}</p>
      <p className="text-gray-500">Email: {email}</p>
      <p className="text-gray-500">Phone: +1 (908) 228-0305</p>
      <p className="text-gray-500">Address: Office 9364hn, 3 Fitzroy Place, Glasgow City Centre, UK, G3 7RH</p>
    </div>
  )
}
