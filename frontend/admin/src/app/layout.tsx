import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ThemeInitScript from '@/components/ThemeInitScript';
import AppToaster from '@/components/AppToaster';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ProTrader Admin',
  description: 'ProTrader broker administration panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable} style={{ '--font-jetbrains': "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace" } as React.CSSProperties}>
      <body className={`${inter.className} min-h-screen bg-bg-primary text-text-primary antialiased`}>
        <ThemeInitScript />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
