import LandingHeader from '@/components/landing/LandingHeader'
import LandingFooter from '@/components/landing/LandingFooter'

export const metadata = { title: 'Terms of Service — ProTrader' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingHeader />

      <section className="bg-gradient-to-b from-white to-gray-50 pt-16 pb-12">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-gray-500">Last updated: March 2026</p>
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 space-y-10">

          <Section title="1. Agreement to Terms">
            By accessing and using the ProTrader platform, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
          </Section>

          <Section title="2. Use License">
            Permission is granted to temporarily download one copy of the materials on ProTrader&apos;s website for personal, non-commercial transitory viewing only. Under this license you may not:
            <List items={[
              'Modify or copy the materials',
              'Use the materials for any commercial purpose or for any public display',
              'Attempt to decompile or reverse engineer any software contained on the platform',
              'Remove any copyright or other proprietary notations from the materials',
              'Transfer the materials to another person or "mirror" them on any other server',
              'Use automated tools to access the platform without authorization',
            ]} />
          </Section>

          <Section title="3. Account Registration">
            To use our trading platform, you must:
            <List items={[
              'Be at least 18 years old',
              'Provide accurate and complete information',
              'Maintain the confidentiality of your account credentials',
              'Accept responsibility for all activities under your account',
              'Comply with all applicable laws and regulations',
              'Pass our KYC/AML verification process',
            ]} />
          </Section>

          <Section title="4. Trading Terms">
            <Sub title="Account Funding">
              Minimum deposit is $25. You are responsible for ensuring funds are transferred from a legitimate source in your name. We reserve the right to reject deposits from third parties.
            </Sub>
            <Sub title="Trading Restrictions">
              We reserve the right to:
              <List items={[
                'Restrict or close accounts engaged in abusive trading practices',
                'Cancel orders that violate our policies',
                'Adjust leverage based on account activity',
                'Refuse service to residents of certain jurisdictions',
              ]} />
            </Sub>
            <Sub title="Spreads and Commissions">
              Spreads and commissions are subject to change without notice. Current rates are displayed on the platform. Trading costs may vary based on market conditions and account type.
            </Sub>
          </Section>

          <Section title="5. Withdrawals">
            Withdrawal requests must be submitted through your account dashboard. We process withdrawals within 24 hours. Cryptocurrency withdrawals are typically processed within 1 hour. You may only withdraw to the payment method used for deposit, except for cryptocurrency withdrawals which can go to any wallet address you specify.
          </Section>

          <Section title="6. Limitation of Liability">
            ProTrader and its officers, directors, employees, and agents will not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the platform, including but not limited to trading losses, even if we have been advised of the possibility of such damages.
          </Section>

          <Section title="7. Prohibited Activities">
            You agree not to:
            <List items={[
              'Engage in money laundering or terrorist financing',
              'Use the platform for illegal activities',
              'Manipulate prices or engage in market abuse',
              'Harass or threaten our staff',
              'Attempt to gain unauthorized access to the platform',
              'Share your account credentials with others',
              'Use automated trading bots without authorization',
            ]} />
          </Section>

          <Section title="8. Dispute Resolution">
            Any disputes arising from these terms shall be governed by the laws of St. Lucia. Both parties agree to submit to the exclusive jurisdiction of the courts of St. Lucia.
          </Section>

          <Section title="9. Modifications to Terms">
            ProTrader reserves the right to modify these terms at any time. Changes will be effective immediately upon posting to the website. Your continued use of the platform constitutes acceptance of modified terms.
          </Section>

          <Section title="10. Contact Information">
            For questions about these Terms of Service, please contact:
            <ContactBox team="Legal Team" email="legal@protrader.com" />
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

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
      {children}
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
