import Link from 'next/link'
import Image from 'next/image'
import { Phone } from 'lucide-react'

export default function LandingFooter() {
  return (
    <footer className="bg-white border-t border-gray-200 py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
          <div className="lg:col-span-2">
            <Image
              src="https://vgbujcuwptvheqijyjbe.supabase.co/storage/v1/object/public/hmac-uploads/uploads/168dde75-17e5-4e37-a49d-32737bd908dd/1774370971935-4e1057bd/logo.png"
              alt="ProTrader"
              width={120}
              height={36}
              className="h-9 w-auto mb-4"
            />
            <p className="text-gray-500 text-sm leading-relaxed mb-3 max-w-sm">
              Professional multi-asset trading platform. Licensed under Investment Dealer Licence No. MAK21098161, St. Lucia.
            </p>
            <p className="text-gray-500 text-sm">
              <span className="font-medium text-gray-900">UK Office:</span><br />
              Office 9364hn, 3 Fitzroy Place, Glasgow City Centre, UK, G3 7RH
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-4">Products</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/platforms" className="hover:text-blue-600 transition-colors">Trading Platforms</Link></li>
              <li><Link href="/white-label" className="hover:text-blue-600 transition-colors">White Label</Link></li>
              <li><Link href="/auth/register" className="hover:text-blue-600 transition-colors">Open Live Account</Link></li>
              <li><Link href="/auth/register" className="hover:text-blue-600 transition-colors">Demo Account</Link></li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-4">Company</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/about" className="hover:text-blue-600 transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-blue-600 transition-colors">Contact</Link></li>
              <li><Link href="/white-label" className="hover:text-blue-600 transition-colors">Partnerships</Link></li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-4">Support</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/contact" className="hover:text-blue-600 transition-colors">Contact Support</Link></li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 shrink-0" />
                <span>+1 (908) 228-0305</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-400 text-sm">&copy; {new Date().getFullYear()} ProTrader. All rights reserved.</p>
          <div className="flex items-center gap-5 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-blue-600 transition-colors">Terms of Service</Link>
            <Link href="/risk" className="hover:text-blue-600 transition-colors">Risk Disclosure</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
