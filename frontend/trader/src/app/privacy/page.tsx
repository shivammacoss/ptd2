import LandingHeader from '@/components/landing/LandingHeader'
import LandingFooter from '@/components/landing/LandingFooter'

export const metadata = { title: 'Privacy Policy — ProTrader' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingHeader />

      <section className="bg-gradient-to-b from-white to-gray-50 pt-16 pb-12">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-500">Last updated: March 2026</p>
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 space-y-10">

          <Section title="1. Introduction">
            ProTrader ("we," "us," "our," or "Company") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our trading platform.
          </Section>

          <Section title="2. Information We Collect">
            <Sub title="Personal Information">
              We collect information you provide directly, including:
              <List items={[
                'Full name, email address, and phone number',
                'Date of birth and identification documents',
                'Address and residency information',
                'Banking and payment information',
                'Trading preferences and account settings',
              ]} />
            </Sub>
            <Sub title="Automatically Collected Information">
              When you use our platform, we automatically collect:
              <List items={[
                'IP address and device information',
                'Browser type and operating system',
                'Pages visited and time spent on pages',
                'Trading activity and transaction history',
                'Cookies and similar tracking technologies',
              ]} />
            </Sub>
          </Section>

          <Section title="3. How We Use Your Information">
            We use the information we collect for the following purposes:
            <List items={[
              'To provide, maintain, and improve our trading platform',
              'To process your deposits, withdrawals, and trades',
              'To verify your identity and comply with KYC/AML regulations',
              'To communicate with you about your account and services',
              'To send promotional emails and marketing communications',
              'To detect and prevent fraud and unauthorized access',
              'To comply with legal obligations and regulatory requirements',
              'To analyze platform usage and improve user experience',
            ]} />
          </Section>

          <Section title="4. Data Security">
            We implement industry-standard security measures to protect your personal information, including:
            <List items={[
              'SSL/TLS encryption for all data in transit',
              'AES-256 encryption for sensitive data at rest',
              'Regular security audits and penetration testing',
              'Segregated client funds in separate bank accounts',
              'Multi-factor authentication for account access',
              'Restricted access to personal information by authorized personnel only',
            ]} />
            <p className="mt-4 text-gray-500">However, no method of transmission over the Internet is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.</p>
          </Section>

          <Section title="5. Information Sharing">
            We may share your information with:
            <List items={[
              'Payment processors and financial institutions',
              'Regulatory authorities and government agencies',
              'Third-party service providers (hosting, analytics, customer support)',
              'Legal advisors and compliance consultants',
              'Fraud prevention and identity verification services',
            ]} />
            <p className="mt-4 text-gray-500">We do not sell your personal information to third parties for marketing purposes.</p>
          </Section>

          <Section title="6. Your Rights">
            You have the right to:
            <List items={[
              'Access your personal information',
              'Correct inaccurate or incomplete information',
              'Request deletion of your information (subject to legal requirements)',
              'Opt-out of marketing communications',
              'Request a copy of your data in a portable format',
              'Lodge a complaint with regulatory authorities',
            ]} />
          </Section>

          <Section title="7. Cookies and Tracking">
            We use cookies and similar technologies to enhance your experience. You can control cookie settings through your browser preferences. Disabling cookies may affect platform functionality.
          </Section>

          <Section title="8. Data Retention">
            We retain your personal information for as long as necessary to provide our services and comply with legal obligations. Trading records are retained for a minimum of 7 years as required by financial regulations.
          </Section>

          <Section title="9. Contact Us">
            If you have questions about this Privacy Policy or our privacy practices, please contact us:
            <ContactBox team="Privacy Team" email="privacy@protrader.com" />
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
