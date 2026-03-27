import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/components/ThemeProvider';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import { AuthProvider } from '@/components/providers/AuthProvider';

export const metadata: Metadata = {
  title: 'ProTrader',
  description: 'Professional forex and CFD trading platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#F2EFE9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('protrader-ui');var t='light';if(s){var j=JSON.parse(s);t=(j&&j.state&&j.state.theme)||(j&&j.theme)||'light';}var d=document.documentElement;d.setAttribute('data-theme',t);d.classList.add(t==='light'?'theme-light':'theme-dark');if(t==='light'){d.style.backgroundColor='#F2EFE9';d.style.color='#000000';}else{d.style.backgroundColor='#000000';d.style.color='#E8EAED';}}catch(e){document.documentElement.setAttribute('data-theme','light');document.documentElement.style.backgroundColor='#F2EFE9';document.documentElement.style.color='#000000';}})();`,
          }}
        />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <MobileBottomNav />
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  fontSize: '13px',
                  borderRadius: '8px',
                },
                success: { iconTheme: { primary: '#2962FF', secondary: '#E8EAED' } },
                error: { iconTheme: { primary: '#FF2440', secondary: '#E8EAED' } },
              }}
            />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
