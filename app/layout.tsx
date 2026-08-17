import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import SiteHeader from '@/components/SiteHeader';
import './globals.css';

// 400 is required: the body / body-sm / caption type scale is all fontWeight 400, and
// without it the browser silently substitutes 500 for every line of body copy.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export const metadata: Metadata = {
  title: 'Job Tracker',
  description: 'A personal job application tracker.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} bg-canvas font-sans text-ink antialiased`}>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
